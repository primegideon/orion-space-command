"""
ORION — Sentinel NASA NeoWs Custom Component
Langflow 1.11.x — paste this file into the Custom Component editor.

Flow position:  ChatInput → [this node] → LanguageModelComponent → ChatOutput
"""
import json
from datetime import date, timedelta

import requests

from langflow.custom import Component
from langflow.io import IntInput, MessageTextInput, Output, SecretStrInput
from langflow.schema.message import Message


class SentinelNASA(Component):
    display_name = "Sentinel — NASA NeoWs"
    description = "Fetches near-Earth asteroid data from NASA NeoWs API for the next 7 days."
    icon = "satellite"

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
            name="days_ahead",
            display_name="Days Ahead",
            info="Number of days ahead to search for close approaches (1–7).",
            value=7,
            required=False,
        ),
    ]

    outputs = [
        Output(
            display_name="Asteroid Data",
            name="asteroid_data",
            method="fetch_asteroids",
        )
    ]

    def fetch_asteroids(self) -> Message:
        api_key = self.nasa_api_key or "DEMO_KEY"
        days = max(1, min(7, self.days_ahead or 7))

        today = date.today()
        start_date = today.isoformat()
        end_date = (today + timedelta(days=days)).isoformat()

        url = "https://api.nasa.gov/neo/rest/v1/feed"
        params = {
            "start_date": start_date,
            "end_date": end_date,
            "api_key": api_key,
        }

        try:
            resp = requests.get(url, params=params, timeout=20)
            resp.raise_for_status()
            raw = resp.json()
        except Exception as exc:
            payload = {
                "agent": "sentinel",
                "items": [],
                "error": str(exc),
                "summary": "",
            }
            return Message(text=json.dumps(payload))

        # Flatten near_earth_objects dict-of-lists
        neo_map = raw.get("near_earth_objects", {})
        items = []
        for _date_key, asteroids in neo_map.items():
            for ast in asteroids:
                # Safe float conversion helper
                def _f(val):
                    try:
                        return float(val)
                    except (TypeError, ValueError):
                        return None

                approach = (ast.get("close_approach_data") or [{}])[0]

                items.append(
                    {
                        "name": ast.get("name", ""),
                        "estimated_diameter_km_max": _f(
                            ast.get("estimated_diameter", {})
                            .get("kilometers", {})
                            .get("estimated_diameter_max")
                        ),
                        "is_potentially_hazardous": ast.get(
                            "is_potentially_hazardous_asteroid", False
                        ),
                        "miss_distance_km": _f(
                            approach.get("miss_distance", {}).get("kilometers")
                        ),
                        "relative_velocity_kmh": _f(
                            approach.get("relative_velocity", {}).get(
                                "kilometers_per_hour"
                            )
                        ),
                        "close_approach_date": approach.get("close_approach_date", ""),
                    }
                )

        # Sort by miss_distance_km ascending (closest first); nulls last
        items.sort(key=lambda x: x["miss_distance_km"] if x["miss_distance_km"] is not None else float("inf"))

        payload = {
            "agent": "sentinel",
            "items": items,
            "count": len(items),
            "date_range": {"start": start_date, "end": end_date},
            "summary": "",
        }
        return Message(text=json.dumps(payload))
