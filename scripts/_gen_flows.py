"""
Generate correct Langflow 1.11.x flow JSON files for ORION by cloning
the bundled 'Basic Prompting.json' starter and patching node values.

Architecture: ChatInput → LanguageModelComponent → ChatOutput
- The routing/agent instructions go into system_message on the LLM node.
- No Prompt node is used (avoids {variable} KeyError issues).

Run from the project root with .venv activated.
"""
import json, copy, uuid
from pathlib import Path

STARTER = Path(".venv/Lib/site-packages/langflow/initial_setup/starter_projects/Basic Prompting.json")
OUT_DIR = Path("langflow/flows")
OUT_DIR.mkdir(parents=True, exist_ok=True)

with open(STARTER, encoding="utf-8") as f:
    BASE = json.load(f)


def short_id(prefix):
    return prefix + "-" + uuid.uuid4().hex[:5].upper()


def make_flow(name, description, system_message, sender_name):
    flow = copy.deepcopy(BASE)
    flow["name"] = name
    flow["description"] = description
    flow["id"] = str(uuid.uuid4())
    flow["endpoint_name"] = None
    flow["is_component"] = False
    flow["tags"] = ["ORION"]

    nodes = flow["data"]["nodes"]
    edges = flow["data"]["edges"]

    # Keep only the 3 genericNodes we need: ChatInput, LanguageModelComponent, ChatOutput
    # Drop Prompt node and all noteNodes
    nodes[:] = [
        n for n in nodes
        if n.get("type") == "genericNode"
        and n["data"].get("type") in ("ChatInput", "LanguageModelComponent", "ChatOutput")
    ]

    # Assign new IDs and patch values
    id_map = {}
    for n in nodes:
        old_id = n["data"]["id"]
        ntype = n["data"]["type"]
        new_id = short_id(ntype)
        id_map[old_id] = new_id
        n["id"] = new_id
        n["data"]["id"] = new_id

        tmpl = n["data"].get("node", {}).get("template", {})

        if ntype == "ChatOutput":
            if "sender_name" in tmpl:
                tmpl["sender_name"]["value"] = sender_name

        if ntype == "LanguageModelComponent":
            if "model" in tmpl:
                tmpl["model"]["value"] = "meta-llama/llama-4-maverick-17b-128e-instruct-fp8"
            if "project_id" in tmpl:
                tmpl["project_id"]["value"] = ""
                tmpl["project_id"]["load_from_db"] = False
            if "api_key" in tmpl:
                tmpl["api_key"]["value"] = ""
            if "system_message" in tmpl:
                tmpl["system_message"]["value"] = system_message
            if "stream" in tmpl:
                tmpl["stream"]["value"] = False  # disable streaming — avoids async/sync conflict
            if "_frontend_node_flow_id" in tmpl:
                tmpl["_frontend_node_flow_id"]["value"] = flow["id"]

    def remap(s):
        for old, new in id_map.items():
            s = s.replace(old, new)
        return s

    # Rebuild edges: only keep edges whose source AND target are in our 3-node set
    # Also rebuild the direct ChatInput → LLM edge (input_value)
    new_edges = []
    for e in edges:
        if e["source"] not in id_map or e["target"] not in id_map:
            continue
        # Skip any edge that went through the Prompt node (old_ids no longer in id_map handled above)
        ne = copy.deepcopy(e)
        ne["source"] = id_map[e["source"]]
        ne["target"] = id_map[e["target"]]
        ne["id"] = remap(e["id"])
        ne["sourceHandle"] = remap(e["sourceHandle"])
        ne["targetHandle"] = remap(e["targetHandle"])
        if "data" in ne:
            sh = ne["data"].get("sourceHandle", {})
            th = ne["data"].get("targetHandle", {})
            if "id" in sh:
                sh["id"] = id_map.get(sh["id"], sh["id"])
            if "id" in th:
                th["id"] = id_map.get(th["id"], th["id"])
        new_edges.append(ne)

    flow["data"]["edges"] = new_edges
    flow["data"]["nodes"] = nodes
    return flow


# ── ORION Master Router ────────────────────────────────────────────────────────
router = make_flow(
    name="ORION Master Router",
    description="Classifies user intent and routes to sentinel, forecaster, or archivist using IBM watsonx Granite.",
    system_message=(
        "You are ORION, a space intelligence routing system. "
        "Given the user's message, determine which specialist agent should handle it.\n\n"
        "Available agents:\n"
        "- sentinel: tracks near-Earth asteroids and space objects approaching Earth\n"
        "- forecaster: monitors solar flares and space weather events\n"
        "- archivist: searches astrophysics research papers and scientific literature\n\n"
        "Respond with ONLY a valid JSON object, no markdown, no extra text. Example:\n"
        '{"intent": "sentinel", "query": "<the user message>", "reasoning": "<one sentence why>"}\n\n'
        "Replace sentinel with forecaster or archivist as appropriate."
    ),
    sender_name="ORION Router",
)

# ── Sentinel Stub ──────────────────────────────────────────────────────────────
sentinel = make_flow(
    name="ORION Sentinel — Asteroid Tracker",
    description="Tracks near-Earth asteroids via NASA NeoWs API. Stub version for Phase 2.",
    system_message=(
        "You are the Sentinel agent of the ORION space command system. "
        "Regardless of what the user asks, respond with ONLY this exact JSON, no other text:\n"
        '{"agent": "sentinel", "items": [], '
        '"summary": "Sentinel agent is online. Real-time NASA NeoWs asteroid data will be wired in Phase 3.", '
        '"status": "stub"}'
    ),
    sender_name="Sentinel",
)

# ── Forecaster Stub ────────────────────────────────────────────────────────────
forecaster = make_flow(
    name="ORION Forecaster — Solar Weather",
    description="Monitors solar flares via NASA DONKI API. Stub version for Phase 2.",
    system_message=(
        "You are the Forecaster agent of the ORION space command system. "
        "Regardless of what the user asks, respond with ONLY this exact JSON, no other text:\n"
        '{"agent": "forecaster", "items": [], '
        '"summary": "Forecaster agent is online. Real-time NASA DONKI solar flare data will be wired in Phase 3.", '
        '"status": "stub"}'
    ),
    sender_name="Forecaster",
)

# ── Archivist Stub ─────────────────────────────────────────────────────────────
archivist = make_flow(
    name="ORION Archivist — Research RAG",
    description="RAG pipeline over astrophysics PDFs via Docling and Chroma. Stub version for Phase 2.",
    system_message=(
        "You are the Archivist agent of the ORION space command system. "
        "Regardless of what the user asks, respond with ONLY this exact JSON, no other text:\n"
        '{"agent": "archivist", "sources": [], '
        '"answer": "Archivist agent is online. The Docling + Chroma RAG pipeline will be wired in Phase 4.", '
        '"status": "stub"}'
    ),
    sender_name="Archivist",
)

# ── Write files ────────────────────────────────────────────────────────────────
flows = {
    "orion-router.json": router,
    "sentinel-flow.json": sentinel,
    "forecaster-flow.json": forecaster,
    "archivist-flow.json": archivist,
}

for fname, flow in flows.items():
    out = OUT_DIR / fname
    with open(out, "w", encoding="utf-8") as f:
        json.dump(flow, f, indent=2)
    node_types = [n["data"]["type"] for n in flow["data"]["nodes"]]
    edge_count = len(flow["data"]["edges"])
    print(f"OK {fname} | nodes: {node_types} | edges: {edge_count} | id: {flow['id'][:8]}")

print("\nAll flows generated successfully.")
