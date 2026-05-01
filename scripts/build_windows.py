#!/usr/bin/env python3
"""Build a Windows .exe for PCEdit.

Usage::

    python scripts/build_windows.py

Output::

    dist/PCEdit-windows.exe   single-file PyInstaller bundle (~12-20 MB)

Requires PyInstaller. Installs it via pip if missing. Run on Windows or in
a Windows GitHub Actions runner — building Windows .exe files from macOS
or Linux requires Wine and is out of scope.
"""
from __future__ import annotations

import platform
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DIST = REPO_ROOT / "dist"
BUILD = REPO_ROOT / "build"
APP_NAME = "PCEdit"
ENTRY = REPO_ROOT / "pcedit_gui.py"
ICON = REPO_ROOT / "assets" / "icon" / "PCEdit.ico"


def run(cmd: list[str]) -> None:
    print(f"$ {' '.join(cmd)}")
    subprocess.run(cmd, check=True, cwd=REPO_ROOT)


def ensure_pyinstaller() -> None:
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        run([sys.executable, "-m", "pip", "install", "--upgrade", "pyinstaller"])


def main() -> int:
    if platform.system() != "Windows":
        raise SystemExit("error: this script must run on Windows")

    for d in (DIST, BUILD):
        if d.exists():
            shutil.rmtree(d)

    ensure_pyinstaller()

    args = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "--onefile",       # single .exe (slower startup but easy to ship)
        "--windowed",      # no console window
        "--name", APP_NAME,
        str(ENTRY),
    ]
    if ICON.exists():
        args += ["--icon", str(ICON)]
    run(args)

    src = DIST / f"{APP_NAME}.exe"
    if not src.exists():
        raise SystemExit(f"error: {src} was not produced")
    final = DIST / "PCEdit-windows.exe"
    if final.exists():
        final.unlink()
    src.rename(final)

    size_mb = final.stat().st_size / (1024 * 1024)
    print(f"\nOK built {final.relative_to(REPO_ROOT)}  ({size_mb:.1f} MB)")
    return 0


try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

if __name__ == "__main__":
    sys.exit(main())
