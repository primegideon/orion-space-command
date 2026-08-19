"""
ORION — Model Candidate Test
Tests every available IBM watsonx model for JSON instruction-following quality.
Run: python scripts/test_model_candidates.py

Requires: WATSONX_API_KEY, WATSONX_PROJECT_ID in environment.
"""
import os, sys, json, time

MODELS = [
    "ibm/granite-4h-small",
    "meta-llama/llama-3-3-70b-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct-fp8",
    "mistral-large-2512",
    "mistralai/mistral-medium-2505",
    "mistralai/mistral-small-3-1-24b-instruct-2503",
]

ROUTING_PROMPT = (
    "You are a space intelligence routing system. "
    "Given the user query below, return ONLY a valid JSON object — no markdown, no explanation.\n\n"
    'Example output: {"intent": "sentinel", "query": "asteroids", "reasoning": "user asked about asteroids"}\n\n'
    'Available intents: sentinel (asteroids), forecaster (solar flares), archivist (research papers)\n\n'
    'User query: "show me asteroids approaching this week"\n\n'
    "JSON:"
)

def test_model(model_id, credentials, project_id):
    from ibm_watsonx_ai.foundation_models import ModelInference
    try:
        model = ModelInference(
            model_id=model_id,
            credentials=credentials,
            project_id=project_id,
            params={"max_new_tokens": 256, "temperature": 0.0},
        )
        t0 = time.time()
        raw = model.generate_text(prompt=ROUTING_PROMPT)
        elapsed = time.time() - t0

        # Strip fences
        text = raw.strip()
        for fence in ("```json", "```"):
            if text.startswith(fence):
                text = text[len(fence):]
        text = text.rstrip("`").strip()

        parsed = json.loads(text)
        intent = parsed.get("intent", "")
        ok = intent == "sentinel"
        return {
            "status": "PASS" if ok else "WRONG_INTENT",
            "intent": intent,
            "elapsed": f"{elapsed:.1f}s",
            "raw": raw.strip()[:120],
        }
    except json.JSONDecodeError as e:
        return {"status": "BAD_JSON", "error": str(e), "raw": (raw if 'raw' in dir() else "")[:120]}
    except Exception as e:
        err = str(e)
        if "not available" in err.lower() or "404" in err or "not found" in err.lower():
            return {"status": "NOT_AVAILABLE", "error": err[:80]}
        return {"status": "ERROR", "error": err[:80]}

def main():
    try:
        from ibm_watsonx_ai import Credentials
    except ImportError:
        print("ERROR: pip install ibm-watsonx-ai"); sys.exit(1)

    api_key = os.environ.get("WATSONX_API_KEY")
    project_id = os.environ.get("WATSONX_PROJECT_ID")
    url = os.environ.get("WATSONX_URL", "https://us-south.ml.cloud.ibm.com")
    if not api_key or not project_id:
        print("ERROR: Set WATSONX_API_KEY and WATSONX_PROJECT_ID"); sys.exit(1)

    credentials = Credentials(url=url, api_key=api_key)

    print("=" * 70)
    print("ORION — Model Candidate Test (JSON routing prompt)")
    print("=" * 70)
    print(f"Testing {len(MODELS)} models...\n")

    results = []
    for model_id in MODELS:
        short = model_id.split("/")[-1][:35]
        print(f"Testing {short:<35}", end=" ", flush=True)
        r = test_model(model_id, credentials, project_id)
        status = r["status"]
        elapsed = r.get("elapsed", "-")
        print(f"[{status}] {elapsed}")
        if status not in ("NOT_AVAILABLE", "ERROR"):
            print(f"  Raw: {r.get('raw','')}")
        results.append((model_id, r))

    print("\n" + "=" * 70)
    print("RECOMMENDATION")
    print("=" * 70)
    passed = [(m, r) for m, r in results if r["status"] == "PASS"]
    if passed:
        print(f"Best model: {passed[0][0]}")
        print(f"  -> Returned correct intent 'sentinel' in {passed[0][1]['elapsed']}")
    else:
        wrong = [(m, r) for m, r in results if r["status"] == "WRONG_INTENT"]
        if wrong:
            print(f"No perfect match, but {wrong[0][0]} returned valid JSON (wrong intent).")
        else:
            print("No models returned valid JSON. Check credentials or try again.")

if __name__ == "__main__":
    main()
