"""KTC - KeyNova Tally Connector (POC).

Runs ON the Tally VM. It bridges the browser (KTI frontend) to TallyPrime:

    browser  --POST XML-->  KTC (localhost:9988)  --forward-->  Tally (localhost:9000)

Why it exists: TallyPrime's HTTP gateway on port 9000 is only reachable from
inside the VM and is not CORS-aware, so the browser cannot call it directly.
KTC listens locally, checks a shared token, adds CORS headers, and relays the
XML in both directions. Because Tally is reached over localhost from inside the
VM, port 9000 never needs to be exposed to the public internet.

No third-party dependencies - pure standard library, so it runs on the VM with
just a stock Python install.

Run:  python connector.py

Endpoints:
    GET  /health         -> liveness check (used by the frontend "Test Connection")
    POST /post-to-tally  -> validate token, forward XML body to Tally, return reply
    OPTIONS *            -> CORS preflight

Config via environment variables (all optional):
    KTC_LISTEN_HOST   default 127.0.0.1
    KTC_LISTEN_PORT   default 9988
    KTC_TALLY_URL     default http://localhost:9000
    KTC_TOKEN         default poc-token-123
    KTC_TALLY_TIMEOUT default 60 (seconds)
"""

import http.server
import json
import os
import urllib.error
import urllib.request
from datetime import datetime

# --- Config (override via environment variables if needed) ------------------
LISTEN_HOST = os.environ.get("KTC_LISTEN_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("KTC_LISTEN_PORT", "9988"))
TALLY_URL = os.environ.get("KTC_TALLY_URL", "http://localhost:9000")
KTI_TOKEN = os.environ.get("KTC_TOKEN", "poc-token-123")
TALLY_TIMEOUT = int(os.environ.get("KTC_TALLY_TIMEOUT", "60"))


def log(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


class KTCHandler(http.server.BaseHTTPRequestHandler):
    # Silence the default per-request stderr logging; we log ourselves below.
    def log_message(self, fmt, *args):
        pass

    # -- response helpers ----------------------------------------------------
    def _set_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-KTI-Token")

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._set_cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_xml(self, status: int, xml_bytes: bytes):
        self.send_response(status)
        self.send_header("Content-Type", "text/xml")
        self._set_cors()
        self.send_header("Content-Length", str(len(xml_bytes)))
        self.end_headers()
        self.wfile.write(xml_bytes)

    # -- handlers ------------------------------------------------------------
    def do_OPTIONS(self):
        # CORS preflight: the browser sends this before the real cross-origin POST.
        self.send_response(204)
        self._set_cors()
        self.send_header("Content-Length", "0")
        self.end_headers()
        log(f"OPTIONS {self.path} -> 204 (preflight)")

    def do_GET(self):
        if self.path.rstrip("/") in ("/health", ""):
            self._send_json(200, {"status": "ok", "service": "KTC", "tally_url": TALLY_URL})
            log(f"GET {self.path} -> 200 (health)")
        else:
            self._send_json(404, {"error": "Not found"})
            log(f"GET {self.path} -> 404")

    def do_POST(self):
        if self.path.rstrip("/") != "/post-to-tally":
            self._send_json(404, {"error": "Not found"})
            log(f"POST {self.path} -> 404")
            return

        # 1) Shared-token check.
        token = self.headers.get("X-KTI-Token", "")
        if token != KTI_TOKEN:
            self._send_json(401, {"error": "Invalid or missing X-KTI-Token"})
            log(f"POST {self.path} -> 401 (bad token: {token!r})")
            return

        # 2) Read the XML body sent by the browser.
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else b""
        log(f"POST {self.path} -> forwarding {len(body)} bytes to {TALLY_URL}")

        # 3) Forward it to Tally and relay the reply back to the browser.
        req = urllib.request.Request(
            TALLY_URL,
            data=body,
            headers={"Content-Type": "text/xml; charset=utf-8"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=TALLY_TIMEOUT) as resp:
                tally_response = resp.read()
            self._send_xml(200, tally_response)
            log(f"  Tally responded {len(tally_response)} bytes -> 200")
        except ConnectionRefusedError:
            self._send_json(502, {"error": f"Tally is not running on {TALLY_URL}"})
            log("  ConnectionRefused -> 502 (is TallyPrime open with the gateway enabled?)")
        except urllib.error.URLError as e:
            reason = getattr(e, "reason", e)
            if isinstance(reason, ConnectionRefusedError):
                self._send_json(502, {"error": f"Tally is not running on {TALLY_URL}"})
                log("  ConnectionRefused (URLError) -> 502")
            else:
                self._send_json(502, {"error": f"Could not reach Tally at {TALLY_URL}: {reason}"})
                log(f"  URLError -> 502 ({reason})")
        except Exception as e:  # noqa: BLE001 - report anything else as a 500
            self._send_json(500, {"error": f"Connector error: {e}"})
            log(f"  Exception -> 500 ({e})")


def main():
    server = http.server.ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), KTCHandler)
    log(f"KTC connector listening on http://{LISTEN_HOST}:{LISTEN_PORT}")
    log(f"  Forwarding POST /post-to-tally  ->  {TALLY_URL}")
    log(f"  Expecting header  X-KTI-Token: {KTI_TOKEN}")
    log("  Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("Shutting down.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
