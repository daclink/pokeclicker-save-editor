"""Deprecation notice for the desktop app (pcedit_gui.py).

The web app is the editor going forward; the desktop app gets no new
features. Kept Tk-free so the text and URL are unit-testable in CI.
"""
from __future__ import annotations

WEB_APP_URL = "https://daclink.github.io/pokeclicker-save-editor/"

DEPRECATION_BANNER_TEXT = (
    "The desktop app is deprecated and gets no new features. "
    "The web app has every tab here plus Gems, Flutes, Inventory, "
    "Underground and Quests, and runs entirely in your browser."
)
DEPRECATION_BUTTON_TEXT = "Open web app"

# Banner colours (Bootstrap "info" palette — distinct from the yellow
# update banner so both can show at once).
DEPRECATION_BANNER_BG = "#cff4fc"
DEPRECATION_BANNER_BORDER = "#9eeaf9"
DEPRECATION_BANNER_FG = "#055160"
