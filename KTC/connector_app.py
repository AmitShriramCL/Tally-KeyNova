"""KTC Connector — System Tray Application

Wraps connector.py as a Windows system tray app.

What this does:
  - Starts the connector HTTP server in a background thread on launch
  - Shows a green/red icon in the system tray (near the clock)
  - Auto-registers itself in Windows startup so it runs on every boot
  - Right-click menu: status info, logs, restart, startup toggle, exit

No extra config needed — hotel staff just installs and forgets it.

Build to .exe:
    pip install pystray Pillow pyinstaller
    pyinstaller --onefile --windowed --name KTC-Connector connector_app.py
"""

import sys
import os
import threading
import time
import http.server
import webbrowser
from datetime import datetime

import pystray
from PIL import Image, ImageDraw

# ── Logging ───────────────────────────────────────────────────────────────────
_LOG_DIR  = os.path.join(os.environ.get("APPDATA", "."), "KTCConnector")
os.makedirs(_LOG_DIR, exist_ok=True)
_LOG_FILE = os.path.join(_LOG_DIR, "ktc.log")

def _app_log(msg: str):
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        with open(_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


# ── Patch connector's log before anything in the module runs ─────────────────
import connector                    # noqa: E402  (must come after _app_log is defined)
connector.log = _app_log            # all log() calls inside KTCHandler now write to file

from connector import KTCHandler, LISTEN_HOST, LISTEN_PORT, TALLY_URL  # noqa: E402


# ── Windows startup registry ──────────────────────────────────────────────────
_REG_RUN_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
_REG_APP_NAME = "KTCConnector"

def _is_startup_enabled() -> bool:
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, _REG_RUN_PATH)
        winreg.QueryValueEx(key, _REG_APP_NAME)
        winreg.CloseKey(key)
        return True
    except Exception:
        return False

def _set_startup(enable: bool):
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, _REG_RUN_PATH, 0, winreg.KEY_SET_VALUE)
        if enable:
            winreg.SetValueEx(key, _REG_APP_NAME, 0, winreg.REG_SZ, sys.executable)
            _app_log("Added to Windows startup")
        else:
            winreg.DeleteValue(key, _REG_APP_NAME)
            _app_log("Removed from Windows startup")
        winreg.CloseKey(key)
    except Exception as e:
        _app_log(f"Could not modify startup registry: {e}")


# ── Tray icon images (generated with Pillow, no external image files needed) ──
def _make_icon(rgb: tuple) -> Image.Image:
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)
    d.ellipse([4, 4, 60, 60], fill=rgb + (255,), outline=(255, 255, 255, 180), width=3)
    return img

_ICON_GREEN  = _make_icon((34,  197,  94))   # running
_ICON_RED    = _make_icon((239,  68,  68))   # stopped / error
_ICON_YELLOW = _make_icon((234, 179,   8))   # starting / restarting


# ── HTTP server lifecycle ─────────────────────────────────────────────────────
_server        = None          # type: http.server.ThreadingHTTPServer | None
_server_thread = None          # type: threading.Thread | None
_server_error  = ""            # last startup error message
_server_lock   = threading.Lock()

def _start_server():
    global _server, _server_thread, _server_error
    with _server_lock:
        if _server is not None:
            return
        _server_error = ""
        try:
            _server = http.server.ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), KTCHandler)
            _server_thread = threading.Thread(target=_server.serve_forever, daemon=True)
            _server_thread.start()
            _app_log(f"Server started  http://{LISTEN_HOST}:{LISTEN_PORT}  →  {TALLY_URL}")
        except OSError as e:
            _server_error = str(e)
            _server = None
            _app_log(f"ERROR starting server: {e}")

def _stop_server():
    global _server, _server_thread
    with _server_lock:
        if _server is None:
            return
        _server.shutdown()
        _server.server_close()
        _server = None
        _server_thread = None
        _app_log("Server stopped")

def _is_running() -> bool:
    return (
        _server is not None
        and _server_thread is not None
        and _server_thread.is_alive()
    )


# ── Status poller — updates icon & tooltip every 3 s ─────────────────────────
def _status_poller(icon: pystray.Icon):
    while getattr(icon, "_alive", True):
        if _is_running():
            icon.icon  = _ICON_GREEN
            icon.title = f"KTC Connector — Running on port {LISTEN_PORT}"
        elif _server_error:
            icon.icon  = _ICON_RED
            icon.title = f"KTC Connector — Error: {_server_error}"
        else:
            icon.icon  = _ICON_RED
            icon.title = "KTC Connector — Stopped"
        time.sleep(3)


# ── Menu actions ──────────────────────────────────────────────────────────────
def _on_open_status(icon, item):
    webbrowser.open(f"http://localhost:{LISTEN_PORT}/health")

def _on_view_logs(icon, item):
    if os.path.exists(_LOG_FILE):
        os.startfile(_LOG_FILE)
    else:
        _app_log("Log file not yet created")

def _on_toggle_startup(icon, item):
    _set_startup(not _is_startup_enabled())

def _on_restart(icon, item):
    icon.icon  = _ICON_YELLOW
    icon.title = "KTC Connector — Restarting…"
    _stop_server()
    time.sleep(0.5)
    _start_server()

def _on_exit(icon, item):
    icon._alive = False
    _stop_server()
    _app_log("Exiting")
    icon.stop()


# ── Entry point ───────────────────────────────────────────────────────────────
def main():
    # When running as a packaged .exe, auto-enable Windows startup on first run.
    if getattr(sys, "frozen", False) and not _is_startup_enabled():
        _set_startup(True)

    _app_log("=" * 50)
    _app_log("KTC Connector starting")

    _start_server()

    icon        = pystray.Icon("KTCConnector")
    icon.icon   = _ICON_GREEN if _is_running() else _ICON_RED
    icon.title  = f"KTC Connector — Port {LISTEN_PORT}"
    icon._alive = True

    icon.menu = pystray.Menu(
        pystray.MenuItem("KTC Connector", None, enabled=False),
        pystray.MenuItem(
            f"Port {LISTEN_PORT}  →  Tally {TALLY_URL}",
            None, enabled=False,
        ),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Open Status Page", _on_open_status),
        pystray.MenuItem("View Logs",        _on_view_logs),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem(
            "Start at Windows Login",
            _on_toggle_startup,
            checked=lambda item: _is_startup_enabled(),
        ),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Restart Connector", _on_restart),
        pystray.MenuItem("Exit",              _on_exit),
    )

    threading.Thread(target=_status_poller, args=(icon,), daemon=True).start()

    icon.run()   # blocks until _on_exit calls icon.stop()


if __name__ == "__main__":
    main()
