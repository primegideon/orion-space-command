"""
ORION — Forecaster NASA DONKI Custom Component
Langflow 1.11.x — paste this file into the Custom Component editor.

Flow position:  ChatInput → [this node] → LanguageModelComponent → ChatOutput
"""
import json
from datetime import date, timedelta

import requests

from langflow.custom import Component
from langflow.io import IntInput, MessageTextInput, Output, SecretStrInput
from langflow.schema.message import Message


class ForecasterNASA(Component):
    display_name = "Forecaster — NASA DONKI"
    description = "Fetches solar flare data from NASA DONKI API for the past 30 days."
    icon = "sun"

    inputs = [
        MessageTextInput(
            name="user_query",
            display_name="User Query",
            info="The user's message from Chat Input. Connect Chat Input here.",
            required=False,
        ),
        SecretStrInput(
            name="nasa_api_key",
            display_name="NASA API Key",
            info="Your NASA API key. Get one free at https://api.nasa.gov/. Leave blank to use DEMO_KEY.",
            value="DEMO_KEY",
            required=False,
        ),
        IntInput(
            name="lookback_days",
            display_name="Lookback Days",
            info="Number of days back to search for solar flare events (1–90).",
            value=30,
            required=False,
        ),
    ]

    outputs = [
        Output(
            display_name="Flare Data",
            name="flare_data",
            method="fetch_flares",
        )
    ]

    def fetch_flares(self) -> Message:
        api_key = self.nasa_api_key or "DEMO_KEY"
        lookback = max(1, min(90, self.lookback_days or 30))

        today = date.today()
        start_date = (today - timedelta(days=lookback)).isoformat()
        end_date = today.isoformat()

        url = "https://api.nasa.gov/DONKI/FLR"
        params = {
            "startDate": start_date,
            "endDate": end_date,
            "api_key": api_key,
        }

        try:
            resp = requests.get(url, params=params, timeout=20)
            resp.raise_for_status()
            raw = resp.json()
        except Exception as exc:
            payload = {
                "agent": "forecaster",
                "items": [],
                "error": str(exc),
                "summary": "",
            }
            return Message(text=json.dumps(payload))

        # DONKI returns null JSON for empty date ranges
        if raw is None:
            raw = []

        items = []
        for flare in raw:
            # Safe int conversion helper
            def _i(val):
                try:
                    return int(val)
                except (TypeError, ValueError):
                    return None

            items.append(
                {
                    "flr_id": flare.get("flrID", ""),
                    "class_type": flare.get("classType", ""),
                    "begin_time": flare.get("beginTime", ""),
                    "peak_time": flare.get("peakTime", ""),
                    "end_time": flare.get("endTime", ""),
                    "source_location": flare.get("sourceLocation"),
                    "active_region": _i(flare.get("activeRegionNum")),
                }
            )

        payload = {
            "agent": "forecaster",
            "items": items,
            "count": len(items),
            "period": {"start": start_date, "end": end_date},
            "summary": "",
        }
        return Message(text=json.dumps(payload))
