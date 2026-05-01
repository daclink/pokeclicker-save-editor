"""Background update check against the GitHub Releases API.

Designed to be cheap and silent on the happy path:
- Runs in a daemon thread so the GUI never blocks on it.
- Caches the result for 24 h in ``settings_dir() / update_cache.json``.
- Honours a per-user opt-out in ``settings_dir() / settings.json`` under the
  key ``update_check_on_launch``.

The GUI consumes :func:`check_for_update_async`, which calls back on the
Tk main thread with an :class:`UpdateResult`.

This module also owns the persisted settings file (a tiny JSON dict) and
exposes :func:`get_setting` / :func:`set_setting` so other tabs can grow
their own keys without spawning more state stores.
"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from _version import __version__

REPO = "daclink/pokeclicker-save-editor"
LATEST_RELEASE_URL = f"https://api.github.com/repos/{REPO}/releases/latest"
USER_AGENT = f"pcedit/{__version__} (+https://github.com/{REPO})"
HTTP_TIMEOUT_SEC = 4
CACHE_TTL_SEC = 24 * 60 * 60   # 24 h


# --- settings & cache file locations ----------------------------------------

def settings_dir() -> Path:
    """Return the per-user pcedit config directory, creating it on demand."""
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    elif sys.platform.startswith("win"):
        base = Path(os.environ.get("APPDATA", str(Path.home() / "AppData" / "Roaming")))
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config")))
    d = base / "pcedit"
    d.mkdir(parents=True, exist_ok=True)
    return d


SETTINGS_FILE = lambda: settings_dir() / "settings.json"   # noqa: E731
CACHE_FILE    = lambda: settings_dir() / "update_cache.json"  # noqa: E731


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _write_json(path: Path, data: dict) -> None:
    try:
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except OSError:
        pass  # never let the disk break the GUI


def get_setting(key: str, default: Any = None) -> Any:
    return _read_json(SETTINGS_FILE()).get(key, default)


def set_setting(key: str, value: Any) -> None:
    data = _read_json(SETTINGS_FILE())
    data[key] = value
    _write_json(SETTINGS_FILE(), data)


# --- semver comparison -------------------------------------------------------

_SEMVER = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$")


def parse_version(s: str) -> tuple[int, int, int] | None:
    m = _SEMVER.match(s.strip())
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def is_newer(remote: str, local: str) -> bool:
    """Return True if ``remote`` is strictly newer than ``local`` (semver)."""
    r, l = parse_version(remote), parse_version(local)
    if r is None or l is None:
        return False
    return r > l


# --- result dataclass --------------------------------------------------------

@dataclass(frozen=True)
class UpdateResult:
    status: str             # "current" | "available" | "skipped" | "error"
    current: str            # the version we're running
    latest: str | None      # the latest tag from GitHub (None on skip/error)
    html_url: str | None    # link to the release page
    error: str | None       # short error message for the status bar

    @property
    def has_update(self) -> bool:
        return self.status == "available"


# --- HTTP fetch + cache ------------------------------------------------------

def _fetch_latest() -> dict:
    req = urllib.request.Request(
        LATEST_RELEASE_URL,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/vnd.github+json",
        },
    )
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SEC) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _cached_result(now: float) -> UpdateResult | None:
    data = _read_json(CACHE_FILE())
    ts = data.get("checked_at")
    if not isinstance(ts, (int, float)):
        return None
    if now - ts > CACHE_TTL_SEC:
        return None
    if data.get("running_version") != __version__:
        return None  # invalidate cache after a self-upgrade
    status = data.get("status")
    if status not in ("current", "available"):
        return None
    return UpdateResult(
        status=status,
        current=__version__,
        latest=data.get("latest"),
        html_url=data.get("html_url"),
        error=None,
    )


def _store_cache(result: UpdateResult, now: float) -> None:
    if result.status not in ("current", "available"):
        return  # don't cache transient errors
    _write_json(CACHE_FILE(), {
        "checked_at": now,
        "running_version": __version__,
        "status": result.status,
        "latest": result.latest,
        "html_url": result.html_url,
    })


def check_for_update(*, force: bool = False) -> UpdateResult:
    """Synchronous check. Use the async wrapper from the GUI."""
    if not force and not get_setting("update_check_on_launch", True):
        return UpdateResult("skipped", __version__, None, None,
                            "update_check_on_launch=false")
    now = time.time()
    if not force:
        cached = _cached_result(now)
        if cached is not None:
            return cached
    try:
        payload = _fetch_latest()
    except urllib.error.URLError as e:
        return UpdateResult("error", __version__, None, None, f"network: {e.reason}")
    except (TimeoutError, OSError) as e:
        return UpdateResult("error", __version__, None, None, f"network: {e}")
    except (ValueError, json.JSONDecodeError) as e:
        return UpdateResult("error", __version__, None, None, f"parse: {e}")

    latest = (payload.get("tag_name") or "").lstrip("v")
    html_url = payload.get("html_url")
    status = "available" if is_newer(latest, __version__) else "current"
    result = UpdateResult(status, __version__, latest, html_url, None)
    _store_cache(result, now)
    return result


def check_for_update_async(callback: Callable[[UpdateResult], None],
                            *, force: bool = False) -> threading.Thread:
    """Run :func:`check_for_update` in a daemon thread.

    The callback is invoked with the :class:`UpdateResult`. Schedule it on
    the Tk main thread yourself (e.g. ``root.after(0, lambda: callback(r))``);
    the consumer pattern in ``pcedit_gui`` does this.
    """
    def _run() -> None:
        result = check_for_update(force=force)
        try:
            callback(result)
        except Exception:  # noqa: BLE001  — never let a callback kill the thread
            pass

    t = threading.Thread(target=_run, name="pcedit-update-check", daemon=True)
    t.start()
    return t
