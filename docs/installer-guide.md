# Building and distributing installers with PyInstaller

This is the practitioner's guide for the build pipeline shipping PCEdit's
`.dmg` / `.exe` / `.tar.gz` artefacts. Every recipe here is the one the
repo actually uses (see `scripts/build_*.py` and
`.github/workflows/release.yml`); each "gotcha" callout is paid for in
real-world bruises.

If you only need to *cut a release*, use `python3 scripts/release.py
X.Y.Z` and let CI do the rest. This document is for when you need to
understand or change how that pipeline works.

## Table of contents

1. [Why PyInstaller](#why-pyinstaller)
2. [What it produces](#what-it-produces)
3. [Per-platform recipes](#per-platform-recipes)
4. [Icons](#icons)
5. [Code signing](#code-signing)
6. [Common gotchas](#common-gotchas)
7. [CI: matrix build on tag push](#ci-matrix-build-on-tag-push)
8. [Smoke testing the bundle](#smoke-testing-the-bundle)
9. [Troubleshooting](#troubleshooting)
10. [Future enhancements](#future-enhancements)

## Why PyInstaller

We picked PyInstaller because:

- It's the most-used Python freezer, so when something goes wrong there's
  a StackOverflow answer with our exact symptom.
- It bundles the Python interpreter, our source, **and the Tcl/Tk
  runtime** into a single self-contained artefact. End users don't need
  Python installed.
- It works on macOS, Windows, and Linux from one codebase. Per-platform
  flags differ but the script structure stays parallel.
- Apple notarisation works against the produced `.app` once you have a
  Developer ID; we don't have one yet, but the path is well-trodden.

What we considered and rejected for the first cut:

| tool | why not (yet) |
|---|---|
| `py2app` | Mac-only; less actively maintained than PyInstaller for new Tcl/Tk versions. |
| `briefcase` | Newer, more opinionated, multi-platform — promising but rougher for stdlib Tk. Worth revisiting. |
| `Nuitka` | Compiles Python to C — smaller binaries, faster startup, but a few stdlib edge cases and longer build times. |
| `cx_Freeze` | Older alternative; PyInstaller has eclipsed it in mindshare. |
| `PyOxidizer` | Rust-based; niche, more setup. |

## What it produces

| platform | builder script | artefact | size | install UX |
|---|---|---|---|---|
| **macOS** | `scripts/build_macos.py` | `dist/PCEdit-macos.dmg` | ~22 MB | Double-click → drag *PCEdit* to Applications. |
| **Windows** | `scripts/build_windows.py` | `dist/PCEdit-windows.exe` | ~12 MB | Save anywhere → double-click. |
| **Linux** | `scripts/build_linux.py` | `dist/PCEdit-linux-x86_64.tar.gz` | ~26 MB | `tar xzf` → `chmod +x` → run; `.desktop` file included for desktop integration. |

All three artefacts are pure single-file distributions: one file the user
downloads, no installer wizard, no admin rights required.

## Per-platform recipes

> **Common rule:** every builder must run on its target OS. Cross-compiling
> Windows `.exe`s from macOS or Linux requires Wine and is out of scope.
> CI uses a matrix of `macos-latest`, `windows-latest`, and `ubuntu-latest`
> runners; each job runs the matching builder.

### macOS

The macOS pipeline produces a `.app` bundle and packages it into a `.dmg`
with a drag-to-`/Applications` shortcut.

```sh
python3 -m PyInstaller \
    --noconfirm \
    --windowed \
    --name PCEdit \
    --osx-bundle-identifier com.daclink.pcedit \
    --target-arch universal2 \
    --icon assets/icon/PCEdit.icns \
    pcedit_gui.py
```

What each flag earns:

- `--windowed` — no terminal window when the user double-clicks. Without
  it, opening the `.app` flashes a Terminal.
- `--name PCEdit` — drives the `.app` filename and the Mach-O binary
  inside.
- `--osx-bundle-identifier` — needs to be a stable reverse-DNS string
  (`com.daclink.pcedit`). macOS uses it to dedupe and remember per-app
  state.
- `--target-arch universal2` — produces a single binary that runs on
  Apple Silicon and Intel. Falls back to native arch if the building
  Python isn't universal2-capable; see the gotchas section.
- `--icon …PCEdit.icns` — embeds the icon shown in Dock, Finder, and the
  app switcher.

Then wrap the `.app` into a DMG:

```sh
mkdir -p dist/dmg-staging
cp -R dist/PCEdit.app dist/dmg-staging/
ln -s /Applications dist/dmg-staging/Applications
touch dist/dmg-staging/.metadata_never_index    # tell Spotlight to skip
hdiutil create \
    -volname PCEdit \
    -srcfolder dist/dmg-staging \
    -ov -format UDZO -fs HFS+ \
    dist/PCEdit-macos.dmg
```

The `Applications` symlink is the convention that gives the user a
drag-target inside the mounted DMG. The `.metadata_never_index` marker
is the key to avoiding the *Resource busy* failure described under
[macOS hdiutil race](#macos-hdiutil-race-condition) below.

### Windows

The Windows pipeline produces a single `.exe` — no installer wrapper, no
MSI. Most users save it somewhere and double-click; the
*Add/Remove Programs* shortcut story is a follow-up if anyone asks.

```sh
python -m PyInstaller \
    --noconfirm \
    --onefile \
    --windowed \
    --name PCEdit \
    --icon assets\icon\PCEdit.ico \
    pcedit_gui.py
ren dist\PCEdit.exe PCEdit-windows.exe
```

- `--onefile` — single `.exe` that unpacks to a temp dir on launch
  (~1–2 s slower startup, but one downloadable file). Switch to
  `--onedir` later if startup feels sluggish; that ships a folder of
  files and is faster but uglier.
- `--windowed` — same purpose as on macOS: no console window.
- The `.ico` must be a multi-resolution Windows icon (16/32/48/64/128/256
  inside one file); see [Icons](#icons).

### Linux

The Linux pipeline produces an ELF binary plus a `.tar.gz` containing the
binary, a 256 px PNG icon, and a `.desktop` file the user can drop into
`~/.local/share/applications/` for desktop integration.

```sh
python3 -m PyInstaller \
    --noconfirm \
    --onefile \
    --windowed \
    --name PCEdit-linux-x86_64 \
    pcedit_gui.py

# bundle for distribution
tar czf dist/PCEdit-linux-x86_64.tar.gz \
    -C dist PCEdit-linux-x86_64 PCEdit-256.png PCEdit.desktop README.txt
```

Where `PCEdit.desktop` is:

```ini
[Desktop Entry]
Type=Application
Name=PCEdit
Comment=PokeClicker save editor
Exec=PCEdit-linux-x86_64
Icon=PCEdit
Terminal=false
Categories=Utility;
```

PyInstaller doesn't embed Linux icons into the binary itself (Linux
desktop icons are owned by the `.desktop` file), so we ship the PNG
alongside.

## Icons

PyInstaller's `--icon` takes a single file per platform:

| platform | format | tool |
|---|---|---|
| macOS | `.icns` | `iconutil` (built-in) |
| Windows | `.ico` (multi-resolution) | ImageMagick `magick` |
| Linux | (none — `.desktop` references a PNG) | ImageMagick `magick` |

We keep one source SVG (`assets/icon/pokeball.svg`) and pre-render the
three platform formats once on a developer machine. `scripts/make_icons.py`
regenerates them so CI doesn't need ImageMagick installed:

```sh
# requires `magick` (brew install imagemagick) and `iconutil` (macOS)
python3 scripts/make_icons.py
git add assets/icon
```

### macOS .icns

`iconutil` builds an `.icns` from an `.iconset` directory containing the
expected sizes:

```
PCEdit.iconset/
  icon_16x16.png      (16×16)
  icon_16x16@2x.png   (32×32)
  icon_32x32.png      (32×32)
  icon_32x32@2x.png   (64×64)
  icon_128x128.png    (128×128)
  icon_128x128@2x.png (256×256)
  icon_256x256.png    (256×256)
  icon_256x256@2x.png (512×512)
  icon_512x512.png    (512×512)
  icon_512x512@2x.png (1024×1024)
```

```sh
iconutil -c icns PCEdit.iconset -o PCEdit.icns
```

The `@2x` files must contain the larger pixel size despite the `@2x` name
suggestion — Apple's iconset format is somewhat counterintuitive.

### Windows .ico

ImageMagick handles multi-resolution ICOs natively:

```sh
magick -background none pokeball.svg \
    -define icon:auto-resize=16,32,48,64,128,256 \
    PCEdit.ico
```

Without `-background none` the icon ships with a white background that
shows in dark themes.

## Code signing

We are **not** signed yet. That means:

| OS | warning users see | bypass |
|---|---|---|
| macOS | "PCEdit can't be opened because Apple cannot check it for malicious software." | Right-click → **Open** → confirm. Sets the quarantine bit aside. |
| Windows | SmartScreen "Windows protected your PC" | Click **More info** → **Run anyway**. |
| Linux | (none) | n/a |

To remove the warnings, you need:

- **macOS**: an Apple Developer ID certificate ($99/yr). After signing,
  also run `xcrun notarytool submit` for notarisation, then `stapler`
  the result.
- **Windows**: a code-signing cert (~$200–$400/yr). EV certs immediately
  bypass SmartScreen; standard certs build "reputation" over time.

Both are recurring costs and require an organisation account, so we
defer this until install volume justifies it. Document the right-click
bypass in the release notes' install instructions instead.

## Common gotchas

### Tk not bundling on bare Homebrew Python

Homebrew's `python@3.x` doesn't include `_tkinter` by default. Symptom:

```
ModuleNotFoundError: No module named '_tkinter'
```

Fix: `brew install python-tk@3.13` (matching your Python's version), or
on Apple Silicon use `/opt/homebrew/bin/python3` which does ship Tk 9.0.
Our build scripts run `python3 -c "import tkinter"` early in CI to fail
fast if Tk is unavailable.

### Universal2 fallback on Apple Silicon

Building `--target-arch universal2` requires a Python interpreter that
itself was built as a universal2 binary. A native arm64 Python from
Homebrew can't produce universal2 PyInstaller output.

`scripts/build_macos.py` runs `--target-arch universal2` first and falls
back to the native arch if PyInstaller errors. CI's
`actions/setup-python@v5` ships a universal2 Python on macOS, so the
fallback isn't needed there; locally on bare Homebrew it is.

If you need universal2 from a non-universal Python, use `actions/setup-python`
or download a universal2 build from python.org.

### Windows cp1252 stdout encoding

Windows runners default to cp1252 for `stdout`. A success print
containing a Unicode character (`✓`, `→`, etc.) crashes with:

```
UnicodeEncodeError: 'charmap' codec can't encode character '✓'
```

Two fixes, both applied in our scripts:

1. Use ASCII output (`OK` instead of `✓`).
2. Defensive `sys.stdout.reconfigure(encoding="utf-8", errors="replace")`
   at module load.

The build itself almost always succeeds before the print errors — but
the non-zero exit code skips artefact upload, so the bug is functionally
fatal.

### macOS hdiutil race condition

After PyInstaller's `BUNDLE` step signs the `.app`, the codesign daemon
sometimes holds a transient lock on the staging directory. The next
`hdiutil create` then fails with:

```
hdiutil: create failed - Resource busy
```

Two-pronged fix:

1. **Suppress Spotlight indexing** on the staging directory before
   `hdiutil` runs:
   ```sh
   touch dist/dmg-staging/.metadata_never_index
   ```
   Apple-documented behaviour; presence of this marker file excludes the
   directory from indexing entirely. The marker stays inside the
   eventual `.dmg` and is harmless.
2. **Retry `hdiutil create`** with linear backoff (2 s, 4 s, 6 s) before
   giving up. Three attempts is more than enough in practice.

`scripts/build_macos.py` does both.

### File naming

GitHub Releases store all assets in a flat namespace. If two
platforms produce `PCEdit.dmg` and `PCEdit.exe` — fine, different
extensions. But `PCEdit.tar.gz` (Linux) and a future `PCEdit.zip`
(Windows) would collide. We tag the platform in every filename:

```
PCEdit-macos.dmg
PCEdit-windows.exe
PCEdit-linux-x86_64.tar.gz
```

Each builder script renames its raw PyInstaller output before declaring
success.

### `.spec` files in the working tree

PyInstaller writes a `<name>.spec` file next to the entry point on every
build. We `.gitignore` `*.spec` so the working tree stays clean.

## CI: matrix build on tag push

The relevant workflow lives at `.github/workflows/release.yml`. Triggers:

- **Push to `release/**` branch** → builds all three platforms, uploads
  each as a downloadable workflow artefact. Use these for iteration on
  a release branch before tagging.
- **Push of a `v*` tag** → builds all three, uploads each *and* attaches
  to the matching GitHub Release (which `scripts/release.py` created
  from `CHANGELOG.md`).
- **`workflow_dispatch`** → lets you re-run from the Actions tab without
  pushing a new commit, useful for flaky retries.

Per-job structure:

```yaml
jobs:
  macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.13" }
      - run: python3 -c "import tkinter; print('tk', tkinter.TkVersion)"
      - run: python3 scripts/build_macos.py
      - run: python3 pcedit.py --help                # smoke test the CLI
      - uses: actions/upload-artifact@v4
        with:
          name: PCEdit-macos
          path: dist/PCEdit-macos.dmg
      - if: startsWith(github.ref, 'refs/tags/v')
        env: { GH_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
        run: gh release upload "${GITHUB_REF#refs/tags/}" dist/PCEdit-macos.dmg --clobber
```

The `windows` and `linux` jobs are parallel — same shape, different
runner and builder script. Each is independent: a flake on Windows
doesn't block macOS or Linux. If only one job fails, `gh run rerun
<run-id> --failed` re-runs just that one.

The job needs `permissions: contents: write` at the workflow level for
`gh release upload` to work with the default `GITHUB_TOKEN`.

## Smoke testing the bundle

Building successfully isn't proof that the bundle *runs*. Each CI job
runs a quick `python3 pcedit.py --help` against the source as a
proxy — it catches missing imports and broken stdlib references but not
GUI-startup bugs. To go further:

```sh
# macOS — launch the bundled app with a sample save and confirm it stays alive
dist/PCEdit.app/Contents/MacOS/PCEdit /tmp/sample.txt &
APP_PID=$!
sleep 4
ps -p $APP_PID >/dev/null || { echo "BUNDLE FAILED"; exit 1; }
kill $APP_PID

# Windows — same idea, but without a `&` (use Start-Process):
Start-Process dist\PCEdit-windows.exe ; Start-Sleep 4 ; Stop-Process -Name PCEdit-windows

# Linux — similar to macOS
./dist/PCEdit-linux-x86_64 &
APP_PID=$!
sleep 4
kill -0 $APP_PID 2>/dev/null && echo OK ; kill $APP_PID
```

A real GUI smoke test (driving widgets, asserting state) needs `xvfb`
on Linux CI and would ship a meaningfully bigger workflow. Worth doing
once GUI bugs start slipping through.

## Troubleshooting

| symptom | diagnosis |
|---|---|
| **"PyInstaller: command not found"** | Builder scripts auto-`pip install pyinstaller` if missing — make sure your Python is the one running `pip`. On CI, `setup-python` handles this. |
| **`dist/PCEdit-*.dmg` is huge (>50 MB)** | Probably bundling pip cache or unrelated venv contents. Delete `build/` and `dist/` and rebuild: `rm -rf build dist`. |
| **Mac app shows "damaged, can't be opened"** | The download might have stripped the codesign signature. `xattr -d com.apple.quarantine /Applications/PCEdit.app` clears the quarantine flag. The actual fix is signing + notarising, but the bypass works for testers. |
| **Windows defender deletes the .exe on download** | PyInstaller `--onefile` heuristics sometimes trigger AV. Submit to Microsoft for whitelist (a one-time process) or sign the binary. |
| **Linux build runs locally but fails on user machine** | Likely a `glibc` version mismatch — the ELF needs at least the glibc version the build was made against. Build on the *oldest* Linux you want to support. We use `ubuntu-latest`; for broader compatibility, build on `ubuntu-22.04` or use AppImage. |
| **Tk widgets render at 96 dpi on a 4K display** | macOS handles this via the bundle Info.plist; PyInstaller usually does the right thing. On Windows, set `app.tk.call('tk', 'scaling', 1.5)` in code. On Linux, depends on the desktop environment. |

## Future enhancements

Tracked in the issue tracker as separate tickets where relevant:

- **AppImage on Linux**: `python-appimage` would produce a more polished
  drop-anywhere artefact than the bare ELF + tarball we ship today.
- **Inno Setup wrapper for Windows**: optional MSI / installer with Start
  Menu shortcuts. Probably not needed unless users ask.
- **Apple Developer signing + notarisation**: $99/yr; eliminates the
  right-click → Open friction on first launch.
- **Windows EV cert**: $200–$400/yr; eliminates SmartScreen warning.
- **Universal2 Python via setup-python**: explicitly request a
  universal2 build on CI so we stop falling back to native arch.
- **Real GUI smoke test under xvfb**: drive the Tk window through a few
  state changes in CI to catch GUI-init bugs before users do.

Each is a small, focused PR; none of them block today's flow.
