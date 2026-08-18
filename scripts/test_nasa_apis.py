"""
Standalone test script for NASA NeoWs and DONKI FLR endpoints.

Usage:
    python scripts/test_nasa_apis.py          # uses NASA_API_KEY env var
    python scripts/test_nasa_apis.py --demo   # forces DEMO_KEY
"""
import argparse
import os
import sys
from datetime import date, timedelta

import requests

# ── Argument parsing ──────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Test NASA NeoWs and DONKI APIs")
parser.add_argument("--demo", action="store_true", help="Force use of DEMO_KEY")
args = parser.parse_args()

# ── API key resolution ────────────────────────────────────────────────────────
if args.demo:
    API_KEY = "DEMO_KEY"
    print("INFO: --demo flag set - using DEMO_KEY\n")
else:
    API_KEY = os.environ.get("NASA_API_KEY", "")
    if not API_KEY:
        print(
            "WARNING: NASA_API_KEY not set in environment - falling back to DEMO_KEY "
            "(rate-limited to 30 req/hour). Set NASA_API_KEY to use your real key.\n"
        )
        API_KEY = "DEMO_KEY"
    else:
        print(f"INFO: Using NASA_API_KEY from environment ({API_KEY[:4]}...)\n")

TODAY = date.today()
SEPARATOR = "-" * 60


# ── Helper ────────────────────────────────────────────────────────────────────
def get_json(url: str, params: dict) -> dict | list | None:
    """GET JSON from a URL, raise on HTTP error."""
    resp = requests.get(url, params=params, timeout=20)
    resp.raise_for_status()
    return resp.json()


# ── Test 1: NeoWs (Near-Earth Objects Web Service) ───────────────────────────
print(SEPARATOR)
print("TEST 1 - NASA NeoWs: Near-Earth Asteroids")
print(SEPARATOR)

neows_url = "https://api.nasa.gov/neo/rest/v1/feed"
start_date = TODAY.isoformat()
end_date = (TODAY + timedelta(days=7)).isoformat()

neows_params = {
    "start_date": start_date,
    "end_date": end_date,
    "api_key": API_KEY,
}

try:
    data = get_json(neows_url, neows_params)

    # Flatten near_earth_objects dict-of-lists into a flat list
    neo_objects = data.get("near_earth_objects", {})
    all_asteroids = []
    for date_key, asteroids in neo_objects.items():
        all_asteroids.extend(asteroids)

    print(f"  Date range: {start_date} -> {end_date}")
    print(f"  Total asteroids found: {len(all_asteroids)}")
    print()

    # Sort by miss distance (ascending) and print first 3
    def miss_km(a):
        try:
            return float(
                a["close_approach_data"][0]["miss_distance"]["kilometers"]
            )
        except (IndexError, KeyError, ValueError, TypeError):
            return float("inf")

    all_asteroids.sort(key=miss_km)

    print("  Closest 3 asteroids:")
    for i, ast in enumerate(all_asteroids[:3], start=1):
        name = ast.get("name", "unknown")
        dist = miss_km(ast)
        print(f"    {i}. {name}")
        print(f"       Miss distance: {dist:,.0f} km")

    print()
    print("  PASS")

except requests.HTTPError as exc:
    print(f"  FAIL - HTTP error: {exc}")
    sys.exit(1)
except Exception as exc:
    print(f"  FAIL - Unexpected error: {exc}")
    sys.exit(1)


# ── Test 2: DONKI FLR (Solar Flare Events) ───────────────────────────────────
print()
print(SEPARATOR)
print("TEST 2 - NASA DONKI: Solar Flare Events")
print(SEPARATOR)

donki_url = "https://api.nasa.gov/DONKI/FLR"
start_30 = (TODAY - timedelta(days=30)).isoformat()
end_today = TODAY.isoformat()

donki_params = {
    "startDate": start_30,
    "endDate": end_today,
    "api_key": API_KEY,
}

try:
    flares = get_json(donki_url, donki_params)

    # DONKI returns null JSON for date ranges with no data
    if flares is None:
        flares = []

    print(f"  Date range: {start_30} -> {end_today}")
    print(f"  Total flares found: {len(flares)}")
    print()

    if flares:
        print("  First 3 flare events:")
        for i, flare in enumerate(flares[:3], start=1):
            cls = flare.get("classType", "unknown")
            peak = flare.get("peakTime", "unknown")
            print(f"    {i}. Class {cls} - peak: {peak}")
    else:
        print("  No flare events in the past 30 days (this is normal during low solar activity).")

    print()
    print("  PASS")

except requests.HTTPError as exc:
    print(f"  FAIL - HTTP error: {exc}")
    sys.exit(1)
except Exception as exc:
    print(f"  FAIL - Unexpected error: {exc}")
    sys.exit(1)


print()
print(SEPARATOR)
print("All NASA API tests passed.")
print(SEPARATOR)
