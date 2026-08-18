# ORION — Orbital Research & Intelligence Orchestration Network

> Deep Space Command Center — IBM AI Builders Challenge (August Space Theme)

ORION is a multi-agent AI dashboard that lets you query live space data and a curated astrophysics knowledge base from a single chat interface. A Next.js "Mission Control" frontend routes natural-language queries through a Langflow orchestration layer backed by IBM watsonx Granite. Three specialised agents handle different data domains:

- **The Sentinel** — tracks near-Earth asteroids via the NASA NeoWs API.
- **The Forecaster** — monitors solar flare activity via the NASA DONKI API.
- **The Archivist** — answers questions from a RAG pipeline over curated arXiv astrophysics PDFs (parsed by IBM Docling, stored in Chroma).

---

## Architecture Overview

```
Browser
  └─► Next.js frontend (Vercel / localhost:3000)
        └─► /api/chat  (Next.js API route, server-side)
              └─► POST http://<LANGFLOW_URL>/api/v1/run/<LANGFLOW_FLOW_ID>
                    └─► Langflow Master Router (localhost:7860)
                          ├─► Sentinel Flow  ──► NASA NeoWs API
                          ├─► Forecaster Flow ──► NASA DONKI API
                          └─► Archivist Flow  ──► Chroma vector store
                                                    (IBM Docling + sentence-transformers)
                          All flows use IBM watsonx Granite for LLM reasoning.
```

The Next.js API route is the only component that talks to Langflow — the browser never contacts Langflow or NASA directly.

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 18 or later |
| Python | 3.10 or later |
| ngrok | any recent version (for Vercel demo) |

---

## Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd orion-space-command
```

### 2. Python environment

A virtual environment already exists at `.venv`. Activate it and install dependencies:

```bash
# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1

# macOS / Linux
source .venv/bin/activate

# Install all Python dependencies (includes Langflow — may take several minutes)
pip install -r requirements.txt
```

> **Note:** `langflow` is a large package (~500 MB). On the first install, allow 5–10 minutes.

### 3. Next.js frontend

```bash
cd frontend
npm install
```

### 4. Environment variables

Copy the example file and fill in your credentials:

```bash
cp .env.example .env.example   # reference copy — do not commit secrets
cp .env.example frontend/.env.local
```

Edit `frontend/.env.local` with real values:

```
LANGFLOW_URL=http://localhost:7860
LANGFLOW_FLOW_ID=<your-master-router-flow-id>
NASA_API_KEY=<your-nasa-api-key>
```

Set the following as Langflow environment variables (or export them before starting Langflow):

```
WATSONX_API_KEY=<your-watsonx-api-key>
WATSONX_PROJECT_ID=<your-watsonx-project-id>
WATSONX_URL=https://us-south.ml.cloud.ibm.com
NASA_API_KEY=<your-nasa-api-key>
```

> NASA API keys are free: https://api.nasa.gov
> watsonx credentials: https://dataplatform.cloud.ibm.com

---

## Phase 2 — Langflow Setup

Before running the project, you must **import the Langflow flows** and **configure your watsonx credentials**.

**Quick steps:**

1. Start Langflow: `python -m langflow run` (from `.venv`)
2. Open **http://localhost:7860**
3. Import all four flow JSON files from `./langflow/flows/`:
   - `orion-router.json` (Master Router)
   - `sentinel-flow.json` (Sentinel Agent)
   - `forecaster-flow.json` (Forecaster Agent)
   - `archivist-flow.json` (Archivist Agent)
4. Configure watsonx credentials (Settings → Global Variables):
   - `WATSONX_API_KEY`
   - `WATSONX_PROJECT_ID`
   - `WATSONX_URL` = `https://us-south.ml.cloud.ibm.com`
5. Copy the **Master Router flow ID** from the browser URL and paste it into `./frontend/.env.local`:
   ```
   LANGFLOW_FLOW_ID=<your-master-router-flow-id>
   ```

**Detailed instructions, troubleshooting, and smoke tests:** see [`./langflow/README.md`](./langflow/README.md).

---

## Running Locally

Start each service in a separate terminal:

### Terminal 1 — Langflow

```bash
.\.venv\Scripts\Activate.ps1          # Windows
# source .venv/bin/activate           # macOS / Linux

python -m langflow run
```

Langflow opens at **http://localhost:7860**. Import the flow JSON files from `./langflow/flows/` via the Langflow UI.

### Terminal 2 — Next.js dev server

```bash
cd frontend
npm run dev
```

The dashboard opens at **http://localhost:3000**.

---

## Vercel Deployment

The Next.js frontend deploys to Vercel as-is. However, Langflow runs locally and Vercel cannot reach `localhost:7860`.

**Before the demo, expose your local Langflow instance with ngrok:**

### Terminal 3 — ngrok tunnel

```bash
ngrok http 7860
```

ngrok will print a public HTTPS URL such as `https://abc123.ngrok-free.app`.

Set this URL as the `LANGFLOW_URL` environment variable in your Vercel project settings:

```
LANGFLOW_URL=https://abc123.ngrok-free.app
```

Also set `LANGFLOW_FLOW_ID` in Vercel to match your master router flow ID.

> The ngrok URL changes each session unless you have a paid ngrok account with a reserved domain. Update the Vercel env var each time you start a new ngrok session.

---

## Project Structure

```
orion-space-command/
├── .venv/                  # Python virtual environment
├── frontend/               # Next.js 14 app (TypeScript + Tailwind)
│   ├── src/app/            # App Router pages and API routes
│   └── .env.local          # Local env vars (never committed)
├── langflow/
│   └── flows/              # Exported Langflow flow JSON files
├── scripts/                # Python utility scripts
│   ├── test_nasa_apis.py   # Validates NASA API connectivity
│   └── ingest_pdfs.py      # One-time Chroma ingestion pipeline
├── data/
│   ├── pdfs/               # arXiv source PDFs
│   ├── chroma_db/          # Persisted Chroma vector store
│   └── README.md           # PDF sources and arXiv IDs
├── requirements.txt        # Python dependencies
├── .env.example            # Environment variable template (safe to commit)
└── orion-plan.md           # Full development plan
```

---

## Secrets Hygiene

- `frontend/.env.local` — gitignored by default (covered by `.env*.local` in `frontend/.gitignore`).
- `.env` at the root — gitignored.
- **Never commit** `NASA_API_KEY`, `WATSONX_API_KEY`, or `WATSONX_PROJECT_ID`.
- `.env.example` contains only placeholder values and is safe to commit.
