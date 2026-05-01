#!/usr/bin/env python3
"""Regenerate the bundled app-icon set from assets/icon/pokeball.svg.

The committed icon assets (``PCEdit.icns``, ``PCEdit.ico``, ``PCEdit-256.png``,
``PCEdit-512.png``) are produced from the source SVG once on a developer
machine and committed to the repo so CI doesn't need ImageMagick. Run this
script after editing ``pokeball.svg`` to regenerate them.

Requires:
- ``magick`` (ImageMagick) — SVG rasterisation and multi-resolution .ico
- ``iconutil`` (macOS, built-in) — .iconset → .icns (macOS-only step)

On non-macOS the .icns step is skipped and a warning is printed; commit the
.icns from a Mac.
"""
from __future__ import annotations

import platform
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = REPO_ROOT / "assets" / "icon"
SVG = ICON_DIR / "pokeball.svg"

ICNS_SIZES = [16, 32, 128, 256, 512, 1024]
ICO_SIZES = [16, 32, 48, 64, 128, 256]


def run(cmd: list[str]) -> None:
    print(f"$ {' '.join(cmd)}")
    subprocess.run(cmd, check=True)


def need(tool: str) -> None:
    if shutil.which(tool) is None:
        raise SystemExit(f"error: required tool not found: {tool}")


def png(size: int, out: Path) -> None:
    run([
        "magick", "-background", "none", str(SVG),
        "-resize", f"{size}x{size}",
        str(out),
    ])


def make_icns() -> None:
    if platform.system() != "Darwin":
        print("skip: .icns build requires macOS iconutil — leave the existing one")
        return
    need("iconutil")
    iconset = ICON_DIR / "PCEdit.iconset"
    if iconset.exists():
        shutil.rmtree(iconset)
    iconset.mkdir()
    # Apple's expected slots: each "size" plus its @2x retina counterpart.
    for sz in ICNS_SIZES:
        png(sz, iconset / f"icon_{sz}x{sz}.png")
    # @2x copies (Apple wants e.g. icon_16x16@2x.png == 32×32 contents)
    pairs = [(16, 32), (32, 64), (128, 256), (256, 512), (512, 1024)]
    for base, retina in pairs:
        # the retina source is the larger PNG we already rendered, except for
        # 64 which isn't an iconset slot — render it once on demand.
        src = iconset / f"icon_{retina}x{retina}.png"
        if not src.exists():
            png(retina, src)
        shutil.copy2(src, iconset / f"icon_{base}x{base}@2x.png")
    # 64×64 isn't a real iconset slot; drop it if it leaked in.
    (iconset / "icon_64x64.png").unlink(missing_ok=True)
    out = ICON_DIR / "PCEdit.icns"
    run(["iconutil", "-c", "icns", str(iconset), "-o", str(out)])
    shutil.rmtree(iconset)
    print(f"✓ {out.relative_to(REPO_ROOT)}")


def make_ico() -> None:
    out = ICON_DIR / "PCEdit.ico"
    sizes = ",".join(str(s) for s in ICO_SIZES)
    run([
        "magick", "-background", "none", str(SVG),
        "-define", f"icon:auto-resize={sizes}",
        str(out),
    ])
    print(f"✓ {out.relative_to(REPO_ROOT)}")


def make_pngs() -> None:
    for sz in (256, 512):
        out = ICON_DIR / f"PCEdit-{sz}.png"
        png(sz, out)
        print(f"✓ {out.relative_to(REPO_ROOT)}")


def main() -> int:
    if not SVG.exists():
        raise SystemExit(f"error: source SVG missing: {SVG}")
    need("magick")
    make_pngs()
    make_ico()
    make_icns()
    return 0


if __name__ == "__main__":
    sys.exit(main())
