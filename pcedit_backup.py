"""Save-file backup helpers, shared by the GUI and the CLI.

Two layouts, picked via ``pcedit_updates.get_setting("backup_layout", ...)``:

- ``"folder"`` (default since v0.6.0): a sibling ``bak/`` directory next to
  the save, with timestamped filenames so multiple edits accumulate
  history. ``Undo`` restores the most recent.
- ``"sidecar"`` (legacy): a single ``<file>.bak`` next to the save, which
  is overwritten on each save. Mirrors the pre-v0.6.0 behaviour.

The helpers always check both locations on read, so undo still works after
toggling layouts mid-run or against older saves.
"""
from __future__ import annotations

import datetime
import shutil
from pathlib import Path

from pcedit_updates import get_setting

LAYOUT_FOLDER = "folder"
LAYOUT_SIDECAR = "sidecar"
DEFAULT_LAYOUT = LAYOUT_FOLDER

BAK_DIR_NAME = "bak"
TIMESTAMP_FMT = "%Y%m%d-%H%M%S"


def current_layout() -> str:
    layout = get_setting("backup_layout", DEFAULT_LAYOUT)
    return layout if layout in (LAYOUT_FOLDER, LAYOUT_SIDECAR) else DEFAULT_LAYOUT


# --- write paths -------------------------------------------------------------

def _sidecar_path(save_path: Path) -> Path:
    return save_path.with_suffix(save_path.suffix + ".bak")


def _folder_path(save_path: Path, *, when: datetime.datetime | None = None) -> Path:
    when = when or datetime.datetime.now()
    bak_dir = save_path.parent / BAK_DIR_NAME
    ts = when.strftime(TIMESTAMP_FMT)
    return bak_dir / f"{save_path.stem}.{ts}{save_path.suffix}.bak"


def make_backup(save_path: Path) -> Path:
    """Copy ``save_path`` to a backup according to the active layout.

    Caller is responsible for ensuring ``save_path`` exists. Returns the
    path of the backup that was just written.
    """
    if current_layout() == LAYOUT_SIDECAR:
        bak = _sidecar_path(save_path)
        shutil.copy2(save_path, bak)
        return bak
    bak = _folder_path(save_path)
    bak.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(save_path, bak)
    return bak


# --- read paths --------------------------------------------------------------

def list_backups(save_path: Path) -> list[Path]:
    """Return every backup for ``save_path``, newest first.

    Includes both the sidecar and any timestamped files under ``bak/`` so
    undo still works after toggling layouts. Sorted by mtime descending.
    """
    out: list[Path] = []
    sidecar = _sidecar_path(save_path)
    if sidecar.is_file():
        out.append(sidecar)

    bak_dir = save_path.parent / BAK_DIR_NAME
    if bak_dir.is_dir():
        prefix = save_path.stem + "."
        for p in bak_dir.iterdir():
            if (p.is_file()
                    and p.name.startswith(prefix)
                    and p.name.endswith(save_path.suffix + ".bak")):
                out.append(p)

    out.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return out


def latest_backup(save_path: Path) -> Path | None:
    """Return the most recent backup for ``save_path``, or ``None``."""
    backups = list_backups(save_path)
    return backups[0] if backups else None
