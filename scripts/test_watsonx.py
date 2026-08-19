#!/usr/bin/env python3
"""
ORION — IBM watsonx Connection Test
Directly tests the IBM watsonx Granite model independent of Langflow.

Usage:
    python scripts/test_watsonx.py

Environment variables (required):
    WATSONX_API_KEY     Your IBM Cloud API key
    WATSONX_PROJECT_ID  Your watsonx.ai project ID
    WATSONX_URL         watsonx.ai endpoint (default: https://us-south.ml.cloud.ibm.com)
"""

import os
import sys

REQUIRED_ENV_VARS = ["WATSONX_API_KEY", "WATSONX_PROJECT_ID"]
DEFAULT_URL = "https://us-south.ml.cloud.ibm.com"
TEST_PROMPT = "Reply with only the word: ONLINE"
MODEL_ID = "meta-llama/llama-4-maverick-17b-128e-instruct-fp8"


def check_env() -> tuple[str, str, str]:
    missing = [v for v in REQUIRED_ENV_VARS if not os.environ.get(v)]
    if missing:
        print("ERROR: The following required environment variables are not set:")
        for var in missing:
            print(f"  {var}")
        print(
            "\nSet them before running this script:\n"
            "  Windows (PowerShell):\n"
            '    $env:WATSONX_API_KEY    = "your-api-key"\n'
            '    $env:WATSONX_PROJECT_ID = "your-project-id"\n'
            "\n"
            "  macOS / Linux:\n"
            '    export WATSONX_API_KEY="your-api-key"\n'
            '    export WATSONX_PROJECT_ID="your-project-id"\n'
        )
        sys.exit(1)

    api_key = os.environ["WATSONX_API_KEY"]
    project_id = os.environ["WATSONX_PROJECT_ID"]
    url = os.environ.get("WATSONX_URL", DEFAULT_URL).rstrip("/")
    return api_key, project_id, url


def main() -> None:
    print("=" * 60)
    print("ORION — IBM watsonx Connection Test")
    print("=" * 60)

    # Check dependencies
    try:
        from ibm_watsonx_ai import Credentials
        from ibm_watsonx_ai.foundation_models import ModelInference
    except ImportError:
        print(
            "ERROR: 'ibm-watsonx-ai' is not installed.\n"
            "Run: pip install ibm-watsonx-ai"
        )
        sys.exit(1)

    api_key, project_id, url = check_env()

    print(f"Model      : {MODEL_ID}")
    print(f"Endpoint   : {url}")
    print(f"Project ID : {project_id[:8]}...{project_id[-4:]}")  # partial for safety
    print(f"API Key    : {api_key[:4]}...{api_key[-4:]}")         # partial for safety
    print(f"Prompt     : {TEST_PROMPT!r}")
    print("-" * 60)
    print("Sending test prompt...")

    try:
        credentials = Credentials(
            url=url,
            api_key=api_key,
        )
        model = ModelInference(
            model_id=MODEL_ID,
            credentials=credentials,
            project_id=project_id,
            params={
                "max_new_tokens": 16,
                "temperature": 0.0,
            },
        )
        result = model.generate_text(prompt=TEST_PROMPT)
    except Exception as exc:
        error_str = str(exc)
        if "401" in error_str or "Unauthorized" in error_str or "authentication" in error_str.lower():
            print(
                "ERROR: Authentication failed.\n"
                "  - Check that WATSONX_API_KEY is a valid IBM Cloud API key.\n"
                "  - Ensure your watsonx.ai service is active at:\n"
                "    https://dataplatform.cloud.ibm.com\n"
                f"\nOriginal error: {exc}"
            )
        elif "403" in error_str or "Forbidden" in error_str:
            print(
                "ERROR: Access denied.\n"
                "  - Check that WATSONX_PROJECT_ID is correct.\n"
                "  - Ensure your IBM Cloud account has access to the watsonx.ai service.\n"
                f"\nOriginal error: {exc}"
            )
        elif "404" in error_str or "not found" in error_str.lower():
            print(
                f"ERROR: Model {MODEL_ID!r} not found or not available in your region.\n"
                "  - Check that WATSONX_URL points to the correct region endpoint.\n"
                f"\nOriginal error: {exc}"
            )
        else:
            print(f"ERROR: Unexpected error while calling watsonx:\n{exc}")
        sys.exit(1)

    print()
    print("--- Model Response ---")
    print(repr(result))
    print()

    response_text = result.strip() if isinstance(result, str) else str(result).strip()

    if "ONLINE" in response_text.upper():
        print("RESULT: SUCCESS — watsonx Granite is reachable and responding correctly.")
    else:
        print(
            f"RESULT: PARTIAL — Model responded but output {response_text!r} does not "
            "contain the expected word 'ONLINE'.\n"
            "        The model is reachable; prompt adherence may vary."
        )


if __name__ == "__main__":
    main()
