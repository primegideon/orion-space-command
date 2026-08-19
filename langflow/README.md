# ORION — Langflow Setup Guide

This directory contains all Langflow flow definitions for the ORION orchestration layer. The four flows implement the master router and three specialist sub-agents, all powered by IBM watsonx Granite.

---

## Directory Structure

```
langflow/
└── flows/
    ├── orion-router.json       ← Master Router — classifies intent
    ├── sentinel-flow.json      ← Sentinel Agent — near-Earth asteroids
    ├── forecaster-flow.json    ← Forecaster Agent — solar flares & space weather
    └── archivist-flow.json     ← Archivist Agent — astrophysics literature RAG
```

---

## Prerequisites

- Python 3.10 or later
- The project virtual environment at `.venv` must be activated
- Langflow installed:
  ```bash
  pip install langflow
  ```
- `ibm-watsonx-ai` installed (already in `requirements.txt`):
  ```bash
  pip install ibm-watsonx-ai
  ```

---

## 1. Start Langflow

Activate the virtual environment first, then start Langflow:

```bash
# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1
python -m langflow run

# macOS / Linux
source .venv/bin/activate
python -m langflow run
```

Langflow opens at **http://localhost:7861**. Leave this terminal running.

---

## 2. Import the Flow JSON Files

1. Open **http://localhost:7861** in your browser.
2. Click the **"My Flows"** section on the home page.
3. Click the **"Upload"** button (folder/arrow icon, top-right of the flows grid).
4. Import each file in order:
   - `langflow/flows/orion-router.json`
   - `langflow/flows/sentinel-flow.json`
   - `langflow/flows/forecaster-flow.json`
   - `langflow/flows/archivist-flow.json`
5. Each imported flow will appear as a card in the grid.

> **Import order matters** for the router: import the sub-agent flows first so their IDs are available if you later wire them with a Sub-Flow component in Phase 3+.

---

## 3. Configure watsonx Credentials

### Option A — Langflow Global Variables (recommended)

1. In the Langflow UI, click the **gear icon** (Settings) in the left sidebar.
2. Navigate to **Global Variables**.
3. Add the following variables (type: `Credential`):

| Variable Name        | Value                                      |
|---------------------|--------------------------------------------|
| `WATSONX_API_KEY`   | Your IBM Cloud API key                      |
| `WATSONX_PROJECT_ID`| Your watsonx.ai project ID                  |
| `WATSONX_URL`       | `https://us-south.ml.cloud.ibm.com`         |

4. In each flow, open the **WatsonxAI — Granite** node and set each field to reference the corresponding global variable using the `{{ variable_name }}` syntax, or select it from the variable dropdown.

### Option B — Environment Variables

Export the variables before starting Langflow:

```bash
# Windows (PowerShell)
$env:WATSONX_API_KEY    = "your-api-key"
$env:WATSONX_PROJECT_ID = "your-project-id"
$env:WATSONX_URL        = "https://us-south.ml.cloud.ibm.com"
python -m langflow run

# macOS / Linux
export WATSONX_API_KEY="your-api-key"
export WATSONX_PROJECT_ID="your-project-id"
export WATSONX_URL="https://us-south.ml.cloud.ibm.com"
python -m langflow run
```

### Option C — Direct Node Configuration

Open each flow in the editor, click the **WatsonxAI — Granite** node, and paste your credentials directly into the **API Key** and **Project ID** fields. Use this only for local development — never commit credentials.

---

## 4. Find a Flow's ID

After importing, the flow ID appears in the browser URL when you open the flow for editing:

```
http://localhost:7861/flow/<FLOW_ID>
```

The **Master Router** flow ID (`orion-router`) is the one you need for the Next.js frontend.

---

## 5. Update the Frontend Environment Variable

Copy the Master Router flow ID and paste it into `./frontend/.env.local`:

```
LANGFLOW_FLOW_ID=<your-master-router-flow-id>
```

The Next.js API route reads this value at runtime when proxying requests to Langflow.

---

## 6. Required Environment Variables Summary

| Variable              | Where Used           | Description                                        |
|----------------------|----------------------|----------------------------------------------------|
| `WATSONX_API_KEY`    | Langflow / scripts   | IBM Cloud API key for watsonx.ai                   |
| `WATSONX_PROJECT_ID` | Langflow / scripts   | watsonx.ai project ID                              |
| `WATSONX_URL`        | Langflow / scripts   | watsonx.ai endpoint (default: `https://us-south.ml.cloud.ibm.com`) |
| `LANGFLOW_URL`       | Next.js `.env.local` | Langflow base URL (default: `http://localhost:7861`) |
| `LANGFLOW_FLOW_ID`   | Next.js `.env.local` | Master Router flow ID from Langflow UI              |
| `NASA_API_KEY`       | Next.js `.env.local` | NASA Open APIs key (free at https://api.nasa.gov)   |

---

## 7. Smoke Test — curl

Once flows are imported and watsonx credentials are set, test the Master Router:

```bash
curl -X POST "http://localhost:7861/api/v1/run/<FLOW_ID>" \
  -H "Content-Type: application/json" \
  -d '{"input_value": "show me asteroids approaching this week"}'
```

Replace `<FLOW_ID>` with the actual ID from the Langflow URL.

### Expected Successful Response

The response from Langflow wraps the agent output. The agent text is nested under:

```
response.outputs[0].outputs[0].results.message.text
```

A successful router response will contain a JSON string similar to:

```json
{
  "intent": "sentinel",
  "query": "show me asteroids approaching this week",
  "reasoning": "The query asks about near-Earth objects, which is the Sentinel agent's domain."
}
```

### Python Smoke Test

A Python smoke-test script is provided at `./scripts/test_langflow.py`:

```bash
# Activate .venv first
python scripts/test_langflow.py --query "show me asteroids approaching this week"
```

---

## 8. Flow Architecture

### Master Router (`orion-router.json`)

```
ChatInput ──► Prompt (intent classification template)
               │   {user_query} variable
               ▼
         WatsonxAI — Granite (ibm/granite-4h-small)
               │   temperature=0, max_tokens=256
               ▼
         ChatOutput → JSON: {intent, query, reasoning}
```

### Sub-Agent Flows (all three follow the same pattern)

```
ChatInput ──► Prompt (agent-specific stub template)
               │   {query} variable
               ▼
         WatsonxAI — Granite
               │
               ▼
         ChatOutput → JSON: {agent, items/sources, summary/answer, status}
```

---

## 9. Phase Roadmap

| Phase | What changes in these flows |
|-------|-----------------------------|
| **Phase 3** | Sentinel and Forecaster flows get real NASA API custom components replacing the stub prompt |
| **Phase 4** | Archivist flow gets the `ArchivistRetriever` custom component (Docling + Chroma RAG) |
| **Phase 5** | Master Router wired to sub-agent flows via Langflow Sub-Flow components |

---

## Troubleshooting

**Langflow fails to start**
- Ensure `.venv` is activated before running `python -m langflow run`.
- If port 7861 is in use, start on a different port: `python -m langflow run --port 7862`.

**WatsonxAI node shows a connection error**
- Verify `WATSONX_API_KEY` and `WATSONX_PROJECT_ID` are set correctly.
- Confirm your IBM Cloud account has watsonx.ai provisioned in the `us-south` region.
- Test the connection independently: `python scripts/test_watsonx.py`.

**Flow import fails**
- Ensure you are running Langflow 1.x (`python -m langflow --version`).
- If the schema version is incompatible, open the JSON file and verify the top-level `id`, `name`, and `data` keys are present.

**`intent` not found in response**
- The Granite model may have wrapped the JSON in markdown code fences. Check the raw response text and strip ` ```json ` markers if present. Phase 5's API route handles this automatically.
