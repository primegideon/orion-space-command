# ORION Phase 3 — Wiring NASA Components into Langflow

This guide covers how to add the custom NASA data-fetching nodes to the existing Sentinel and Forecaster flows in the Langflow UI. No JSON file editing is required — everything is done through point-and-click.

---

## Prerequisites

- Langflow is running at `http://localhost:7860` (start with `python -m langflow run` from the `.venv`).
- The Phase 2 flows (`ORION Sentinel — Asteroid Tracker` and `ORION Forecaster — Solar Weather`) are already imported and visible in the Langflow workspace.
- You have a NASA API key. Get one free at <https://api.nasa.gov/>. You can also use `DEMO_KEY` for testing (rate-limited).

---

## Part 1 — Sentinel Flow (NASA NeoWs Asteroids)

### Step 1 — Open the Sentinel flow

1. Open Langflow at `http://localhost:7860`.
2. Click the **Sentinel** flow card (`ORION Sentinel — Asteroid Tracker`) to open the canvas.

### Step 2 — Add the Sentinel NASA custom component

1. In the left sidebar, click **Custom Component** (it looks like `{ }` or is labelled "Custom Component" under the Components section).
2. A new blank custom component node appears on the canvas.
3. Click the **`< >`** (code) button on the node to open the code editor.
4. **Delete all existing placeholder code** in the editor.
5. Open `langflow/components/sentinel_nasa.py` in any text editor, **select all**, and **paste** into the Langflow code editor.
6. Click **Check & Save** (or the equivalent compile button). Langflow will validate the code and refresh the node's input/output ports. The node title should change to **"Sentinel — NASA NeoWs"**.

### Step 3 — Configure the Sentinel NASA node

1. On the **"Sentinel — NASA NeoWs"** node, fill in the inputs:
   - **NASA API Key** — paste your NASA API key here. To keep it secret, use a Langflow Global Variable instead (see tip below).
   - **Days Ahead** — leave at `7` (searches the next 7 days for close approaches).

> **Tip — Langflow Global Variables:**  
> Go to **Settings → Global Variables → + Add**. Create a variable named `NASA_API_KEY` with your key value and type `Credential`. Back on the node, click the 🔑 icon next to "NASA API Key" and select the global variable. This avoids storing the key in the flow JSON.

### Step 4 — Rebuild the flow wiring

The current Sentinel flow is:
```
ChatInput ──► LanguageModelComponent ──► ChatOutput
```

It needs to become:
```
ChatInput ──► Sentinel NASA ──► LanguageModelComponent ──► ChatOutput
```

To rewire:

1. **Delete** the existing edge between `ChatInput` and `LanguageModelComponent` (click it and press `Delete`).
2. Draw a new edge from **ChatInput → `message` output** to **Sentinel NASA → (any input, or just let the LLM read from it)**. Actually: the Sentinel NASA component does NOT take the chat input as an input — it fetches data independently. Therefore the wiring is:
   - **ChatInput `message`** → **LanguageModelComponent `input_value`** (keep this edge to pass the user's question)
   - **Sentinel NASA `Asteroid Data`** → **LanguageModelComponent `input_value`** (connect the asteroid JSON as additional input)

   > **Note:** `LanguageModelComponent` accepts multiple connections to `input_value`; both the user message and the asteroid JSON will be concatenated and sent to the LLM. Alternatively, if you prefer cleaner prompting, delete the ChatInput → LLM edge and connect only Sentinel NASA → LLM — the component ignores chat input and always fetches fresh data.

   **Recommended wiring (simplest, cleanest):**
   1. Delete the edge: `ChatInput → LanguageModelComponent`.
   2. Connect: `Sentinel NASA (Asteroid Data)` → `LanguageModelComponent (input_value)`.
   3. Keep: `LanguageModelComponent` → `ChatOutput` (unchanged).

### Step 5 — Update the LLM system message

1. Click the **LanguageModelComponent** node on the canvas.
2. Find the **System Message** field (it may be collapsed under "Advanced").
3. Replace the existing stub system message with:

```
You are the Sentinel agent of ORION. You will receive a JSON object containing asteroid data from NASA NeoWs.
Write a concise, engaging mission briefing (3-5 sentences) summarising the asteroid threat landscape.
Mention the total count, the closest approach, and flag any potentially hazardous asteroids.
Return ONLY a JSON object: {"agent": "sentinel", "items": <paste the items array from input>, "count": <N>, "summary": "<your briefing>"}
```

### Step 6 — Save and test the Sentinel flow

1. Click **Save** (or `Ctrl+S`).
2. Click the **Playground** button (▶) to open the built-in chat tester.
3. Send: `show me asteroids approaching this week`
4. The response should be a JSON object containing `items` with real asteroid names, miss distances, and a Granite-generated `summary`.

**Expected output shape:**
```json
{
  "agent": "sentinel",
  "items": [
    {
      "name": "(2024 XY1)",
      "estimated_diameter_km_max": 0.12,
      "is_potentially_hazardous": false,
      "miss_distance_km": 1234567.89,
      "relative_velocity_kmh": 45000.0,
      "close_approach_date": "2025-07-20"
    }
  ],
  "count": 23,
  "summary": "Sentinel tracking 23 near-Earth objects over the next 7 days..."
}
```

---

## Part 2 — Forecaster Flow (NASA DONKI Solar Flares)

### Step 1 — Open the Forecaster flow

1. Navigate back to the Langflow workspace home.
2. Click the **Forecaster** flow card (`ORION Forecaster — Solar Weather`).

### Step 2 — Add the Forecaster NASA custom component

1. Click **Custom Component** in the sidebar.
2. Click the **`< >`** code button on the new node.
3. Delete the placeholder code.
4. Open `langflow/components/forecaster_nasa.py`, select all, and paste into the code editor.
5. Click **Check & Save**. The node title should update to **"Forecaster — NASA DONKI"**.

### Step 3 — Configure the Forecaster NASA node

1. **NASA API Key** — same key as before (or reuse the Global Variable).
2. **Lookback Days** — leave at `30` (fetches flares from the past 30 days).

### Step 4 — Rebuild the flow wiring

Recommended (same pattern as Sentinel):
1. Delete: `ChatInput → LanguageModelComponent`.
2. Connect: `Forecaster NASA (Flare Data)` → `LanguageModelComponent (input_value)`.
3. Keep: `LanguageModelComponent` → `ChatOutput`.

### Step 5 — Update the LLM system message

Replace the stub system message on the `LanguageModelComponent` node with:

```
You are the Forecaster agent of ORION. You will receive a JSON object containing solar flare data from NASA DONKI.
Write a concise space weather briefing (3-5 sentences) summarising recent solar activity.
Mention flare classes, the most intense event, and any operational implications.
Return ONLY a JSON object: {"agent": "forecaster", "items": <paste the items array from input>, "count": <N>, "summary": "<your briefing>"}
```

### Step 6 — Save and test the Forecaster flow

1. Save the flow.
2. Open Playground.
3. Send: `what solar flares happened recently?`
4. Expect a JSON response with `items` (flare records) and a Granite-generated `summary`.

**Expected output shape:**
```json
{
  "agent": "forecaster",
  "items": [
    {
      "flr_id": "2025-06-20T03:24:00-FLR-001",
      "class_type": "M1.2",
      "begin_time": "2025-06-20T03:24Z",
      "peak_time": "2025-06-20T03:31Z",
      "end_time": "2025-06-20T03:38Z",
      "source_location": "N12W34",
      "active_region": 13700
    }
  ],
  "count": 5,
  "summary": "Space weather activity was moderate over the past 30 days..."
}
```

---

## Part 3 — Export updated flows

After testing both flows, export them to keep the flow JSONs in version control:

1. In the Langflow flow editor, open **Settings → Export** (or the `⋮` menu on the flow card → **Export**).
2. Save as `langflow/flows/sentinel-flow.json` (overwrite the Phase 2 stub).
3. Repeat for `langflow/flows/forecaster-flow.json`.

---

## Part 4 — Validate NASA endpoints independently

Before or after the Langflow wiring, you can verify the NASA APIs work with your key using the standalone test script:

```bash
# From the project root, with .venv activated:

# Using your real key (set in environment):
python scripts/test_nasa_apis.py

# Force DEMO_KEY (safe for quick sanity check):
python scripts/test_nasa_apis.py --demo
```

Expected output on success:
```
TEST 1 — NASA NeoWs: Near-Earth Asteroids
  Date range: 2025-07-19 → 2025-07-26
  Total asteroids found: 28
  Closest 3 asteroids:
    1. (2025 BD3)  —  Miss distance: 1,234,567 km
    ...
  PASS ✓

TEST 2 — NASA DONKI: Solar Flare Events
  Date range: 2025-06-19 → 2025-07-19
  Total flares found: 7
  First 3 flare events:
    1. Class M1.2 — peak: 2025-06-20T03:31Z
    ...
  PASS ✓
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Check & Save` shows a red import error for `langflow.custom` | Langflow version mismatch | Ensure Langflow ≥ 1.11 is installed: `pip show langflow` |
| Node title doesn't update after saving | Code syntax error | Check the error panel below the code editor for traceback |
| `{"error": "403 Client Error"}` in the flow output | Invalid NASA API key | Double-check the key value; use `--demo` flag to isolate |
| DONKI returns an empty items list | No solar flares in the window | Normal during quiet periods; try extending `lookback_days` to 90 |
| LLM returns raw JSON without a `summary` | System message not updated | Ensure the system message on `LanguageModelComponent` was replaced in Step 5 |
| `requests` not found inside Langflow component | Wrong Python env | Langflow runs inside `.venv` where `requests` is installed — confirm `.venv` is active |
