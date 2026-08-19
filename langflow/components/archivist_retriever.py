"""
ORION — Archivist RAG Retriever Custom Component
Langflow 1.11.x — paste this file into the Custom Component editor.

Flow position:
  ChatInput → [this node] → LanguageModelComponent → ChatOutput

The component loads the persisted Chroma collection from ./data/chroma_db/
and returns the top-k matching chunks for a given query string.
"""
import json
import os
from pathlib import Path

from langflow.custom import Component
from langflow.io import IntInput, MessageTextInput, Output, StrInput
from langflow.schema.message import Message

# ---------------------------------------------------------------------------
# Default paths — relative to the workspace root where Langflow is launched.
# Override via component inputs if needed.
# ---------------------------------------------------------------------------
_DEFAULT_CHROMA_DIR = str(
    Path(__file__).resolve().parent.parent.parent / "data" / "chroma_db"
)
_DEFAULT_COLLECTION = "archivist"
_DEFAULT_EMBED_MODEL = "all-MiniLM-L6-v2"


class ArchivistRetriever(Component):
    display_name = "Archivist — RAG Retriever"
    description = (
        "Queries a persisted Chroma vector store of astrophysics papers "
        "and returns the top-k relevant chunks for use in a RAG pipeline."
    )
    icon = "book-open"

    inputs = [
        MessageTextInput(
            name="user_query",
            display_name="User Query",
            info="The user's question. Connect Chat Input here.",
            required=True,
        ),
        IntInput(
            name="top_k",
            display_name="Top K",
            info="Number of chunks to retrieve (default: 5).",
            value=5,
            required=False,
        ),
        StrInput(
            name="chroma_dir",
            display_name="Chroma Directory",
            info="Path to the persisted Chroma DB directory.",
            value=_DEFAULT_CHROMA_DIR,
            required=False,
        ),
        StrInput(
            name="collection_name",
            display_name="Collection Name",
            info="Chroma collection name (default: archivist).",
            value=_DEFAULT_COLLECTION,
            required=False,
        ),
        StrInput(
            name="embed_model",
            display_name="Embedding Model",
            info="sentence-transformers model name (default: all-MiniLM-L6-v2).",
            value=_DEFAULT_EMBED_MODEL,
            required=False,
        ),
    ]

    outputs = [
        Output(
            display_name="Retrieved Context",
            name="retrieved_context",
            method="retrieve",
        )
    ]

    # ------------------------------------------------------------------
    # Internal state — persist the collection across Langflow invocations
    # within the same process so we don't reload embeddings every call.
    # ------------------------------------------------------------------
    _collection = None
    _loaded_dir: str = ""
    _loaded_collection: str = ""
    _loaded_model: str = ""

    def _load_collection(self, chroma_dir: str, collection_name: str, embed_model: str):
        """Load (or reload) the Chroma collection if parameters changed."""
        if (
            self._collection is not None
            and self._loaded_dir == chroma_dir
            and self._loaded_collection == collection_name
            and self._loaded_model == embed_model
        ):
            return  # already loaded with the same settings

        import chromadb  # type: ignore
        from chromadb.utils.embedding_functions import (  # type: ignore
            SentenceTransformerEmbeddingFunction,
        )

        embed_fn = SentenceTransformerEmbeddingFunction(model_name=embed_model)
        client = chromadb.PersistentClient(path=chroma_dir)
        self._collection = client.get_collection(
            name=collection_name,
            embedding_function=embed_fn,
        )
        self._loaded_dir = chroma_dir
        self._loaded_collection = collection_name
        self._loaded_model = embed_model

    def retrieve(self) -> Message:
        query = (self.user_query or "").strip()
        top_k = max(1, self.top_k or 5)
        chroma_dir = self.chroma_dir or _DEFAULT_CHROMA_DIR
        collection_name = self.collection_name or _DEFAULT_COLLECTION
        embed_model = self.embed_model or _DEFAULT_EMBED_MODEL

        if not query:
            payload = {
                "agent": "archivist",
                "chunks": [],
                "sources": [],
                "error": "empty query",
                "answer": "",
            }
            return Message(text=json.dumps(payload))

        try:
            self._load_collection(chroma_dir, collection_name, embed_model)
            results = self._collection.query(
                query_texts=[query],
                n_results=top_k,
            )
        except Exception as exc:
            payload = {
                "agent": "archivist",
                "chunks": [],
                "sources": [],
                "error": str(exc),
                "answer": "",
            }
            return Message(text=json.dumps(payload))

        docs = results["documents"][0]       # list[str]
        metas = results["metadatas"][0]      # list[dict]

        chunks = []
        sources: list[str] = []
        for doc, meta in zip(docs, metas):
            source = meta.get("source", "unknown")
            chunks.append({"source": source, "text": doc})
            if source not in sources:
                sources.append(source)

        # Build a context block suitable for passing to a prompt node
        context_text = "\n\n---\n\n".join(
            f"[Source: {c['source']}]\n{c['text']}" for c in chunks
        )

        payload = {
            "agent": "archivist",
            "query": query,
            "chunks": chunks,
            "sources": sources,
            "context_text": context_text,
            "answer": "",   # filled in by Granite downstream
        }
        return Message(text=json.dumps(payload))
