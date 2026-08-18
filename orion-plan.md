# ORION — Development Plan
## Orbital Research & Intelligence Orchestration Network
### IBM AI Builders Challenge — August Space Theme

---

## Top-Level Overview

ORION is a Deep Space Command Center web dashboard built on a multi-agent architecture. A Next.js frontend provides a "Mission Control" chat interface backed by three specialized AI agents orchestrated via Langflow. IBM watsonx (Granite) powers all LLM reasoning. The three agents are:

- **The Sentinel** — queries the NASA NeoWs API to track near-Earth asteroids.
- **The Forecaster** — queries the NASA DONKI API to monitor solar flare activity.
- **The Archivist** — a RAG pipeline over curated arXiv astrophysics PDFs, parsed by IBM Docling and stored in a persistent Chroma vector store.

The user types a natural-language query into a single chat bar. A Langflow master router flow classifies intent, dispatches to the correct sub-agent, and returns a structured JSON response. The Next.js frontend renders each agent's result in its own dedicated panel below the chat bar.

**Deployment targets:** Vercel (frontend) + local Python process (Langflow).

---

## Phase Overview

| Phase | Name | Status |
|-------|------|--------|
| 1 | Environment & Project Scaffolding | [x] done |
| 2 | Langflow Agent Flows & watsonx Integration | [x] done |
| 3 | NASA API Integrations (Sentinel + Forecaster) | [x] done |
| 4 | Archivist RAG Pipeline (Docling + Chroma) | [ ] pending |
| 5 | Next.js Frontend Dashboard | [ ] pending |

---

## Phase 1 — Environment & Project Scaffolding

**Intent:**
Establish the full project skeleton so every subsequent phase has a clean, consistent base to build on. This phase is deliberately infrastructure-only — no business logic.

**Expected Outcomes:**
- A Next.js app exists at `./frontend` with TypeScript, Tailwind CSS, and a working dev server.
- A Python virtual environment exists at `./.venv` with all backend dependencies installed.
- A `.env.local` file template exists with all required environment variable keys (empty values).
- A Langflow instance can be started locally via a single command.
- A root-level `README.md` documents the start-up commands for both tiers.

**Todo List:**
1. Initialise a Next.js 14 app at `./frontend` with TypeScript and Tailwind CSS (`create-next-app`).
2. Install Langflow into the existing `.venv` via `pip install langflow`.
3. Install Python dependencies: `chromadb`, `docling`, `langchain`, `langchain-ibm`, `ibm-watsonx-ai`, `requests`.
4. Create `.env.local` inside `./frontend` with keys: `LANGFLOW_URL`, `LANGFLOW_FLOW_ID`, `NASA_API_KEY`. Add `.env.local` to `.gitignore`.
5. Create a root `.env.example` documenting all required keys across both tiers (Next.js + Langflow).
6. Create `README.md` at the project root with commands to start Langflow (`python -m langflow run`) and the Next.js dev server (`npm run dev`).

**Relevant Context:**
- `.venv` already exists in the workspace root.
- Next.js app must live in `./frontend` (separate from the Python layer).
- Langflow default port is `7860`; Next.js default is `3000`.

**Status:** [x] done

---

## Phase 2 — Langflow Agent Flows & watsonx Integration

**Intent:**
Build and verify the Langflow orchestration layer — the master router flow and the three sub-agent flows — connected to IBM watsonx Granite. This phase establishes the reasoning backbone before any real data is wired up. Stub/mock tools are acceptable here; the goal is to confirm that intent classification and response generation work end-to-end.

**Expected Outcomes:**
- A Langflow master router flow (`orion-router.json`) classifies a free-text query into one of three intents: `sentinel`, `forecaster`, `archivist`.
- Three child flows (`sentinel-flow.json`, `forecaster-flow.json`, `archivist-flow.json`) exist, each using the watsonx Granite LLM node and returning a structured JSON response object.
- A watsonx Granite LLM (e.g. `granite-4h-small`) is connected and responding inside Langflow.
- Langflow flows are exported as JSON files into `./langflow/flows/` for version control.
- A smoke-test curl command against `POST /api/v1/run/{flow_id}` returns a valid JSON payload.

**Todo List:**
1. Launch Langflow locally and open the visual editor at `http://localhost:7860`.
2. Create the **watsonx Granite LLM** component: configure with `WATSONX_API_KEY`, `WATSONX_PROJECT_ID`, `WATSONX_URL`, and the model ID `ibm/granite-4h-small`.
3. Build the **Master Router Flow**: a prompt node that receives the user query and instructs Granite to return a JSON object `{"intent": "sentinel"|"forecaster"|"archivist", "query": "..."}`.
4. Build three stub **Sub-Agent Flows**, each receiving the classified query and returning a hardcoded JSON response for now (e.g. `{"agent": "sentinel", "data": [], "summary": "stub"}`).
5. Wire the Master Router to each sub-agent flow using Langflow's Sub-Flow component.
6. Export all four flows to `./langflow/flows/` as `.json` files.
7. Document the flow IDs and required Langflow environment variables in `README.md`.

**Relevant Context:**
- Langflow IBM watsonx component requires `ibm-watsonx-ai` to be installed in the same Python environment as Langflow.
- Flow exports are accessible via Langflow UI: Settings → Export.
- The Next.js API route (built in Phase 5) will call `POST http://localhost:7860/api/v1/run/{LANGFLOW_FLOW_ID}` with `{"input_value": "<user query>"}`.

**Status:** [x] done

---

## Phase 3 — NASA API Integrations (Sentinel + Forecaster)

**Intent:**
Replace the stub tools in the Sentinel and Forecaster flows with real NASA API calls. Each agent should fetch live data, pass it to Granite for summarisation, and return a structured response the frontend can render.

**Expected Outcomes:**
- The Sentinel flow queries `https://api.nasa.gov/neo/rest/v1/feed` for near-Earth asteroids over the next 7 days and returns a JSON object containing a list of asteroid names, miss distances, and sizes, plus a Granite-generated natural-language summary.
- The Forecaster flow queries `https://api.nasa.gov/DONKI/FLR` for solar flares in the past 30 days and returns a JSON object containing flare class, peak time, and a Granite-generated natural-language summary.
- Both flows handle API errors gracefully (empty data set + error message in the summary field).
- A Python test script at `./scripts/test_nasa_apis.py` independently validates both NASA endpoints with the real API key.

**Todo List:**
1. Create `./scripts/test_nasa_apis.py` to manually verify NASA NeoWs and DONKI responses before wiring into Langflow.
2. In Langflow, build a **custom Python component** for the Sentinel: calls `GET /neo/rest/v1/feed?start_date=TODAY&end_date=TODAY+7&api_key=NASA_API_KEY`, parses the response into a flat list of asteroid dicts.
3. Build a **custom Python component** for the Forecaster: calls `GET /DONKI/FLR?startDate=30_DAYS_AGO&endDate=TODAY&api_key=NASA_API_KEY`, parses the response into a flat list of flare dicts.
4. In each sub-agent flow, pass the parsed data list + original query to a prompt node, then to Granite for summary generation.
5. Define the output schema for both flows: `{"agent": "sentinel"|"forecaster", "items": [...], "summary": "..."}`.
6. Update the exported flow JSON files in `./langflow/flows/`.

**Relevant Context:**
- NASA API key is already in hand; store it in Langflow's environment or as a global variable in the flow.
- NeoWs response nests asteroid data under `near_earth_objects[date][]` — the custom component must flatten this.
- DONKI FLR endpoint returns an array directly; may return `null` for date ranges with no flares.

**Status:** [x] done

---

## Phase 4 — Archivist RAG Pipeline (Docling + Chroma)

**Intent:**
Build the full RAG pipeline for the Archivist agent. This involves sourcing arXiv PDFs, parsing them with IBM Docling, chunking and embedding the text, persisting vectors in Chroma, and exposing the retrieval logic as a Langflow custom component. Chroma must persist to disk so data survives Langflow restarts.

**Expected Outcomes:**
- At least 5 curated arXiv astrophysics PDFs are downloaded to `./data/pdfs/`.
- A one-time ingestion script at `./scripts/ingest_pdfs.py` parses all PDFs via Docling, chunks the text, embeds using a sentence-transformer model, and persists to a Chroma collection at `./data/chroma_db/`.
- A Langflow custom Python component (`ArchivistRetriever`) accepts a query string, searches the Chroma collection, and returns the top-k relevant chunks.
- The Archivist flow passes retrieved chunks + original query to Granite for answer synthesis.
- The Archivist flow returns `{"agent": "archivist", "sources": ["paper title", ...], "answer": "..."}`.
- The exported Archivist flow JSON is updated in `./langflow/flows/`.

**Todo List:**
1. Curate and download 5–10 publicly available arXiv PDFs relevant to asteroids, solar activity, and astrophysics into `./data/pdfs/`. Document sources in `./data/README.md`.
2. Create `./scripts/ingest_pdfs.py`:
   - Use `docling.DocumentConverter` to parse each PDF into structured text.
   - Chunk text into ~512-token segments with overlap.
   - Embed chunks using `sentence-transformers/all-MiniLM-L6-v2` (lightweight, no API cost).
   - Persist embeddings to Chroma at `./data/chroma_db/` with `persist_directory` set.
3. Run the ingestion script and verify Chroma collection contains documents.
4. Build the `ArchivistRetriever` Langflow custom component:
   - On init: loads the persisted Chroma collection from `./data/chroma_db/`.
   - On run: takes a query string, returns top-5 chunks with source metadata.
5. Wire the custom component into the Archivist flow: retriever → prompt (with chunks + query) → Granite → structured output.
6. Export and commit the updated Archivist flow JSON.

**Relevant Context:**
- Docling `DocumentConverter` is the primary entry point: `converter.convert(pdf_path).document.export_to_markdown()`.
- Chroma `PersistentClient(path="./data/chroma_db")` ensures data survives restarts.
- The custom Langflow component class must subclass `langflow.custom.CustomComponent` and implement a `build()` method.
- Embedding model runs locally — no API key required for retrieval.

**Status:** [ ] pending

---

## Phase 5 — Next.js Frontend Dashboard

**Intent:**
Build the ORION mission control dashboard. A single chat bar at the top routes the user's query to Langflow via a Next.js API route. The structured JSON response drives three dedicated agent panels that render asteroid data, solar flare data, and Archivist answers respectively. The visual theme is space/dark mode.

**Expected Outcomes:**
- The Next.js app at `./frontend` has a working Mission Control page (`/`).
- A `/api/chat` API route proxies `POST` requests to `http://localhost:7860/api/v1/run/{LANGFLOW_FLOW_ID}` and returns the structured agent response.
- The page renders three panels: Sentinel (asteroid table), Forecaster (solar flare timeline/cards), Archivist (Q&A with source citations).
- Each panel shows a "waiting for signal" empty state and a loading skeleton while the query is in flight.
- The active panel (matching the detected intent) is visually highlighted.
- The app is deployable to Vercel with `LANGFLOW_URL` and `LANGFLOW_FLOW_ID` set as Vercel environment variables.

**Todo List:**
1. Scaffold the main page layout in `./frontend/app/page.tsx`: header with ORION branding, chat input bar, three-column panel grid.
2. Create the `/api/chat` API route at `./frontend/app/api/chat/route.ts`: receives `{query: string}`, POSTs to Langflow, returns the JSON payload.
3. Build the `SentinelPanel` component: renders a table of asteroids (name, miss distance, diameter, hazard flag) from `items[]`.
4. Build the `ForecasterPanel` component: renders solar flare cards (class, peak time, region) from `items[]`.
5. Build the `ArchivistPanel` component: renders the Granite-synthesised answer text and a list of source paper titles from `sources[]`.
6. Implement loading skeletons and empty states for all three panels using Tailwind CSS.
7. Apply a dark space theme: deep navy/black backgrounds, cyan/amber accent colours, monospace font for data values.
8. Test the full end-to-end flow: type a query → Langflow routes → correct panel populates.
9. Verify `vercel build` succeeds and environment variables are documented in `README.md`.

**Relevant Context:**
- API route lives in `./frontend/app/api/chat/route.ts` (Next.js App Router convention).
- `LANGFLOW_URL` and `LANGFLOW_FLOW_ID` are read from `process.env` in the API route — never exposed to the browser.
- Langflow returns the agent output under `response.outputs[0].outputs[0].results.message.text` — parse accordingly.
- Vercel cannot reach `localhost:7860` in production; the `LANGFLOW_URL` env var must point to a cloud-hosted Langflow instance for the deployed app.

**Status:** [ ] pending

---

## Cross-Cutting Notes

- **Secrets hygiene**: `NASA_API_KEY`, `WATSONX_API_KEY`, `WATSONX_PROJECT_ID` must never be committed. Confirm `.env.local` and `.env` are in `.gitignore` before the first commit.
- **CORS**: Langflow's local server does not need CORS headers because requests originate from the Next.js API route (server-side), not the browser.
- **Error contract**: Every Langflow flow should return a consistent shape even on error: `{"agent": "...", "error": "...", "items": [], "summary": ""}`. This simplifies frontend error handling.
- **arXiv PDF sourcing**: Use the arXiv bulk access guidelines. Suggested papers: solar flare forecasting surveys, near-Earth object detection papers, and general astrophysics reviews. Document DOIs/arXiv IDs in `./data/README.md`.
- **Embeddings**: Local `sentence-transformers/all-MiniLM-L6-v2` — runs entirely in process, no API cost. Do not swap to watsonx embeddings.
- **Vercel ↔ Langflow bridge**: Use ngrok to tunnel local Langflow port `7860` to a public HTTPS URL. Set the resulting ngrok URL as `LANGFLOW_URL` in Vercel environment variables for the final demo. Add a note to `README.md` on starting ngrok before the demo.
