#!/usr/bin/env python3
"""
ORION — Langflow Smoke Test
Tests the Master Router flow by sending a query and checking for a valid intent response.

Usage:
    python scripts/test_langflow.py
    python scripts/test_langflow.py --query "what solar flares happened recently?"

Environment variables:
    LANGFLOW_URL     Base URL for Langflow (default: http://localhost:7860)
    LANGFLOW_FLOW_ID Flow ID for the Master Router (required if not set, will prompt)
"""

import argparse
import json
import os
import sys

try:
    import requests
except ImportError:
    print("ERROR: 'requests' is not installed. Run: pip install requests")
    sys.exit(1)


DEFAULT_LANGFLOW_URL = "http://localhost:7860"
DEFAULT_QUERY = "test query: show me approaching asteroids"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Smoke-test the ORION Master Router Langflow flow."
    )
    parser.add_argument(
        "--query",
        type=str,
        default=DEFAULT_QUERY,
        help="Natural-language query to send to the router (default: %(default)r)",
    )
    parser.add_argument(
        "--url",
        type=str,
        default=None,
        help="Langflow base URL (overrides LANGFLOW_URL env var)",
    )
    parser.add_argument(
        "--flow-id",
        type=str,
        default=None,
        help="Master Router flow ID (overrides LANGFLOW_FLOW_ID env var)",
    )
    return parser.parse_args()


def get_langflow_url(args: argparse.Namespace) -> str:
    if args.url:
        return args.url.rstrip("/")
    url = os.environ.get("LANGFLOW_URL", DEFAULT_LANGFLOW_URL)
    return url.rstrip("/")


def get_flow_id(args: argparse.Namespace) -> str:
    if args.flow_id:
        return args.flow_id
    flow_id = os.environ.get("LANGFLOW_FLOW_ID", "")
    if not flow_id or flow_id == "your-flow-id-here":
        print(
            "LANGFLOW_FLOW_ID is not set.\n"
            "Import the orion-router.json flow in the Langflow UI and copy its ID from\n"
            "the browser URL: http://localhost:7860/flow/<FLOW_ID>\n"
        )
        flow_id = input("Enter your Master Router flow ID: ").strip()
        if not flow_id:
            print("ERROR: No flow ID provided. Exiting.")
            sys.exit(1)
    return flow_id


def extract_agent_text(response_json: dict) -> str | None:
    """Navigate the Langflow response envelope to the agent output text."""
    try:
        return (
            response_json["outputs"][0]["outputs"][0]["results"]["message"]["text"]
        )
    except (KeyError, IndexError, TypeError):
        return None


def main() -> None:
    args = parse_args()
    langflow_url = get_langflow_url(args)
    flow_id = get_flow_id(args)
    query = args.query

    endpoint = f"{langflow_url}/api/v1/run/{flow_id}"
    payload = {"input_value": query}

    print("=" * 60)
    print("ORION Langflow Smoke Test")
    print("=" * 60)
    print(f"Endpoint : {endpoint}")
    print(f"Query    : {query!r}")
    print("-" * 60)

    try:
        response = requests.post(endpoint, json=payload, timeout=60)
    except requests.exceptions.ConnectionError:
        print(
            f"ERROR: Could not connect to Langflow at {langflow_url}\n"
            "Make sure Langflow is running: python -m langflow run"
        )
        sys.exit(1)
    except requests.exceptions.Timeout:
        print("ERROR: Request timed out after 60 seconds. Langflow may be overloaded.")
        sys.exit(1)

    print(f"HTTP Status : {response.status_code}")
    print()
    print("--- Raw Response ---")
    print(response.text)
    print()

    # Attempt to parse the top-level Langflow envelope
    try:
        response_json = response.json()
    except json.JSONDecodeError:
        print("RESULT: FAIL — Response is not valid JSON.")
        sys.exit(1)

    # Extract the agent output text from the Langflow envelope
    agent_text = extract_agent_text(response_json)

    if agent_text is None:
        print(
            "WARNING: Could not extract agent text from the standard Langflow response path.\n"
            "         Check the raw response above for the actual output location."
        )
    else:
        print("--- Agent Output Text ---")
        print(agent_text)
        print()

        # Try to parse the agent text itself as JSON
        # Strip markdown code fences if present (Granite sometimes wraps output)
        clean_text = agent_text.strip()
        if clean_text.startswith("```"):
            lines = clean_text.splitlines()
            clean_text = "\n".join(
                line for line in lines if not line.startswith("```")
            ).strip()

        try:
            agent_json = json.loads(clean_text)
            print("--- Parsed Agent JSON ---")
            print(json.dumps(agent_json, indent=2))
            print()

            if "intent" in agent_json:
                intent = agent_json["intent"]
                valid_intents = {"sentinel", "forecaster", "archivist"}
                if intent in valid_intents:
                    print(f"RESULT: SUCCESS — intent classified as: {intent!r}")
                else:
                    print(
                        f"RESULT: PARTIAL — 'intent' field present but value {intent!r} "
                        f"is not one of {valid_intents}"
                    )
            else:
                print(
                    "RESULT: PARTIAL — Agent returned valid JSON but 'intent' field is missing.\n"
                    "        The stub flows return {agent, items, summary} instead of {intent}.\n"
                    "        Run against the Master Router flow ID for intent classification."
                )
        except json.JSONDecodeError:
            print(
                "RESULT: PARTIAL — Agent text is not valid JSON. "
                "The LLM may have added extra text around the JSON object.\n"
                "        Raw agent text is shown above."
            )


if __name__ == "__main__":
    main()
