import json
import math
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Any, List, Optional

def angle_diff(a: float, b: float) -> float:
    """Returns absolute minimal difference between two angles in degrees (0 to 180)."""
    diff = (a - b) % 360
    if diff > 180:
        diff = 360 - diff
    return diff

def is_angle_in_window(angle: float, min_deg: float, max_deg: float) -> bool:
    """Checks if an angle lies within a circular window [min_deg, max_deg]."""
    angle = angle % 360
    min_deg = min_deg % 360
    max_deg = max_deg % 360
    if min_deg <= max_deg:
        return min_deg <= angle <= max_deg
    else:
        return angle >= min_deg or angle <= max_deg

def get_swell_exposure(spot_pos: int, swell_dir: float) -> float:
    """Calculates headland sheltering and exposure multiplier for each bay."""
    if spot_pos == 3: # Curl Curl: open swell magnet
        if 130 <= swell_dir <= 200: return 1.15
        if 60 <= swell_dir <= 130: return 1.05
        return 1.0
    elif spot_pos == 4: # Freshwater: enclosed protected cove
        if 140 <= swell_dir <= 210: return 0.80 # S swell headland wrap penalty
        if 75 <= swell_dir <= 115: return 0.95  # Direct East opens the bay
        return 0.85 # NE sheltered
    elif spot_pos == 5: # Queenscliff: sheltered bight / bombie
        if 140 <= swell_dir <= 210: return 0.82 # South swell wrap
        if 50 <= swell_dir <= 110: return 0.95  # E/NE swell direct
        return 0.90
    elif spot_pos == 1: # Long Reef: exposed reef
        return 1.10 if 40 <= swell_dir <= 130 else 1.00
    return 1.0 # Dee Why

class SurfScorer:
    def __init__(self, spots_file: str):
        with open(spots_file, 'r') as f:
            self.spots: List[Dict[str, Any]] = json.load(f)
        self.cached_scores: Optional[Dict[str, Any]] = None
        self.last_fetch_time: float = 0
        self.cache_ttl_seconds: float = 600  # 10 minutes cache
        self.override_pos: Optional[int] = None

    def set_override(self, pos: Optional[int]):
        """Manually override the winning beach position (1-12) or set to None to clear."""
        self.override_pos = pos

    def fetch_conditions_for_spot(self, spot: Dict[str, Any]) -> Dict[str, Any]:
        """Fetch real-time marine and weather data from Open-Meteo."""
        lat = spot["lat"]
        lon = spot["lon"]
        
        marine_url = (
            f"https://marine-api.open-meteo.com/v1/marine?"
            f"latitude={lat}&longitude={lon}&hourly="
            f"wave_height,wave_direction,wave_period,"
            f"swell_wave_height,swell_wave_direction,swell_wave_period&timezone=auto"
        )
        weather_url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}&current="
            f"wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=auto"
        )
        
        headers = {"User-Agent": "SurfClock-ScoringEngine/1.0"}
        
        # Parallel fetch for marine & weather
        def fetch_url(url):
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=8) as resp:
                return json.loads(resp.read().decode())

        with ThreadPoolExecutor(max_workers=2) as ex:
            f_m = ex.submit(fetch_url, marine_url)
            f_w = ex.submit(fetch_url, weather_url)
            marine_data = f_m.result()
            weather_data = f_w.result()

        mh = marine_data.get("hourly", {})
        wc = weather_data.get("current", {})
        
        wave_height = mh.get("wave_height", [0])[0] or 0.0
        wave_period = mh.get("wave_period", [0])[0] or 0.0
        wave_dir = mh.get("wave_direction", [0])[0] or 0.0
        
        swell_height = mh.get("swell_wave_height", [wave_height])[0]
        if swell_height is None or swell_height == 0:
            swell_height = wave_height
            
        swell_period = mh.get("swell_wave_period", [wave_period])[0]
        if swell_period is None or swell_period == 0:
            swell_period = wave_period
            
        swell_dir = mh.get("swell_wave_direction", [wave_dir])[0]
        if swell_dir is None:
            swell_dir = wave_dir
            
        wind_speed = wc.get("wind_speed_10m", 0.0)
        wind_dir = wc.get("wind_direction_10m", 0.0)
        wind_gusts = wc.get("wind_gusts_10m", 0.0)
        
        return {
            "wave_height_m": round(wave_height, 2),
            "swell_height_m": round(swell_height, 2),
            "swell_period_s": round(swell_period, 1),
            "swell_direction_deg": round(swell_dir, 0),
            "wind_speed_kmh": round(wind_speed, 1),
            "wind_direction_deg": round(wind_dir, 0),
            "wind_gusts_kmh": round(wind_gusts, 1),
        }

    def score_spot(self, spot: Dict[str, Any], cond: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate aggregate suitability score (0-100) based on physics & conditions."""
        raw_swell_h = cond["swell_height_m"]
        swell_p = cond["swell_period_s"]
        swell_d = cond["swell_direction_deg"]
        wind_spd = cond["wind_speed_kmh"]
        wind_d = cond["wind_direction_deg"]
        
        # Effective swell height accounting for bathymetry and headland shadowing
        exposure = get_swell_exposure(spot["pos"], swell_d)
        swell_h = raw_swell_h * exposure
        
        # 1. Swell Height Score (0 to 35 pts)
        min_s = spot["min_swell_m"]
        max_s = spot["max_swell_m"]
        ideal_s = (min_s + max_s) / 2.0
        
        if swell_h < min_s:
            height_score = max(0.0, 15.0 * (swell_h / max(0.1, min_s)))
        elif swell_h <= max_s:
            ratio = 1.0 - abs(swell_h - ideal_s) / (max_s - min_s)
            height_score = 25.0 + 10.0 * max(0.0, ratio)
        else:
            excess = swell_h - max_s
            height_score = max(5.0, 30.0 - excess * 10.0)
        # 2. Swell Period Score (0 to 25 pts)
        if swell_p >= 14:
            period_score = 25.0
        elif swell_p >= 11:
            period_score = 20.0 + (swell_p - 11) * (5.0 / 3.0)
        elif swell_p >= 8:
            period_score = 12.0 + (swell_p - 8) * (8.0 / 3.0)
        else:
            period_score = max(2.0, swell_p * 1.5)

        # 3. Swell Direction Alignment (0 to 15 pts)
        in_swell_window = is_angle_in_window(swell_d, spot["optimal_swell_dir_min"], spot["optimal_swell_dir_max"])
        if in_swell_window:
            swell_dir_score = 15.0
        else:
            diff1 = angle_diff(swell_d, spot["optimal_swell_dir_min"])
            diff2 = angle_diff(swell_d, spot["optimal_swell_dir_max"])
            min_diff = min(diff1, diff2)
            swell_dir_score = max(0.0, 15.0 - (min_diff * 0.25))

        # 4. Wind Quality Score (-15 to +25 pts)
        offshore_center = (spot["facing_deg"] + 180) % 360
        wind_diff_from_offshore = angle_diff(wind_d, offshore_center)
        in_offshore_window = is_angle_in_window(wind_d, spot["optimal_wind_dir_min"], spot["optimal_wind_dir_max"])
        
        if wind_spd < 7.0:
            alignment = 1.0 - (wind_diff_from_offshore / 180.0)
            wind_score = 21.0 + 3.0 * alignment
            wind_cond_text = "Glassy / Light Air"
        elif in_offshore_window or wind_diff_from_offshore < 45:
            if wind_spd <= 20:
                wind_score = 25.0
                wind_cond_text = "Clean Offshore"
            else:
                wind_score = 18.0
                wind_cond_text = "Strong Offshore"
        elif wind_diff_from_offshore < 90:
            if wind_spd < 15:
                wind_score = 12.0
                wind_cond_text = "Light Cross-shore"
            else:
                wind_score = 4.0
                wind_cond_text = "Breezy Cross-shore"
        else:
            if wind_spd < 12:
                wind_score = 5.0
                wind_cond_text = "Mild Onshore Bumps"
            elif wind_spd < 22:
                wind_score = -5.0
                wind_cond_text = "Choppy Onshore"
            else:
                wind_score = -15.0
                wind_cond_text = "Blown Out Onshore"

        total = height_score + period_score + swell_dir_score + wind_score
        final_score = int(max(0, min(100, round(total))))
        
        return {
            "score": final_score,
            "raw_score": round(total, 2),
            "effective_swell_h": round(swell_h, 2),
            "wind_condition": wind_cond_text,
            "sub_scores": {
                "height": round(height_score, 1),
                "period": round(period_score, 1),
                "swell_dir": round(swell_dir_score, 1),
                "wind": round(wind_score, 1)
            }
        }

    def _process_one_spot(self, spot: Dict[str, Any]) -> Dict[str, Any]:
        try:
            cond = self.fetch_conditions_for_spot(spot)
            scoring = self.score_spot(spot, cond)
        except Exception as e:
            cond = {"error": str(e), "swell_height_m": 1.2, "swell_period_s": 10.0, "swell_direction_deg": 120, "wind_speed_kmh": 10, "wind_direction_deg": 270}
            scoring = {"score": 50, "wind_condition": "Estimated", "sub_scores": {}}

        return {
            "pos": spot["pos"],
            "name": spot["name"],
            "score": scoring["score"],
            "raw_score": scoring.get("raw_score", scoring["score"]),
            "effective_swell_h": scoring.get("effective_swell_h", cond.get("swell_height_m", 0)),
            "wind_condition": scoring["wind_condition"],
            "conditions": cond,
            "sub_scores": scoring.get("sub_scores", {}),
            "description": spot.get("description", "")
        }

    def evaluate_all(self, force_refresh: bool = False) -> Dict[str, Any]:
        """Evaluate conditions for all 12 spots concurrently."""
        now = time.time()
        if not force_refresh and self.cached_scores and (now - self.last_fetch_time < self.cache_ttl_seconds):
            result = dict(self.cached_scores)
            if self.override_pos is not None:
                result["override_active"] = True
                result["beach_pos"] = self.override_pos
            return result

        # Concurrent processing across all 12 spots
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(self._process_one_spot, self.spots))

        ranked = sorted(results, key=lambda x: x.get("raw_score", x["score"]), reverse=True)
        winner = ranked[0]
        
        payload = {
            "beach_pos": winner["pos"],
            "beach_name": winner["name"],
            "score": winner["score"],
            "wind_condition": winner["wind_condition"],
            "timestamp": int(now),
            "cache_ttl": self.cache_ttl_seconds,
            "override_active": False,
            "spots": sorted(results, key=lambda x: x["pos"])
        }

        self.cached_scores = payload
        self.last_fetch_time = now

        if self.override_pos is not None:
            payload["override_active"] = True
            payload["beach_pos"] = self.override_pos

        return payload
