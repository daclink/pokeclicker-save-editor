#!/usr/bin/env python3
"""Cut a GitHub release using notes pulled from CHANGELOG.md.

Usage::

    python3 scripts/release.py 0.3.0                    # publish
    python3 scripts/release.py 0.3.0 --dry-run          # preview only
    python3 scripts/release.py 0.3.0 --skip-tag         # tag exists already

The script:
1. Locates the ``[<version>] — YYYY-MM-DD`` section in ``CHANGELOG.md``.
2. Extracts that section's body (up to the next ``## [...]`` heading).
3. Prepends a short header (tag, date, "tested against PokeClicker vX.Y").
4. Appends the previous-tag compare link from the bottom of the changelog.
5. Tags ``v<version>`` on HEAD and pushes the tag (unless ``--skip-tag``).
6. Calls ``gh release create v<version> --notes-file - --title ...``.

The script is intentionally stdlib-only — no PyYAML, no toml, no ``packaging``.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CHANGELOG = REPO_ROOT / "CHANGELOG.md"

# What version of the game these editor releases are validated against.
TESTED_AGAINST = "PokeClicker v0.10.25"


def extract_section(version: str) -> tuple[str, str]:
    """Return (heading_line, body_text) for the section ``## [version]``.

    Body text is everything between this section's heading and the next
    ``## [...]`` heading, stripped of trailing whitespace.
    """
    text = CHANGELOG.read_text(encoding="utf-8")
    # Match "## [0.3.0] — 2026-05-15" or "## [0.3.0] - 2026-05-15"
    pattern = re.compile(rf"^## \[{re.escape(version)}\][^\n]*$", re.MULTILINE)
    m = pattern.search(text)
    if not m:
        raise SystemExit(
            f"error: no [{version}] section found in {CHANGELOG.name}.\n"
            f"add a `## [{version}] — YYYY-MM-DD` section first."
        )
    heading = m.group(0).rstrip()
    rest = text[m.end():]
    # Stop at the next "## [" heading or the link-reference block at the bottom.
    next_section = re.search(r"^## \[", rest, re.MULTILINE)
    if next_section:
        body = rest[: next_section.start()]
    else:
        body = rest
    # Drop the link-reference footer if it leaked in.
    body = re.split(r"^\[Unreleased\]: ", body, maxsplit=1, flags=re.MULTILINE)[0]
    return heading, body.strip()


def previous_tag(text: str, version: str) -> str | None:
    """Look up the previous tag from the link-reference footer."""
    m = re.search(rf"^\[{re.escape(version)}\]: .*compare/(v[^.]+\.[^.]+\.[^.]+)\.\.\.",
                  text, re.MULTILINE)
    return m.group(1) if m else None


def build_notes(version: str) -> tuple[str, str]:
    """Return (title, notes_body) for ``gh release create``."""
    heading, body = extract_section(version)
    text = CHANGELOG.read_text(encoding="utf-8")
    prev = previous_tag(text, version)

    # Pull the date from the heading: "## [0.3.0] — 2026-05-15"
    m = re.search(r"\d{4}-\d{2}-\d{2}", heading)
    date = m.group(0) if m else ""

    title = f"v{version}"

    notes_lines = [
        f"**Tag:** v{version}  ",
        f"**Date:** {date}  ",
        f"**Tested against:** {TESTED_AGAINST}",
        "",
        body,
    ]
    if prev:
        notes_lines += [
            "",
            f"**Full diff:** https://github.com/daclink/pokeclicker-save-editor/"
            f"compare/{prev}...v{version}",
        ]
    return title, "\n".join(notes_lines)


def run(cmd: list[str], *, capture: bool = False, input_text: str | None = None) -> str:
    print(f"$ {' '.join(cmd)}")
    res = subprocess.run(cmd, check=True, capture_output=capture, text=True,
                         input=input_text)
    return res.stdout if capture else ""


def check_version_constant(version: str) -> None:
    """Ensure ``_version.py`` matches the version being released.

    The CHANGELOG promotion commit must also bump ``__version__`` in
    ``_version.py`` — that's how the running editor knows what version it
    is for the in-app update check. Catching a mismatch here prevents
    shipping a release whose binary self-reports the wrong version.
    """
    sys.path.insert(0, str(REPO_ROOT))
    try:
        import _version  # type: ignore
        import importlib
        importlib.reload(_version)
        on_disk = _version.__version__
    except Exception as e:  # noqa: BLE001
        raise SystemExit(f"error: couldn't read _version.py: {e}")
    if on_disk != version:
        raise SystemExit(
            f"error: _version.py says {on_disk!r} but you're releasing {version!r}.\n"
            f"bump the constant in _version.py (alongside CHANGELOG.md) and try again."
        )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("version", help="version without the leading 'v', e.g. 0.3.0")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the release notes and stop without tagging or publishing")
    ap.add_argument("--skip-tag", action="store_true",
                    help="don't tag/push; assume the tag already exists on origin")
    ap.add_argument("--prerelease", action="store_true",
                    help="mark the GitHub release as a pre-release")
    args = ap.parse_args(argv)

    if not args.dry_run:
        check_version_constant(args.version)
    title, notes = build_notes(args.version)

    if args.dry_run:
        print("=" * 60)
        print(f"title: {title}")
        print("=" * 60)
        print(notes)
        print("=" * 60)
        print("(dry-run — no tag, no push, no release)")
        return 0

    tag = f"v{args.version}"
    if not args.skip_tag:
        run(["git", "tag", "-a", tag, "-m", title])
        run(["git", "push", "origin", tag])

    cmd = ["gh", "release", "create", tag,
           "--title", title,
           "--notes-file", "-"]
    if args.prerelease:
        cmd.append("--prerelease")
    run(cmd, input_text=notes)
    print(f"\nOK released {tag}")
    return 0


try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

if __name__ == "__main__":
    sys.exit(main())
