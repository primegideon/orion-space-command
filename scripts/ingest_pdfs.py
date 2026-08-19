"""
ORION - Phase 4
Ingestion script: Docling parse -> chunk -> embed -> persist to Chroma.

Run once (or re-run to refresh):
    python scripts/ingest_pdfs.py

Prerequisites (already in requirements.txt):
    pip install docling chromadb sentence-transformers
"""
import io
import os
import sys
import textwrap

# Force UTF-8 output on Windows consoles
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "data" / "pdfs"
CHROMA_DIR = ROOT / "data" / "chroma_db"
COLLECTION_NAME = "archivist"

# ---------------------------------------------------------------------------
# Chunk settings
# ---------------------------------------------------------------------------
CHUNK_SIZE = 512       # characters (approx 128 tokens for short-word text)
CHUNK_OVERLAP = 64     # character overlap between consecutive chunks


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping fixed-size character chunks."""
    if not text.strip():
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start += size - overlap
    return chunks


def pdf_slug(pdf_path: Path) -> str:
    """Return a human-readable source label from the filename stem."""
    # Filename pattern: <slug>__<arxiv_id>.pdf
    stem = pdf_path.stem
    if "__" in stem:
        slug, arxiv_id = stem.split("__", 1)
        return f"{slug} (arXiv:{arxiv_id})"
    return stem


def main():
    # ------------------------------------------------------------------
    # 1. Discover PDFs
    # ------------------------------------------------------------------
    if not PDF_DIR.exists():
        print(f"[err] PDF directory not found: {PDF_DIR}", file=sys.stderr)
        print("      Run scripts/download_pdfs.py first.", file=sys.stderr)
        sys.exit(1)

    pdf_files = sorted(PDF_DIR.glob("*.pdf"))
    if not pdf_files:
        print(f"[err] No PDFs found in {PDF_DIR}", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(pdf_files)} PDF(s) in {PDF_DIR}")

    # ------------------------------------------------------------------
    # 2. Parse with Docling
    # ------------------------------------------------------------------
    print("\n[1/3] Parsing PDFs with Docling …")
    from docling.document_converter import DocumentConverter  # type: ignore

    converter = DocumentConverter()
    documents: list[dict] = []  # {"source": str, "text": str}

    for pdf_path in pdf_files:
        source = pdf_slug(pdf_path)
        print(f"  parsing {pdf_path.name} …", end=" ", flush=True)
        try:
            result = converter.convert(str(pdf_path))
            text = result.document.export_to_markdown()
            char_count = len(text)
            print(f"{char_count:,} chars")
            documents.append({"source": source, "text": text})
        except Exception as exc:
            print(f"FAILED — {exc}", file=sys.stderr)
            # Skip this file but continue with others
            continue

    if not documents:
        print("[err] No documents parsed successfully.", file=sys.stderr)
        sys.exit(1)

    # ------------------------------------------------------------------
    # 3. Chunk
    # ------------------------------------------------------------------
    print(f"\n[2/3] Chunking ({CHUNK_SIZE}-char window, {CHUNK_OVERLAP}-char overlap) …")
    all_chunks: list[str] = []
    all_metadata: list[dict] = []
    all_ids: list[str] = []

    for doc in documents:
        chunks = chunk_text(doc["text"])
        for i, chunk in enumerate(chunks):
            all_chunks.append(chunk)
            all_metadata.append({"source": doc["source"]})
            all_ids.append(f"{doc['source']}::{i}")

    print(f"  Total chunks: {len(all_chunks):,}")

    # ------------------------------------------------------------------
    # 4. Embed & persist with Chroma
    # ------------------------------------------------------------------
    print("\n[3/3] Embedding and persisting to Chroma …")
    print(f"  Chroma path: {CHROMA_DIR}")
    print("  Embedding model: sentence-transformers/all-MiniLM-L6-v2  (local, no API cost)")

    import chromadb  # type: ignore
    from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction  # type: ignore

    CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))

    embed_fn = SentenceTransformerEmbeddingFunction(
        model_name="all-MiniLM-L6-v2"
    )

    # Delete existing collection so re-runs start fresh
    try:
        client.delete_collection(COLLECTION_NAME)
        print(f"  (deleted existing '{COLLECTION_NAME}' collection)")
    except Exception:
        pass

    collection = client.create_collection(
        name=COLLECTION_NAME,
        embedding_function=embed_fn,
        metadata={"hnsw:space": "cosine"},
    )

    # Upsert in batches of 100 to avoid OOM on large corpora
    BATCH = 100
    for i in range(0, len(all_chunks), BATCH):
        batch_docs = all_chunks[i : i + BATCH]
        batch_meta = all_metadata[i : i + BATCH]
        batch_ids = all_ids[i : i + BATCH]
        collection.add(documents=batch_docs, metadatas=batch_meta, ids=batch_ids)
        end_idx = min(i + BATCH, len(all_chunks))
        print(f"  upserted {end_idx:,}/{len(all_chunks):,} chunks …", end="\r", flush=True)

    print()  # newline after \r progress

    final_count = collection.count()
    print(f"\n  Collection '{COLLECTION_NAME}' contains {final_count:,} documents.")

    # ------------------------------------------------------------------
    # 5. Sanity query
    # ------------------------------------------------------------------
    print("\n--- Sanity query: 'near-Earth asteroid close approach' ---")
    results = collection.query(
        query_texts=["near-Earth asteroid close approach"],
        n_results=3,
    )
    for rank, (doc, meta) in enumerate(
        zip(results["documents"][0], results["metadatas"][0]), start=1
    ):
        snippet = textwrap.shorten(doc, width=120, placeholder="…")
        print(f"  [{rank}] source={meta['source']!r}")
        print(f"      {snippet}")

    print("\n[done] Ingestion complete.")


if __name__ == "__main__":
    main()
