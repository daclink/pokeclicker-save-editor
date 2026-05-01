#!/usr/bin/env python3
"""Build a single-file Linux executable for PCEdit.

Usage::

    python3 scripts/build_linux.py

Output::

    dist/PCEdit-linux-x86_64        bare ELF executable
    dist/PCEdit-linux-x86_64.tar.gz tarball with the executable, the icon,
                                    a .desktop file, and a short README

Requires PyInstaller. Tk runtime must be available at build time
(``python3-tk`` on Debian/Ubuntu, ``python3-tkinter`` on Fedora). The
resulting ELF runs on most glibc-based distros.

AppImage packaging is tracked separately and is a future enhancement.
"""
from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DIST = REPO_ROOT / "dist"
BUILD = REPO_ROOT / "build"
APP_NAME = "PCEdit"
ENTRY = REPO_ROOT / "pcedit_gui.py"
ICON_256 = REPO_ROOT / "assets" / "icon" / "PCEdit-256.png"

DESKTOP_FILE = """[Desktop Entry]
Type=Application
Name=PCEdit
Comment=PokeClicker save editor
Exec=PCEdit-linux-x86_64
Icon=PCEdit
Terminal=false
Categories=Utility;
"""

README_LINUX = """\
PCEdit — PokeClicker save editor
================================

Linux x86_64 build.

Run:
    chmod +x PCEdit-linux-x86_64
    ./PCEdit-linux-x86_64 [optional/path/to/save.txt]

Optional desktop integration:
    install -Dm755 PCEdit-linux-x86_64  ~/.local/bin/PCEdit-linux-x86_64
    install -Dm644 PCEdit-256.png       ~/.local/share/icons/hicolor/256x256/apps/PCEdit.png
    install -Dm644 PCEdit.desktop       ~/.local/share/applications/PCEdit.desktop

Source:
    https://github.com/daclink/pokeclicker-save-editor
"""


def run(cmd: list[str]) -> None:
    print(f"$ {' '.join(cmd)}")
    subprocess.run(cmd, check=True, cwd=REPO_ROOT)


def ensure_pyinstaller() -> None:
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        run([sys.executable, "-m", "pip", "install", "--upgrade", "pyinstaller"])


def main() -> int:
    if platform.system() != "Linux":
        raise SystemExit("error: this script must run on Linux")

    for d in (DIST, BUILD):
        if d.exists():
            shutil.rmtree(d)

    ensure_pyinstaller()

    arch = "x86_64" if platform.machine() in ("x86_64", "AMD64") else platform.machine()
    bin_name = f"PCEdit-linux-{arch}"

    args = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "--onefile",
        "--windowed",
        "--name", bin_name,
        str(ENTRY),
    ]
    run(args)

    bin_path = DIST / bin_name
    if not bin_path.exists():
        raise SystemExit(f"error: {bin_path} was not produced")

    # Pack into a tarball with icon, desktop entry, and a short README so the
    # user has everything for desktop integration without chasing the repo.
    tar_path = DIST / f"{bin_name}.tar.gz"
    if tar_path.exists():
        tar_path.unlink()

    desktop_path = DIST / "PCEdit.desktop"
    desktop_path.write_text(DESKTOP_FILE, encoding="utf-8")
    readme_path = DIST / "README.txt"
    readme_path.write_text(README_LINUX, encoding="utf-8")
    icon_dst = DIST / ICON_256.name
    if ICON_256.exists():
        shutil.copy2(ICON_256, icon_dst)

    with tarfile.open(tar_path, "w:gz") as tf:
        tf.add(bin_path, arcname=bin_name)
        if icon_dst.exists():
            tf.add(icon_dst, arcname=ICON_256.name)
        tf.add(desktop_path, arcname="PCEdit.desktop")
        tf.add(readme_path, arcname="README.txt")

    size_mb = tar_path.stat().st_size / (1024 * 1024)
    print(f"\nOK built {bin_path.relative_to(REPO_ROOT)}")
    print(f"OK built {tar_path.relative_to(REPO_ROOT)}  ({size_mb:.1f} MB)")
    return 0


try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

if __name__ == "__main__":
    sys.exit(main())
