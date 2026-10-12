"""The desktop app's deprecation notice points users at the web app.
Pure constants — no Tk import, so this runs in CI's Tk-less job."""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from pcedit_notice import (  # noqa: E402
    DEPRECATION_BANNER_TEXT,
    DEPRECATION_BUTTON_TEXT,
    WEB_APP_URL,
)


class DeprecationNoticeTest(unittest.TestCase):
    def test_url_is_the_https_pages_site(self) -> None:
        self.assertRegex(WEB_APP_URL, r"^https://daclink\.github\.io/pokeclicker-save-editor/$")

    def test_readme_links_the_same_url(self) -> None:
        readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn(WEB_APP_URL, readme)

    def test_vite_base_path_matches_the_url(self) -> None:
        vite = (REPO_ROOT / "web" / "vite.config.ts").read_text(encoding="utf-8")
        base = re.search(r"base:[^\n]*?'([^']+)'", vite)
        self.assertIsNotNone(base, "vite.config.ts has no base path")
        self.assertTrue(WEB_APP_URL.endswith(base.group(1)))

    def test_banner_says_deprecated_and_names_the_web_app(self) -> None:
        self.assertIn("deprecated", DEPRECATION_BANNER_TEXT.lower())
        self.assertIn("web app", DEPRECATION_BANNER_TEXT.lower())
        self.assertIn("web app", DEPRECATION_BUTTON_TEXT.lower())

    def test_readme_marks_desktop_as_deprecated(self) -> None:
        readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8").lower()
        self.assertIn("deprecated", readme)
        self.assertNotIn("browser version** is in early development", readme)


if __name__ == "__main__":
    unittest.main()
