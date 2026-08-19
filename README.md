<p align="center">
  <img src="assets/orion-animated-logo.svg" alt="ORION Animated Logo" width="100%">
</p>

# ORION — Orbital Research & Intelligence Orchestration Network

> **IBM AI Builders Challenge · August 2026 · Theme: Advance Space Exploration with AI**

---

## Selected Challenge Theme

**Advance Space Exploration with AI**

ORION directly addresses the challenge of making complex, fragmented space science data accessible and actionable through a conversational AI interface powered by IBM watsonx.

---

## Problem Statement

Space situational awareness today is a fragmented discipline. Near-Earth object tracking, solar weather forecasting, and deep astrophysics research each live in their own siloed data systems — NASA's NeoWs API, the DONKI space weather archive, and thousands of arXiv preprints — with no unified interface for a scientist, educator, or mission planner to query them all at once.

The problem is threefold:

1. **Data fragmentation.** Planetary defense data, heliophysics telemetry, and peer-reviewed research are scattered across incompatible APIs, PDFs, and web portals. Correlating them requires domain expertise and significant manual effort.
2. **Latency of insight.** Raw JSON from a NASA API is not actionable. A researcher needs synthesised, contextual summaries — not raw arrays of orbital parameters.
3. **Accessibility gap.** Domain experts aside, there is no tool that lets a curious developer or student ask *"Are any large asteroids approaching this week?"* or *"What does recent research say about solar flare prediction?"* and get a coherent, cited answer in seconds.

ORION closes this gap with a single natural-language chat interface that routes each query to the right specialist agent and returns synthesised, data-backed responses in real time.

---

## Solution Description

ORION is a **Next.js Bento-box command center** — a mission-control-style dashboard where a single chat input dispatches queries to three purpose-built AI agents. Each agent owns a distinct data domain and renders its results in a dedicated panel below the chat bar.

### The Sentinel — Near-Earth Asteroid Tracker

The Sentinel agent queries the **NASA NeoWs (Near Earth Object Web Service)** API for asteroid close-approach data across a rolling 7-day window. It extracts asteroid names, estimated diameters, miss distances, and potential-hazard classifications, then passes the structured payload to IBM watsonx Llama-4 Maverick for a concise situational briefing.

<p align="center">
  <img src="assets/sentinel-ui.png" alt="The Sentinel — Asteroid Tracker Panel" width="90%">
  <br/>
  <em>The Sentinel panel: live asteroid approach data with AI-generated threat summary.</em>
</p>

---

### The Forecaster — Solar Weather Monitor

The Forecaster agent queries the **NASA DONKI (Database Of Notifications, Knowledge, Information)** API for solar flare events over the past 30 days. Flare classifications (A through X), peak times, and active region IDs are parsed into structured cards, then synthesised by watsonx into a space-weather advisory.

<p align="center">
  <img src="assets/forecaster-ui.png" alt="The Forecaster — Solar Weather Panel" width="90%">
  <br/>
  <em>The Forecaster panel: DONKI solar flare timeline with AI-generated activity summary.</em>
</p>

---

### The Archivist — Astrophysics Research Assistant

The Archivist is a full **Retrieval-Augmented Generation (RAG)** pipeline. A curated corpus of arXiv astrophysics PDFs (covering asteroid detection, solar flare forecasting, and exoplanetary research) was parsed offline using **IBM Docling**, chunked, embedded with `sentence-transformers/all-MiniLM-L6-v2`, and persisted to a local **Chroma** vector store. At query time, the top-5 relevant chunks are retrieved and passed to IBM watsonx Granite for grounded, citation-backed answer synthesis.

<p align="center">
  <img src="assets/archivist-ui.png" alt="The Archivist — RAG Research Panel" width="90%">
  <br/>
  <em>The Archivist panel: natural-language answers grounded in arXiv literature with source citations.</em>
</p>

---

## AI Approach & Architecture

<p align="center">
<svg viewBox="0 0 900 520" xmlns="http://www.w3.org/2000/svg" width="100%" style="max-width:900px;font-family:'Courier New',monospace;background:#080c14;border-radius:16px;">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#38bdf8" opacity="0.7"/>
    </marker>
    <marker id="arr-a" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#fbbf24" opacity="0.7"/>
    </marker>
    <marker id="arr-e" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#34d399" opacity="0.7"/>
    </marker>
    <filter id="glow-c"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="glow-a"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="glow-e"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>

  <!-- ── USER ── -->
  <rect x="20" y="220" width="90" height="44" rx="8" fill="#0d1829" stroke="#38bdf8" stroke-opacity="0.35" stroke-width="1"/>
  <text x="65" y="238" text-anchor="middle" fill="#38bdf8" font-size="10" font-weight="bold">USER</text>
  <text x="65" y="254" text-anchor="middle" fill="#4a5568" font-size="9">Browser</text>

  <!-- ── NEXT.JS ── -->
  <rect x="155" y="190" width="120" height="104" rx="8" fill="#0d1829" stroke="#38bdf8" stroke-opacity="0.35" stroke-width="1"/>
  <text x="215" y="210" text-anchor="middle" fill="#38bdf8" font-size="10" font-weight="bold">Next.js</text>
  <text x="215" y="225" text-anchor="middle" fill="#4a5568" font-size="8">Vercel / :3000</text>
  <rect x="168" y="233" width="94" height="22" rx="4" fill="rgba(56,189,248,0.08)" stroke="#38bdf8" stroke-opacity="0.2" stroke-width="1"/>
  <text x="215" y="248" text-anchor="middle" fill="#38bdf8" font-size="8">/api/chat route</text>
  <rect x="168" y="260" width="94" height="22" rx="4" fill="rgba(56,189,248,0.06)" stroke="#38bdf8" stroke-opacity="0.15" stroke-width="1"/>
  <text x="215" y="275" text-anchor="middle" fill="#64748b" font-size="8">server-side proxy</text>

  <!-- ── LANGFLOW ── -->
  <rect x="335" y="175" width="130" height="134" rx="8" fill="#0d1829" stroke="#a78bfa" stroke-opacity="0.4" stroke-width="1.5"/>
  <text x="400" y="197" text-anchor="middle" fill="#a78bfa" font-size="10" font-weight="bold">Langflow</text>
  <text x="400" y="211" text-anchor="middle" fill="#4a5568" font-size="8">:7861</text>
  <rect x="348" y="219" width="104" height="22" rx="4" fill="rgba(167,139,250,0.1)" stroke="#a78bfa" stroke-opacity="0.3" stroke-width="1"/>
  <text x="400" y="234" text-anchor="middle" fill="#a78bfa" font-size="8">Master Router</text>
  <line x1="400" y1="241" x2="400" y2="260" stroke="#a78bfa" stroke-opacity="0.3" stroke-width="1" stroke-dasharray="3,2"/>
  <text x="400" y="258" text-anchor="middle" fill="#4a5568" font-size="7">intent classify</text>
  <rect x="348" y="267" width="104" height="30" rx="4" fill="rgba(167,139,250,0.06)" stroke="#a78bfa" stroke-opacity="0.2" stroke-width="1"/>
  <text x="400" y="280" text-anchor="middle" fill="#64748b" font-size="7.5">llama-4-maverick</text>
  <text x="400" y="292" text-anchor="middle" fill="#64748b" font-size="7">17b-128e-fp8</text>

  <!-- ── SENTINEL FLOW ── -->
  <rect x="530" y="60" width="130" height="90" rx="8" fill="#0d1829" stroke="#38bdf8" stroke-opacity="0.4" stroke-width="1.5" filter="url(#glow-c)"/>
  <text x="595" y="82" text-anchor="middle" fill="#38bdf8" font-size="10" font-weight="bold">🛰 Sentinel</text>
  <line x1="595" y1="88" x2="595" y2="96" stroke="#38bdf8" stroke-opacity="0.2" stroke-width="1"/>
  <rect x="542" y="94" width="106" height="18" rx="3" fill="rgba(56,189,248,0.08)"/>
  <text x="595" y="107" text-anchor="middle" fill="#4a5568" font-size="7.5">NASA NeoWs API</text>
  <rect x="542" y="116" width="106" height="26" rx="3" fill="rgba(56,189,248,0.05)"/>
  <text x="595" y="128" text-anchor="middle" fill="#64748b" font-size="7">Near-Earth objects</text>
  <text x="595" y="138" text-anchor="middle" fill="#64748b" font-size="7">7-day window</text>

  <!-- ── FORECASTER FLOW ── -->
  <rect x="530" y="210" width="130" height="90" rx="8" fill="#0d1829" stroke="#fbbf24" stroke-opacity="0.4" stroke-width="1.5" filter="url(#glow-a)"/>
  <text x="595" y="232" text-anchor="middle" fill="#fbbf24" font-size="10" font-weight="bold">☀ Forecaster</text>
  <line x1="595" y1="238" x2="595" y2="246" stroke="#fbbf24" stroke-opacity="0.2" stroke-width="1"/>
  <rect x="542" y="244" width="106" height="18" rx="3" fill="rgba(251,191,36,0.08)"/>
  <text x="595" y="257" text-anchor="middle" fill="#4a5568" font-size="7.5">NASA DONKI API</text>
  <rect x="542" y="266" width="106" height="26" rx="3" fill="rgba(251,191,36,0.05)"/>
  <text x="595" y="278" text-anchor="middle" fill="#64748b" font-size="7">Solar flare events</text>
  <text x="595" y="288" text-anchor="middle" fill="#64748b" font-size="7">30-day lookback</text>

  <!-- ── ARCHIVIST FLOW ── -->
  <rect x="530" y="360" width="130" height="115" rx="8" fill="#0d1829" stroke="#34d399" stroke-opacity="0.4" stroke-width="1.5" filter="url(#glow-e)"/>
  <text x="595" y="382" text-anchor="middle" fill="#34d399" font-size="10" font-weight="bold">📚 Archivist</text>
  <line x1="595" y1="388" x2="595" y2="396" stroke="#34d399" stroke-opacity="0.2" stroke-width="1"/>
  <rect x="542" y="394" width="106" height="18" rx="3" fill="rgba(52,211,153,0.08)"/>
  <text x="595" y="407" text-anchor="middle" fill="#4a5568" font-size="7.5">Chroma Vector DB</text>
  <rect x="542" y="416" width="106" height="18" rx="3" fill="rgba(52,211,153,0.06)"/>
  <text x="595" y="429" text-anchor="middle" fill="#64748b" font-size="7.5">IBM Docling PDFs</text>
  <rect x="542" y="438" width="106" height="28" rx="3" fill="rgba(52,211,153,0.05)"/>
  <text x="595" y="451" text-anchor="middle" fill="#64748b" font-size="7">sentence-transformers</text>
  <text x="595" y="461" text-anchor="middle" fill="#64748b" font-size="7">all-MiniLM-L6-v2</text>

  <!-- ── IBM WATSONX BOX ── -->
  <rect x="740" y="175" width="135" height="134" rx="8" fill="#0d1829" stroke="#60a5fa" stroke-opacity="0.35" stroke-width="1.5"/>
  <text x="807" y="197" text-anchor="middle" fill="#60a5fa" font-size="9" font-weight="bold">IBM watsonx</text>
  <rect x="752" y="205" width="110" height="28" rx="4" fill="rgba(96,165,250,0.08)" stroke="#60a5fa" stroke-opacity="0.2" stroke-width="1"/>
  <text x="807" y="218" text-anchor="middle" fill="#60a5fa" font-size="7.5">llama-4-maverick</text>
  <text x="807" y="228" text-anchor="middle" fill="#4a5568" font-size="7">routing + summaries</text>
  <rect x="752" y="238" width="110" height="28" rx="4" fill="rgba(52,211,153,0.06)" stroke="#34d399" stroke-opacity="0.2" stroke-width="1"/>
  <text x="807" y="251" text-anchor="middle" fill="#34d399" font-size="7.5">RAG synthesis</text>
  <text x="807" y="261" text-anchor="middle" fill="#4a5568" font-size="7">archivist agent</text>
  <rect x="752" y="271" width="110" height="28" rx="4" fill="rgba(167,139,250,0.06)" stroke="#a78bfa" stroke-opacity="0.2" stroke-width="1"/>
  <text x="807" y="284" text-anchor="middle" fill="#a78bfa" font-size="7.5">IBM Docling</text>
  <text x="807" y="294" text-anchor="middle" fill="#4a5568" font-size="7">PDF ingestion</text>

  <!-- ── ARROWS ── -->
  <!-- User → Next.js -->
  <line x1="110" y1="242" x2="152" y2="242" stroke="#38bdf8" stroke-opacity="0.5" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Next.js → Langflow -->
  <line x1="275" y1="242" x2="332" y2="242" stroke="#38bdf8" stroke-opacity="0.5" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- Langflow → Sentinel -->
  <path d="M465,220 C500,220 500,105 527,105" stroke="#38bdf8" stroke-opacity="0.45" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>
  <!-- Langflow → Forecaster -->
  <line x1="465" y1="255" x2="527" y2="255" stroke="#fbbf24" stroke-opacity="0.45" stroke-width="1.5" marker-end="url(#arr-a)"/>
  <!-- Langflow → Archivist -->
  <path d="M465,285 C500,285 500,417 527,417" stroke="#34d399" stroke-opacity="0.45" stroke-width="1.5" fill="none" marker-end="url(#arr-e)"/>

  <!-- Sentinel → watsonx -->
  <path d="M660,105 C700,105 700,230 737,230" stroke="#38bdf8" stroke-opacity="0.35" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>
  <!-- Forecaster → watsonx -->
  <line x1="660" y1="255" x2="737" y2="255" stroke="#fbbf24" stroke-opacity="0.35" stroke-width="1.5" marker-end="url(#arr-a)"/>
  <!-- Archivist → watsonx -->
  <path d="M660,417 C700,417 700,280 737,280" stroke="#34d399" stroke-opacity="0.35" stroke-width="1.5" fill="none" marker-end="url(#arr-e)"/>

  <!-- watsonx → Next.js (response loop) -->
  <path d="M807,175 C807,30 215,30 215,188" stroke="#64748b" stroke-opacity="0.25" stroke-width="1" fill="none" stroke-dasharray="5,3" marker-end="url(#arr)"/>
  <text x="510" y="22" text-anchor="middle" fill="#4a5568" font-size="8">JSON response ↩</text>

  <!-- ── LABELS ── -->
  <text x="131" y="237" fill="#38bdf8" font-size="7" opacity="0.6">query</text>
  <text x="278" y="237" fill="#38bdf8" font-size="7" opacity="0.6">POST</text>
  <text x="470" y="197" fill="#38bdf8" font-size="7" opacity="0.6">sentinel</text>
  <text x="470" y="247" fill="#fbbf24" font-size="7" opacity="0.6">forecaster</text>
  <text x="470" y="340" fill="#34d399" font-size="7" opacity="0.6">archivist</text>
</svg>
</p>

### Multi-Agent Orchestration via Langflow

All agent coordination is handled by a **Langflow** pipeline composed of four exported flow definitions in `./langflow/flows/`:

| Flow File | Role |
|-----------|------|
| `orion-router.json` | Master Router — classifies intent, dispatches to sub-agent |
| `sentinel-flow.json` | Sentinel Agent — NeoWs fetch + Maverick summary |
| `forecaster-flow.json` | Forecaster Agent — DONKI fetch + Maverick summary |
| `archivist-flow.json` | Archivist Agent — Chroma retrieval + Granite synthesis |

### IBM watsonx Models

| Model | Role |
|-------|------|
| `meta-llama/llama-4-maverick-17b-128e-instruct-fp8` | All three agents — intent routing, Sentinel/Forecaster summaries, and Archivist RAG synthesis |

Llama-4 Maverick was selected across all agents for its instruction-following precision on structured JSON output and strong factual grounding — confirmed via live model benchmarking during development.

### IBM Docling — PDF Ingestion Pipeline

The `./scripts/ingest_pdfs.py` script uses **IBM Docling's `DocumentConverter`** to parse arXiv PDFs into structured markdown before chunking. Docling's layout-aware parsing correctly handles multi-column academic papers, figure captions, and mathematical notation — producing higher-quality text chunks than a naive PDF text extractor.

```
arXiv PDFs (./data/pdfs/)
  └─► IBM Docling DocumentConverter → structured markdown
        └─► 512-token chunks with 64-token overlap
              └─► sentence-transformers/all-MiniLM-L6-v2 embeddings
                    └─► Chroma PersistentClient (./data/chroma_db/)
```

### Structured Response Contract

Every Langflow flow returns a consistent JSON envelope regardless of success or error:

```json
{
  "agent":   "sentinel | forecaster | archivist",
  "items":   [...],
  "summary": "...",
  "sources": ["..."],
  "error":   null
}
```

The Next.js frontend reads `agent` to know which panel to activate, then renders `items` in a data table or card grid and `summary` / `sources` as the AI narrative block.

---

## Built with IBM Bob

ORION was developed in close collaboration with **IBM Bob** as the primary AI engineering partner — not as a code autocomplete, but as an active participant throughout every phase of the build.

The product vision, agent architecture, and design decisions were shaped through an iterative dialogue: which NASA APIs to integrate, how to structure the Langflow orchestration topology, and how to design the dashboard's visual language. Bob translated those decisions into working code rapidly and with full context across the entire codebase.

**Specific areas where the collaboration was most impactful:**

- **Next.js Frontend.** The Bento-box dashboard layout, all five agent panel components, loading skeletons, idle animations (radar sweep, waveform pulse, document scan), and the glassmorphic dark space theme in Tailwind CSS were developed iteratively. The full God Mode upgrade — telemetry console, slide-out detail drawers, tech-stack badge matrix — was built in a single session.

- **Langflow Integration Debugging.** Diagnosing and resolving the async stream conflict between Langflow's LLM nodes and custom Python components required understanding both the Langflow 1.11 internal component lifecycle and the Next.js server-side fetch model. The two-phase routing architecture (router flow → sub-agent flow) and its JSON repair fallback logic emerged from this debugging process.

- **Python Backend.** The custom Langflow components for Sentinel (NASA NeoWs data flattening), Forecaster (DONKI null-response handling), and Archivist (Chroma RAG retrieval) were all developed collaboratively. The `ingest_pdfs.py` pipeline — Docling conversion, 512-token chunking, sentence-transformer embedding, and Chroma persistence — was written and validated end-to-end within the same session.

- **Model Selection.** A live benchmarking script (`scripts/test_model_candidates.py`) was written to test all available IBM watsonx models against the actual routing prompt. `llama-4-maverick-17b-128e-instruct-fp8` was selected based on measured results: fastest response (1.1s), cleanest JSON output, and correct intent classification.

- **Project Infrastructure.** The five-phase development plan (`orion-plan.md`) was maintained and updated collaboratively throughout, with each phase tracked from stub to production-ready.

---

## Local Setup Instructions

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 18 or later |
| Python | 3.10 or later |
| ngrok | any (for Vercel demo only) |

---

### 1. Clone the repository

```bash
git clone <repo-url>
cd orion-space-command
```

### 2. Python environment & dependencies

```bash
# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

> `langflow` is a large package (~500 MB). Allow 5–10 minutes on first install.

### 3. Next.js frontend

```bash
cd frontend
npm install
```

### 4. Environment variables

```bash
cp .env.example frontend/.env.local
```

Edit `frontend/.env.local`:

```env
LANGFLOW_URL=http://localhost:7861
LANGFLOW_FLOW_ID=<your-master-router-flow-id>
NASA_API_KEY=<your-nasa-api-key>
```

Export Langflow credentials in the same shell you start Langflow from:

```env
WATSONX_API_KEY=<your-ibm-cloud-api-key>
WATSONX_PROJECT_ID=<your-watsonx-project-id>
WATSONX_URL=https://us-south.ml.cloud.ibm.com
NASA_API_KEY=<your-nasa-api-key>
```

> Free NASA API key: https://api.nasa.gov  
> IBM watsonx credentials: https://dataplatform.cloud.ibm.com

### 5. Ingest the Archivist corpus (one-time)

```bash
python scripts/ingest_pdfs.py
```

This parses `./data/pdfs/` via IBM Docling, embeds the chunks, and persists them to `./data/chroma_db/`.

### 6. Start Langflow

```bash
# Terminal 1
python -m langflow run
```

Open **http://localhost:7861**, import all four flow JSON files from `./langflow/flows/`, and configure your watsonx credentials under Settings → Global Variables. Copy the Master Router flow ID into `frontend/.env.local` as `LANGFLOW_FLOW_ID`.

### 7. Start the Next.js dev server

```bash
# Terminal 2
cd frontend
npm run dev
```

The dashboard is available at **http://localhost:3000**.

---

### Vercel Deployment (for live demo)

Expose your local Langflow instance with ngrok:

```bash
# Terminal 3
ngrok http 7861
```

Set the printed HTTPS URL as `LANGFLOW_URL` in your Vercel project environment variables, alongside `LANGFLOW_FLOW_ID`. Redeploy. The ngrok URL changes each session unless you have a reserved domain.

---

## Project Structure

```
orion-space-command/
├── assets/
│   ├── orion-animated-logo.svg     # Project logo (SVG, animated)
│   ├── sentinel-ui.png             # Dashboard screenshot — Sentinel panel
│   ├── forecaster-ui.png           # Dashboard screenshot — Forecaster panel
│   └── archivist-ui.png            # Dashboard screenshot — Archivist panel
├── frontend/                       # Next.js 14 app (TypeScript + Tailwind CSS)
│   ├── src/app/                    # App Router pages and API routes
│   │   ├── page.tsx                # Main dashboard page
│   │   └── api/chat/route.ts       # Langflow proxy API route
│   ├── src/components/             # Agent panel components
│   │   ├── SentinelPanel.tsx
│   │   ├── ForecasterPanel.tsx
│   │   ├── ArchivistPanel.tsx
│   │   ├── TelemetryConsole.tsx    # Live telemetry log console
│   │   └── DetailPanel.tsx         # Slide-out item detail drawer
│   └── .env.local                  # Local env vars (never committed)
├── langflow/
│   ├── flows/                      # Exported Langflow flow JSON files
│   │   ├── orion-router.json
│   │   ├── sentinel-flow.json
│   │   ├── forecaster-flow.json
│   │   └── archivist-flow.json
│   └── components/                 # Custom Langflow Python components
├── scripts/
│   ├── ingest_pdfs.py              # One-time Docling → Chroma ingestion
│   ├── test_nasa_apis.py           # NASA API connectivity smoke test
│   └── test_watsonx.py             # watsonx LLM connectivity smoke test
├── data/
│   ├── pdfs/                       # arXiv source PDFs
│   ├── chroma_db/                  # Persisted Chroma vector store
│   └── README.md                   # PDF sources and arXiv IDs
├── requirements.txt                # Python dependencies
├── .env.example                    # Environment variable template (safe to commit)
└── orion-plan.md                   # Full phased development plan
```

---

## Secrets Hygiene

- `frontend/.env.local` — gitignored by default.
- Root `.env` — gitignored.
- **Never commit** `NASA_API_KEY`, `WATSONX_API_KEY`, or `WATSONX_PROJECT_ID`.
- `.env.example` contains only placeholder values and is safe to commit.
