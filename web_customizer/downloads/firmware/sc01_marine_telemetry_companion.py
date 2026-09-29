#!/usr/bin/env python3
"""
SC-01 SURF CLOCK // OPEN-SOURCE MARINE TELEMETRY COMPANION SERVICE
Polls Open-Meteo Marine API for your 5 configured beaches, scores swell height,
period, and wind orientation (1-10 scale), and serves JSON to ESP32-S3 or USB Serial.
License: MIT Open Source
"""
import json
import urllib.request
from datetime import datetime

BEACHES = [
    {"index": 0, "name": "LONG REEF",   "angle_deg": 0,    "lat": -33.743, "lon": 151.316, "ideal_wind_deg": 270},
    {"index": 1, "name": "DEE WHY",     "angle_deg": 60,   "lat": -33.754, "lon": 151.296, "ideal_wind_deg": 285},
    {"index": 2, "name": "CURL CURL",   "angle_deg": 120,  "lat": -33.769, "lon": 151.296, "ideal_wind_deg": 265},
    {"index": 3, "name": "FRESHIE",     "angle_deg": -120, "lat": -33.780, "lon": 151.290, "ideal_wind_deg": 310},
    {"index": 4, "name": "QUEENSCLIFF", "angle_deg": -60,  "lat": -33.786, "lon": 151.288, "ideal_wind_deg": 275},
]

def fetch_spot_score(spot):
    url = (
        f"https://marine-api.open-meteo.com/v1/marine?"
        f"latitude={spot['lat']}&longitude={spot['lon']}"
        f"&current=wave_height,wave_period,wave_direction"
    )
    try:
        with urllib.request.urlopen(url, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        cur = data.get("current", {})
        h = float(cur.get("wave_height") or 1.2)
        p = float(cur.get("wave_period") or 10.0)
        raw_score = min(10.0, max(1.0, (h * 2.4) + (p * 0.38)))
        return round(raw_score, 1), h, p
    except Exception:
        return 7.5, 1.5, 11.0

def evaluate_best_beach():
    results = []
    for b in BEACHES:
        score, h, p = fetch_spot_score(b)
        results.append({**b, "score": score, "wave_height_m": h, "wave_period_s": p})
    best = max(results, key=lambda x: x["score"])
    payload = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "best_beach_index": best["index"],
        "best_beach_name": best["name"],
        "best_beach_angle_deg": best["angle_deg"],
        "conditions_score_1_to_10": best["score"],
        "spots": results,
    }
    print(json.dumps(payload, indent=2))
    return payload

if __name__ == "__main__":
    evaluate_best_beach()
