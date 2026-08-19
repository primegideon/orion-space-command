# Phase 4 — Archivist RAG Pipeline Setup

## Overview

Phase 4 wires up the Archivist agent: a full RAG pipeline over curated arXiv astrophysics PDFs.
IBM Docling parses the PDFs, `sentence-transformers/all-MiniLM-L6-v2` embeds the chunks locally,
and Chroma persists the vectors to disk at `./data/chroma_db/`.

---

## Step 1 — Download PDFs

```bash
python scripts/download_pdfs.py
```

Downloads 8 curated arXiv papers into `./data/pdfs/`.  
Sources are documented in [`./data/README.md`](../data/README.md).

---

## Step 2 — Run the Ingestion Script

```bash
python scripts/ingest_pdfs.py
```

This script:
1. Parses each PDF using `docling.DocumentConverter` → exports to Markdown.
2. Chunks the text into 512-character segments with 64-character overlap.
3. Embeds all chunks with `all-MiniLM-L6-v2` (runs fully locally, no API key needed).
4. Persists embeddings to `./data/chroma_db/` (Chroma `PersistentClient`).
5. Runs a sanity query and prints the top-3 results.

Re-running the script **replaces** the collection from scratch (idempotent).

---

## Step 3 — Add the Custom Component to Langflow

1. Open Langflow at `http://localhost:7861`.
2. Navigate to the **Archivist flow** (`archivist-flow.json`).
3. Click **Custom Component** → paste the contents of  
   [`./components/archivist_retriever.py`](components/archivist_retriever.py).
4. The component will appear as **"Archivist — RAG Retriever"** in the canvas.

### Component Inputs

| Input | Default | Description |
|-------|---------|-------------|
| User Query | _(required)_ | Connect to Chat Input |
| Top K | `5` | Number of chunks to retrieve |
| Chroma Directory | `./data/chroma_db` | Path to persisted Chroma DB |
| Collection Name | `archivist` | Chroma collection name |
| Embedding Model | `all-MiniLM-L6-v2` | sentence-transformers model |

### Component Output

Returns a `Message` whose `.text` is a JSON object:

```json
{
  "agent": "archivist",
  "query": "what causes solar flares?",
  "chunks": [
    { "source": "solar_flare_forecasting_ml (arXiv:2209.00789)", "text": "…" }
  ],
  "sources": ["solar_flare_forecasting_ml (arXiv:2209.00789)"],
  "context_text": "[Source: …]\n…\n\n---\n\n[Source: …]\n…",
  "answer": ""
}
```

---

## Step 4 — Wire the Archivist Flow

Connect the nodes in this order:

```
ChatInput
    └─► ArchivistRetriever  (custom component)
            └─► Prompt Node
                    │  System: "You are the Archivist. Answer based only on the
                    │           provided context. Cite sources by name."
                    │  Context: {context_text}  (from retriever output)
                    │  Question: {query}
                    └─► watsonx Granite LLM
                                └─► ChatOutput
```

The Prompt node should produce something like:
```
You are the Archivist, an AI assistant specialising in astrophysics research.
Answer the following question using ONLY the context provided below.
At the end, list the source papers you drew from.

Context:
{context_text}

Question: {query}
```

---

## Step 5 — Export the Updated Flow

In Langflow: **Settings → Export → Save as** `./langflow/flows/archivist-flow.json`

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Collection archivist does not exist` | Run `python scripts/ingest_pdfs.py` first |
| Slow first query | The embedding model downloads on first use (~90 MB) — subsequent calls are instant |
| `ModuleNotFoundError: docling` | Run `pip install docling` in the `.venv` |
| `ModuleNotFoundError: chromadb` | Run `pip install chromadb` in the `.venv` |
| PDF parse returns empty text | Docling may not support scanned PDFs; all papers in `./data/pdfs/` are text-based arXiv PDFs |
