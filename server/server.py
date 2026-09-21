#!/usr/bin/env python3
"""
SurfClock Scoring & API Server
Serves real-time surf scoring for the ESP32 SurfClock edge controller and web dashboard.
"""

import os
import json
import socket
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from scorer import SurfScorer

PORT = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SPOTS_FILE = os.path.join(BASE_DIR, "spots.json")
STATIC_DIR = os.path.join(BASE_DIR, "static")

scorer = SurfScorer(SPOTS_FILE)

def get_local_ip():
    """Get local IP address to display for ESP32 configuration."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

class SurfClockHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {self.command} {self.path} -> {args[1]}")

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/surf" or path == "/surf":
            query = parse_qs(parsed.query)
            force = "force" in query
            data = scorer.evaluate_all(force_refresh=force)
            
            raw_rating = max(1.0, min(10.0, data["score"] / 10.0))
            payload = {
                "beach_pos": data["beach_pos"],
                "beach_name": data["beach_name"],
                "score": data["score"],
                "conditions_rating": round(raw_rating, 1),
                "conditions_int": max(1, min(10, round(raw_rating))),
                "wind_condition": data["wind_condition"],
                "timestamp": data["timestamp"],
                "override_active": data.get("override_active", False),
                "spots": data.get("spots", [])
            }
            
            body = json.dumps(payload, indent=2).encode('utf-8')
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(body)

        elif path == "/api/spots":
            query = parse_qs(parsed.query)
            force = "force" in query
            data = scorer.evaluate_all(force_refresh=force)
            body = json.dumps(data, indent=2).encode('utf-8')
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(body)

        elif path == "/api/refresh":
            data = scorer.evaluate_all(force_refresh=True)
            body = json.dumps({"status": "ok", "winning_pos": data["beach_pos"]}).encode('utf-8')
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(body)

        elif path == "/api/override":
            query = parse_qs(parsed.query)
            if "clear" in query:
                scorer.set_override(None)
                msg = "Override cleared"
            elif "pos" in query:
                p = int(query["pos"][0])
                scorer.set_override(p)
                msg = f"Override set to {p}"
            else:
                msg = "No change"
            body = json.dumps({"status": "ok", "message": msg, "override_pos": scorer.override_pos}).encode('utf-8')
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(body)

        elif path == "/" or path == "/index.html":
            index_file = os.path.join(STATIC_DIR, "index.html")
            if os.path.exists(index_file):
                with open(index_file, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            else:
                self.send_response(404)
                self.end_headers()

        else:
            # Check for static file in STATIC_DIR
            clean_path = path.lstrip("/")
            file_path = os.path.join(STATIC_DIR, clean_path)
            if os.path.exists(file_path) and os.path.isfile(file_path):
                ext = os.path.splitext(file_path)[1].lower()
                content_types = {
                    ".png": "image/png",
                    ".jpg": "image/jpeg",
                    ".jpeg": "image/jpeg",
                    ".svg": "image/svg+xml",
                    ".css": "text/css",
                    ".js": "application/javascript"
                }
                ct = content_types.get(ext, "application/octet-stream")
                with open(file_path, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", ct)
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            else:
                self.send_response(404)
                self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/override":
            content_len = int(self.headers.get("Content-Length", 0))
            post_body = self.rfile.read(content_len).decode('utf-8')
            try:
                data = json.loads(post_body)
                pos = data.get("pos")
                if pos is not None:
                    pos = int(pos)
                    if 1 <= pos <= 12:
                        scorer.set_override(pos)
                        msg = f"Override set to position {pos}"
                    else:
                        self.send_response(400)
                        self.end_headers()
                        self.wfile.write(b'{"error": "pos must be 1-12"}')
                        return
                else:
                    scorer.set_override(None)
                    msg = "Override cleared. Auto-scoring restored."

                resp = json.dumps({"status": "success", "message": msg, "override_pos": scorer.override_pos}).encode('utf-8')
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(resp)))
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(resp)
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def run(port=PORT):
    local_ip = get_local_ip()
    print("=" * 60)
    print("🌊 SurfClock Dual-Gauge Scoring Server Running")
    print(f"  Local Dashboard:  http://localhost:{port}")
    print(f"  Network Endpoint: http://{local_ip}:{port}/api/surf")
    print("=" * 60)
    httpd = HTTPServer(('0.0.0.0', port), SurfClockHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == '__main__':
    run()
