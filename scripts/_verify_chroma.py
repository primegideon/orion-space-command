import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
import textwrap, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

client = chromadb.PersistentClient(path="data/chroma_db")
ef = SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")
col = client.get_collection("archivist", embedding_function=ef)
print(f"Collection count: {col.count()}")

results = col.query(query_texts=["near-Earth asteroid close approach"], n_results=3)
for i, (doc, meta) in enumerate(zip(results["documents"][0], results["metadatas"][0]), 1):
    snippet = textwrap.shorten(doc, width=100, placeholder="...")
    src = meta["source"]
    print(f"  [{i}] source={src!r}")
    print(f"      {snippet}")
