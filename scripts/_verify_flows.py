import json, pathlib
for p in sorted(pathlib.Path("langflow/flows").glob("*.json")):
    d = json.loads(p.read_text(encoding="utf-8"))
    nodes = d["data"]["nodes"]
    types = [n["data"]["type"] for n in nodes]
    print(p.name, "nodes:", len(nodes), "types:", types, "id:", d["id"][:8])
