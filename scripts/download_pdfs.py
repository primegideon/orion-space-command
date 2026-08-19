"""
ORION — Phase 4
Downloads curated arXiv astrophysics PDFs into ./data/pdfs/.

Sources are documented in ./data/README.md.
Run once: python scripts/download_pdfs.py
"""
import os
import sys
import time

import io

import requests

# Force UTF-8 output on Windows consoles
import sys as _sys
if hasattr(_sys.stdout, "buffer"):
    import io as _io
    _sys.stdout = _io.TextIOWrapper(_sys.stdout.buffer, encoding="utf-8", errors="replace")

# ---------------------------------------------------------------------------
# Curated paper list
# Each entry: (arxiv_id, short_slug)
# PDF URL pattern: https://arxiv.org/pdf/<id>.pdf
# ---------------------------------------------------------------------------
PAPERS = [
    # Near-Earth Objects / Asteroids
    ("2301.05916", "nea_survey_review"),           # Near-Earth Asteroid survey review
    ("2009.01844", "neo_population_model"),         # NEO population orbital model
    ("1905.02983", "asteroid_hazard_mitigation"),   # Asteroid hazard & deflection strategies
    # Solar Flares / Space Weather
    ("2209.00789", "solar_flare_forecasting_ml"),   # ML-based solar flare forecasting
    ("2101.08502", "solar_flare_prediction_cnn"),   # CNN for solar flare prediction
    ("1912.08596", "solar_energetic_particles"),    # Solar energetic particle events
    # General Astrophysics
    ("2112.03863", "jwst_early_universe"),          # JWST early-universe observations
    ("2204.05243", "astrophysics_llm_survey"),      # NLP/ML in astrophysics survey
]

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "pdfs")


def download(arxiv_id: str, slug: str, dest_dir: str) -> bool:
    """Download a single arXiv PDF. Returns True on success."""
    url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
    dest_path = os.path.join(dest_dir, f"{slug}__{arxiv_id}.pdf")

    if os.path.exists(dest_path):
        size_kb = os.path.getsize(dest_path) // 1024
        print(f"  [skip] {slug}__{arxiv_id}.pdf already exists ({size_kb} KB)")
        return True

    print(f"  [fetch] {url}")
    try:
        resp = requests.get(url, timeout=60, stream=True)
        resp.raise_for_status()
        with open(dest_path, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=65536):
                fh.write(chunk)
        size_kb = os.path.getsize(dest_path) // 1024
        print(f"  [ok]   saved -> {os.path.basename(dest_path)} ({size_kb} KB)")
        return True
    except Exception as exc:
        print(f"  [err]  {slug} ({arxiv_id}): {exc}", file=sys.stderr)
        # Remove partial file if it exists
        if os.path.exists(dest_path):
            os.remove(dest_path)
        return False


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Destination: {os.path.abspath(OUTPUT_DIR)}")
    print(f"Downloading {len(PAPERS)} papers…\n")

    failed = []
    for i, (arxiv_id, slug) in enumerate(PAPERS):
        success = download(arxiv_id, slug, OUTPUT_DIR)
        if not success:
            failed.append(arxiv_id)
        # Be polite to arXiv servers — 1 s gap between requests
        if i < len(PAPERS) - 1:
            time.sleep(1)

    print(f"\n--- Done ---")
    total = len(PAPERS)
    ok = total - len(failed)
    print(f"{ok}/{total} PDFs downloaded successfully.")
    if failed:
        print(f"Failed IDs: {', '.join(failed)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
