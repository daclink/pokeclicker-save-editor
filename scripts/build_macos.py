#!/usr/bin/env python3
"""Build a macOS .app and .dmg for PCEdit.

Usage::

    python3 scripts/build_macos.py

Outputs::

    dist/PCEdit.app    bundled application (universal2 if running on macOS 11+)
    dist/PCEdit.dmg    drag-to-Applications installer

Requires PyInstaller. The script runs ``pip install pyinstaller`` in the
caller's environment if it isn't already available, so the GitHub Actions
runner doesn't need a pre-step.
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
BUNDLE_ID = "com.daclink.pcedit"
ENTRY = REPO_ROOT / "pcedit_gui.py"


def run(cmd: list[str], **kw) -> None:
    print(f"$ {' '.join(cmd)}")
    subprocess.run(cmd, check=True, cwd=REPO_ROOT, **kw)


def ensure_pyinstaller() -> None:
    try:
        import PyInstaller  # noqa: F401
        return
    except ImportError:
        pass
    run([sys.executable, "-m", "pip", "install", "--upgrade", "pyinstaller"])


def build_app() -> Path:
    if platform.system() != "Darwin":
        raise SystemExit("error: this script must run on macOS")

    # Clean previous outputs to keep CI runs hermetic.
    for d in (DIST, BUILD):
        if d.exists():
            shutil.rmtree(d)

    ensure_pyinstaller()

    pyinstaller_args = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "--windowed",                      # no terminal window
        "--name", APP_NAME,
        "--osx-bundle-identifier", BUNDLE_ID,
    ]
    # Universal2 needs Python 3.8+ from python.org or Homebrew built that way.
    # If our runner can't produce universal2 we fall back to the native arch.
    if "PCEDIT_NO_UNIVERSAL2" not in __import__("os").environ:
        pyinstaller_args += ["--target-arch", "universal2"]
    pyinstaller_args.append(str(ENTRY))

    try:
        run(pyinstaller_args)
    except subprocess.CalledProcessError as e:
        if "--target-arch" in pyinstaller_args:
            print("\nuniversal2 build failed, retrying with native arch only...\n")
            pyinstaller_args = [a for a in pyinstaller_args
                                if a not in ("--target-arch", "universal2")]
            run(pyinstaller_args)
        else:
            raise

    app_path = DIST / f"{APP_NAME}.app"
    if not app_path.exists():
        raise SystemExit(f"error: {app_path} was not produced")
    return app_path


def build_dmg(app_path: Path) -> Path:
    dmg_path = DIST / f"{APP_NAME}.dmg"
    if dmg_path.exists():
        dmg_path.unlink()

    staging = DIST / "dmg-staging"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir()

    # Copy the .app and add a /Applications shortcut so drag-to-install works.
    run(["cp", "-R", str(app_path), str(staging)])
    (staging / "Applications").symlink_to("/Applications")

    run([
        "hdiutil", "create",
        "-volname", APP_NAME,
        "-srcfolder", str(staging),
        "-ov", "-format", "UDZO", "-fs", "HFS+",
        str(dmg_path),
    ])

    shutil.rmtree(staging)

    if not dmg_path.exists():
        raise SystemExit(f"error: {dmg_path} was not produced")
    return dmg_path


def main() -> int:
    app = build_app()
    dmg = build_dmg(app)
    size_mb = dmg.stat().st_size / (1024 * 1024)
    print(f"\n✓ built {app.relative_to(REPO_ROOT)}")
    print(f"✓ built {dmg.relative_to(REPO_ROOT)}  ({size_mb:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
