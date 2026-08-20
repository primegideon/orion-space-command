"""
ORION V2 -- Pillar 2
Migrate Chroma embeddings to Supabase pgvector

Prerequisites:
    pip install supabase chromadb

Usage (PowerShell -- activate venv first):
    $env:SUPABASE_URL               = "https://your-project.supabase.co"
    $env:SUPABASE_SERVICE_ROLE_KEY  = "your-service-role-key"
    python scripts/migrate_to_supabase.py
"""
import io
import os
import sys

# Force UTF-8 output on Windows consoles
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHROMA_DIR = ROOT / "data" / "chroma_db"
COLLECTION_NAME = "archivist"
BATCH_SIZE = 50


def main() -> None:
    # ── 1. Validate environment ────────────────────────────────────────────
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_key:
        print("[err] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.", file=sys.stderr)
        print("      $env:SUPABASE_URL = 'https://...'", file=sys.stderr)
        print("      $env:SUPABASE_SERVICE_ROLE_KEY = 'eyJ...'", file=sys.stderr)
        sys.exit(1)

    if not CHROMA_DIR.exists():
        print(f"[err] Chroma DB not found at {CHROMA_DIR}", file=sys.stderr)
        print("      Run scripts/ingest_pdfs.py first.", file=sys.stderr)
        sys.exit(1)

    # ── 2. Load from Chroma ────────────────────────────────────────────────
    print(f"Loading Chroma collection '{COLLECTION_NAME}' from {CHROMA_DIR} ...")
    import chromadb  # type: ignore

    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    try:
        collection = client.get_collection(COLLECTION_NAME)
    except Exception as exc:
        print(f"[err] Could not open Chroma collection: {exc}", file=sys.stderr)
        sys.exit(1)

    print("  Fetching all chunks and embeddings ...")
    result = collection.get(include=["documents", "metadatas", "embeddings"])

    documents = result["documents"]
    metadatas = result["metadatas"]
    raw_embeddings = result["embeddings"]

    total = len(documents)
    print(f"  Found {total:,} chunks in Chroma.\n")

    if total == 0:
        print("[err] Chroma collection is empty -- nothing to migrate.", file=sys.stderr)
        sys.exit(1)

    # Convert numpy ndarrays to plain Python lists (required for JSON serialisation)
    embeddings = [
        emb.tolist() if hasattr(emb, "tolist") else list(emb)
        for emb in raw_embeddings
    ]

    # ── 3. Connect to Supabase ─────────────────────────────────────────────
    print("Connecting to Supabase ...")
    from supabase import create_client  # type: ignore

    sb = create_client(supabase_url, service_key)
    print("  Connected.\n")

    # ── 4. Clear existing rows ─────────────────────────────────────────────
    print("Clearing existing research_embeddings rows ...")
    try:
        sb.table("research_embeddings").delete().neq("id", 0).execute()
        print("  Cleared.\n")
    except Exception as exc:
        print(f"  Warning: could not clear existing rows: {exc}")
        print("  Proceeding -- duplicates may result if rows already exist.\n")

    # ── 5. Insert in batches ───────────────────────────────────────────────
    print(f"Inserting {total:,} chunks in batches of {BATCH_SIZE} ...")
    inserted = 0

    for batch_start in range(0, total, BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE, total)
        rows = []
        for j in range(batch_start, batch_end):
            source = metadatas[j].get("source", "unknown")
            chunk_index = sum(
                1 for k in range(j) if metadatas[k].get("source") == source
            )
            rows.append({
                "source": source,
                "chunk_index": chunk_index,
                "content": documents[j],
                "embedding": embeddings[j],  # plain list[float]
            })

        try:
            sb.table("research_embeddings").insert(rows).execute()
            inserted += len(rows)
            print(f"  {inserted:,}/{total:,} chunks inserted ...", end="\r", flush=True)
        except Exception as exc:
            print(f"\n[err] Batch {batch_start}-{batch_end} failed: {exc}", file=sys.stderr)
            print("      Continuing with next batch ...")

    print(f"\n  Done. {inserted:,} chunks inserted.\n")

    # ── 6. Verify ──────────────────────────────────────────────────────────
    print("Verifying row count in Supabase ...")
    try:
        count_res = (
            sb.table("research_embeddings")
            .select("id", count="exact")
            .execute()
        )
        count = count_res.count
        print(f"  research_embeddings contains {count:,} rows.")
        if count != total:
            print(f"  Warning: expected {total:,} but got {count:,}.")
        else:
            print("  Migration verified OK")
    except Exception as exc:
        print(f"  Could not verify count: {exc}")

    # ── 7. Smoke test RPC ──────────────────────────────────────────────────
    print("\nSmoke-testing match_embeddings RPC ...")
    try:
        rpc_res = sb.rpc(
            "match_embeddings",
            {
                "query_embedding": embeddings[0],
                "match_count": 3,
                "match_threshold": 0.5,
            },
        ).execute()
        hits = rpc_res.data or []
        print(f"  RPC returned {len(hits)} hit(s).")
        for i, hit in enumerate(hits[:3], 1):
            print(f"  [{i}] source={hit['source']!r}  similarity={hit['similarity']:.4f}")
        print("  Smoke test passed OK")
    except Exception as exc:
        print(f"  RPC smoke test failed: {exc}")
        print("  Make sure supabase_schema.sql has been run in the Supabase SQL editor.")

    print("\n[done] Migration complete.")
    print("       Next: add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to Vercel env vars.")


if __name__ == "__main__":
    main()
