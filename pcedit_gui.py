#!/usr/bin/env python3
"""pcedit_gui — Tkinter GUI for editing PokeClicker saves.

Tabs:
- Currencies & Multipliers: PokéDollars, dungeon tokens, quest points,
  diamonds, farm points, plus the Protein price multiplier.
- Eggs: edit/add/remove the 4-slot breeding egg list.
- Caught Pokémon: scrollable table; double-click a row to edit.

Top bar provides Browse / Load / Save / Undo (.bak) actions. Save creates
a `.bak` next to the target file before overwriting.
"""
from __future__ import annotations

import os
import shutil
import sys
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from typing import Any

from _version import __version__
from pokeclicker_save import decode_file, encode_file
from pokeclicker_data import REGION_RANGES, name_for
from pcedit_backup import (
    LAYOUT_FOLDER,
    LAYOUT_SIDECAR,
    current_layout,
    latest_backup,
    list_backups,
    make_backup,
)
from pcedit_updates import (
    REPO,
    UpdateResult,
    check_for_update_async,
    get_setting,
    set_setting,
)


# Index → label for save.wallet.currencies. Position 5 is BattlePoints in some
# versions; we leave it untouched.
CURRENCY_LABELS = [
    ("PokéDollars",   0),
    ("Dungeon Tokens", 1),
    ("Quest Points",   2),
    ("Diamonds",       3),
    ("Farm Points",    4),
]

# Multipliers in player._itemMultipliers we expose as named rows.
# `kind` groups vitamins (Reset all vitamins button operates on these).
MULTIPLIERS: list[tuple[str, str, str]] = [
    ("Protein price multiplier",     "Protein|money",        "vitamin"),
    ("Calcium price multiplier",     "Calcium|money",        "vitamin"),
    ("Carbos price multiplier",      "Carbos|money",         "vitamin"),
    ("Master Ball price multiplier", "Masterball|farmPoint", "ball"),
]


# --- helpers ----------------------------------------------------------------

def fnum(v: Any, fallback: str = "0") -> str:
    if v is None:
        return fallback
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def parse_int(s: str, *, name: str = "value") -> int:
    s = s.strip().replace(",", "")
    if not s:
        return 0
    try:
        return int(float(s))  # tolerate "1e6" / "1.0"
    except ValueError as e:
        raise ValueError(f"{name}: not a number: {s!r}") from e


def parse_float(s: str, *, name: str = "value") -> float:
    s = s.strip().replace(",", "")
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError as e:
        raise ValueError(f"{name}: not a number: {s!r}") from e


# --- main app ---------------------------------------------------------------

class PCEditGUI(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title(f"PokeClicker Save Editor — v{__version__}")
        self.geometry("820x720")
        self.minsize(560, 540)

        self.path: Path | None = None
        self.data: dict | None = None

        self._build_menubar()
        self._build_top_bar()
        self._build_update_banner()
        self._build_status_bar()
        self._build_notebook()
        self._set_data_loaded(False)

        # Kick off the update check 200 ms after mainloop starts so first
        # paint is unaffected. Honours the "update_check_on_launch" setting.
        self.after(200, self._kickoff_update_check)

    # --- menubar ----------------------------------------------------------

    def _build_menubar(self) -> None:
        menubar = tk.Menu(self)

        # Settings menu
        settings_menu = tk.Menu(menubar, tearoff=0)
        # update_check_on_launch toggle
        self._auto_check_var = tk.BooleanVar(
            value=bool(get_setting("update_check_on_launch", True)))

        def _persist_auto_check() -> None:
            set_setting("update_check_on_launch", self._auto_check_var.get())

        settings_menu.add_checkbutton(
            label="Update check on launch",
            variable=self._auto_check_var,
            command=_persist_auto_check)

        # backup_layout submenu (radio)
        layout_menu = tk.Menu(settings_menu, tearoff=0)
        self._backup_layout_var = tk.StringVar(value=current_layout())

        def _persist_layout() -> None:
            set_setting("backup_layout", self._backup_layout_var.get())
            self.status_var.set(
                f"backup layout: {self._backup_layout_var.get()}")

        layout_menu.add_radiobutton(
            label="Folder (bak/ with timestamps)",
            value=LAYOUT_FOLDER,
            variable=self._backup_layout_var,
            command=_persist_layout)
        layout_menu.add_radiobutton(
            label="Sidecar (<file>.bak, overwritten)",
            value=LAYOUT_SIDECAR,
            variable=self._backup_layout_var,
            command=_persist_layout)
        settings_menu.add_cascade(label="Backup layout", menu=layout_menu)

        menubar.add_cascade(label="Settings", menu=settings_menu)

        # Help menu
        help_menu = tk.Menu(menubar, tearoff=0)
        help_menu.add_command(label="Check for updates…",
                              command=self._open_update_check_dialog)
        help_menu.add_command(label="Browse all backups…",
                              command=self._open_backups_dialog)
        help_menu.add_separator()
        help_menu.add_command(label="About PCEdit",
                              command=self._open_about_dialog)
        menubar.add_cascade(label="Help", menu=help_menu)

        self.config(menu=menubar)

    # --- top + status -----------------------------------------------------

    def _build_top_bar(self) -> None:
        # Two-row top bar so the action buttons are always visible regardless
        # of the loaded path's length:
        #   row 1: "Save: <path>"   (path label expands and truncates)
        #   row 2: [Browse…] [Reload] [Save] [Undo (.bak)]
        wrap = ttk.Frame(self, padding=(8, 6))
        wrap.pack(fill="x")
        self._top_bar_frame = wrap   # for the update banner to position itself after

        path_row = ttk.Frame(wrap)
        path_row.pack(fill="x")
        self.path_var = tk.StringVar(value="(no file)")
        ttk.Label(path_row, text="Save:").pack(side="left")
        ttk.Label(path_row, textvariable=self.path_var, foreground="#444",
                  anchor="w").pack(side="left", fill="x", expand=True, padx=(6, 0))

        btn_row = ttk.Frame(wrap)
        btn_row.pack(fill="x", pady=(6, 0))
        ttk.Button(btn_row, text="Browse…", command=self.on_browse).pack(side="left")
        self.btn_reload = ttk.Button(btn_row, text="Reload", command=self.on_reload)
        self.btn_reload.pack(side="left", padx=4)
        self.btn_save = ttk.Button(btn_row, text="Save", command=self.on_save)
        self.btn_save.pack(side="left", padx=4)
        self.btn_undo = ttk.Button(btn_row, text="Undo (.bak)", command=self.on_undo)
        self.btn_undo.pack(side="left", padx=4)

    def _build_update_banner(self) -> None:
        # Hidden until the update check returns "available".
        self._update_url: str | None = None
        self._update_dismissed_for: str | None = None
        self.update_banner = tk.Frame(self, background="#fff3cd",
                                       highlightbackground="#ffe69c",
                                       highlightthickness=1)
        # Placed by .pack only when needed.
        self.update_banner_label = tk.Label(
            self.update_banner, background="#fff3cd", foreground="#664d03",
            anchor="w", padx=8, pady=4, text="")
        self.update_banner_label.pack(side="left", fill="x", expand=True)
        ttk.Button(self.update_banner, text="Open release notes",
                   command=self._open_update_url).pack(side="left", padx=4, pady=4)
        ttk.Button(self.update_banner, text="Dismiss",
                   command=self._dismiss_update).pack(side="left", padx=(0, 8), pady=4)

    def _build_status_bar(self) -> None:
        self.status_var = tk.StringVar(value="open a save file to begin")
        ttk.Separator(self).pack(fill="x")
        ttk.Label(self, textvariable=self.status_var, anchor="w",
                  padding=(8, 4)).pack(fill="x", side="bottom")

    def _build_notebook(self) -> None:
        nb = ttk.Notebook(self)
        nb.pack(fill="both", expand=True, padx=8, pady=8)
        self.tab_curr = CurrenciesTab(nb, self)
        self.tab_eggs = EggsTab(nb, self)
        self.tab_shards = ShardsTab(nb, self)
        self.tab_caught = CaughtTab(nb, self)
        self.tab_dex = PokedexTab(nb, self)
        nb.add(self.tab_curr, text="Currencies & Multipliers")
        nb.add(self.tab_eggs, text="Eggs")
        nb.add(self.tab_shards, text="Shards")
        nb.add(self.tab_caught, text="Caught Pokémon")
        nb.add(self.tab_dex, text="Pokédex")

    # --- file actions -----------------------------------------------------

    def on_browse(self) -> None:
        fn = filedialog.askopenfilename(
            title="Open PokeClicker save",
            filetypes=[("PokeClicker save", "*.txt"), ("All files", "*")],
        )
        if fn:
            self.load(Path(fn))

    def on_reload(self) -> None:
        if self.path:
            self.load(self.path)

    def on_save(self) -> None:
        if self.path is None or self.data is None:
            return
        try:
            self.tab_curr.commit()
            self.tab_eggs.commit()
            self.tab_shards.commit()
            self.tab_caught.commit()
            self.tab_dex.commit()
        except ValueError as e:
            messagebox.showerror("Invalid value", str(e))
            return
        try:
            bak = make_backup(self.path)
            encode_file(self.data, self.path)
        except OSError as e:
            messagebox.showerror("Save failed", str(e))
            return
        # Show a friendly "next to file" or "in bak/" hint instead of
        # the absolute backup path.
        if bak.parent == self.path.parent:
            where = bak.name
        else:
            where = f"bak/{bak.name}"
        self.status_var.set(f"saved {self.path.name}  (backup: {where})")

    def on_undo(self) -> None:
        if self.path is None:
            return
        bak = latest_backup(self.path)
        if bak is None:
            messagebox.showinfo(
                "No backup",
                f"No backup found for\n{self.path.name}\n\n"
                f"Looked for {self.path.suffix}.bak next to the file and any "
                f"{self.path.stem}.YYYYMMDD-HHMMSS{self.path.suffix}.bak inside "
                f"a sibling bak/ folder.")
            return
        # Show the backup's timestamp/name so the user knows what they're rolling back to.
        if bak.parent == self.path.parent:
            origin = bak.name
        else:
            origin = f"bak/{bak.name}"
        if not messagebox.askyesno(
                "Undo from backup",
                f"Restore {self.path.name} from {origin}?"):
            return
        shutil.copy2(bak, self.path)
        self.load(self.path)
        self.status_var.set(f"restored {self.path.name} from {origin}")

    def load(self, path: Path) -> None:
        try:
            self.data = decode_file(path)
        except Exception as e:  # noqa: BLE001
            messagebox.showerror("Load failed", f"{path}\n\n{e}")
            return
        self.path = path
        self.path_var.set(str(path))
        self._set_data_loaded(True)
        self.tab_curr.refresh()
        self.tab_eggs.refresh()
        self.tab_shards.refresh()
        self.tab_caught.refresh()
        self.tab_dex.refresh()
        self.status_var.set(f"loaded {path.name}")

    # --- update check ------------------------------------------------------

    def _kickoff_update_check(self) -> None:
        # Bounce the result back to the Tk main thread via .after so we touch
        # widgets only from the main thread.
        def on_result(result: UpdateResult) -> None:
            self.after(0, lambda: self._render_update_result(result))
        check_for_update_async(on_result)

    def _render_update_result(self, result: UpdateResult) -> None:
        if result.status == "available":
            dismissed = get_setting("update_dismissed_version")
            if dismissed == result.latest:
                # The user already said "no thanks" for this exact release.
                self.status_var.set(
                    f"update available (v{result.latest}) — dismissed earlier")
                return
            self._update_url = result.html_url
            self.update_banner_label.configure(
                text=f"Update available: v{result.latest} "
                     f"(you have v{result.current}). Click to view release notes.")
            self.update_banner.pack(fill="x", padx=8, pady=(0, 4),
                                    after=self._top_bar_frame)
            self.status_var.set(f"update available: v{result.latest}")
        elif result.status == "current":
            self.status_var.set(f"up to date (v{result.current})")
        elif result.status == "skipped":
            self.status_var.set("update check: skipped")
        elif result.status == "error":
            # Soft-fail: just log to status bar at low volume.
            self.status_var.set(f"update check: {result.error}")

    def _open_update_url(self) -> None:
        if self._update_url:
            try:
                webbrowser.open(self._update_url)
            except Exception:  # noqa: BLE001
                pass

    def _open_update_check_dialog(self) -> None:
        UpdateCheckDialog(self)

    def _open_backups_dialog(self) -> None:
        if self.path is None:
            messagebox.showinfo("Backups", "Open a save first.")
            return
        BackupsDialog(self, self.path)

    def _open_about_dialog(self) -> None:
        repo_url = f"https://github.com/{REPO}"
        msg = (f"PCEdit — PokeClicker save editor\n"
               f"Version {__version__}\n\n"
               f"Source / releases:\n{repo_url}\n\n"
               f"Tested against PokeClicker v0.10.25.\n"
               f"Unofficial. CC0 1.0 licensed.")
        messagebox.showinfo("About PCEdit", msg)

    def _dismiss_update(self) -> None:
        # Persist so this exact release stays dismissed across launches.
        if self._update_url:
            # Pull "v0.5.0" out of the URL's tag suffix.
            tag = self._update_url.rstrip("/").split("/")[-1].lstrip("v")
            set_setting("update_dismissed_version", tag)
        self.update_banner.pack_forget()

    def _set_data_loaded(self, ok: bool) -> None:
        state = "normal" if ok else "disabled"
        for b in (self.btn_reload, self.btn_save, self.btn_undo):
            b.configure(state=state)


# --- tabs --------------------------------------------------------------------

class CurrenciesTab(ttk.Frame):
    def __init__(self, master, app: PCEditGUI) -> None:
        super().__init__(master, padding=12)
        self.app = app

        grid = ttk.LabelFrame(self, text="Wallet (save.wallet.currencies)", padding=10)
        grid.pack(fill="x")

        self.curr_vars: dict[int, tk.StringVar] = {}
        for row, (label, idx) in enumerate(CURRENCY_LABELS):
            ttk.Label(grid, text=label, width=18, anchor="w").grid(row=row, column=0, sticky="w", pady=2)
            v = tk.StringVar()
            ttk.Entry(grid, textvariable=v, width=22).grid(row=row, column=1, sticky="w", pady=2)
            ttk.Label(grid, text=f"[{idx}]", foreground="#888").grid(row=row, column=2, sticky="w", padx=(8, 0))
            self.curr_vars[idx] = v

        mult = ttk.LabelFrame(self, text="Multipliers (player._itemMultipliers)", padding=10)
        mult.pack(fill="x", pady=(12, 0))

        ttk.Label(mult,
                  text="Higher = costs more next purchase. Reset to 1.0 to "
                       "restore base price. A row at exactly 1.0 is dropped "
                       "from the save instead of being written.",
                  foreground="#888", wraplength=560, justify="left").grid(
            row=0, column=0, columnspan=3, sticky="w", pady=(0, 6))

        self.mult_vars: dict[str, tk.StringVar] = {}
        for r, (label, key, _kind) in enumerate(MULTIPLIERS, start=1):
            ttk.Label(mult, text=label, width=28, anchor="w").grid(
                row=r, column=0, sticky="w", pady=2)
            v = tk.StringVar(value="1.0")
            ttk.Entry(mult, textvariable=v, width=22).grid(
                row=r, column=1, sticky="w", pady=2)
            ttk.Button(mult, text="Reset to 1.0",
                       command=lambda v=v: v.set("1.0")).grid(
                row=r, column=2, sticky="w", padx=(8, 0))
            self.mult_vars[key] = v

        # Bulk reset for the three vitamins together.
        def _reset_all_vitamins() -> None:
            for _label, key, kind in MULTIPLIERS:
                if kind == "vitamin":
                    self.mult_vars[key].set("1.0")

        ttk.Button(mult, text="Reset all vitamins to 1.0",
                   command=_reset_all_vitamins).grid(
            row=len(MULTIPLIERS) + 1, column=0, columnspan=3,
            sticky="w", pady=(8, 0))

    def refresh(self) -> None:
        d = self.app.data
        if d is None:
            return
        arr = d["save"]["wallet"]["currencies"]
        for idx, v in self.curr_vars.items():
            v.set(fnum(arr[idx] if idx < len(arr) else 0))
        mults = d["player"].get("_itemMultipliers", {})
        for key, v in self.mult_vars.items():
            v.set(fnum(mults.get(key, 1.0)))

    def commit(self) -> None:
        d = self.app.data
        if d is None:
            return
        arr = d["save"]["wallet"]["currencies"]
        for idx, v in self.curr_vars.items():
            while len(arr) <= idx:
                arr.append(0)
            arr[idx] = parse_int(v.get(), name=f"currencies[{idx}]")
        mults = d["player"].setdefault("_itemMultipliers", {})
        for label, key, _ in MULTIPLIERS:
            val = parse_float(self.mult_vars[key].get(), name=label)
            if val <= 0:
                raise ValueError(f"{label} must be > 0")
            # Don't pollute saves with 1.0 keys for things the user never
            # touched — the game treats absent and 1.0 identically.
            if abs(val - 1.0) < 1e-9:
                mults.pop(key, None)
            else:
                mults[key] = val


class EggsTab(ttk.Frame):
    EGG_TYPES = {
        -1: "Empty",
        0: "Pokémon",
        1: "Fire",
        2: "Water",
        3: "Grass",
        4: "Fighting",
        5: "Electric",
        6: "Dragon",
        7: "Mystery",
        8: "Fossil",
    }

    # Quick-add presets. The `pokemon` field is a representative pokémon for
    # the type; PokeClicker picks the actual pokémon when the egg is opened
    # from the shop, but the field is non-zero in real eggList entries.
    # totalSteps values match what shop-bought type eggs use in v0.10.x.
    QUICK_ADD = [
        ("Grass",   {"type": 3, "pokemon": 1,   "totalSteps": 9000}),   # Bulbasaur
        ("Fire",    {"type": 1, "pokemon": 4,   "totalSteps": 9000}),   # Charmander
        ("Water",   {"type": 2, "pokemon": 7,   "totalSteps": 9000}),   # Squirtle
        ("Dragon",  {"type": 6, "pokemon": 147, "totalSteps": 9000}),   # Dratini
        ("Mystery", {"type": 7, "pokemon": 132, "totalSteps": 9000}),   # Ditto stand-in
    ]

    def __init__(self, master, app: PCEditGUI) -> None:
        super().__init__(master, padding=12)
        self.app = app

        ttk.Label(self, text="Up to `eggSlots` slots are real eggs; trailing entries with type=-1 are empty.",
                  foreground="#666").pack(anchor="w")

        info = ttk.Frame(self)
        info.pack(fill="x", pady=(6, 8))
        ttk.Label(info, text="Egg slots:").pack(side="left")
        self.slots_var = tk.StringVar()
        ttk.Entry(info, textvariable=self.slots_var, width=6).pack(side="left", padx=(4, 12))
        ttk.Label(info, text="(save.breeding.eggSlots)", foreground="#888").pack(side="left")

        cols = ("idx", "pokemon", "type", "steps", "totalSteps", "shinyChance", "notified")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", height=8)
        for c, w in zip(cols, (40, 100, 80, 80, 90, 100, 70)):
            self.tree.heading(c, text=c)
            self.tree.column(c, width=w, anchor="center")
        self.tree.pack(fill="both", expand=True)
        self.tree.bind("<Double-1>", self._on_edit)

        btns = ttk.Frame(self)
        btns.pack(fill="x", pady=(8, 0))
        ttk.Button(btns, text="Edit selected…", command=self._on_edit).pack(side="left")
        ttk.Button(btns, text="Hatch now", command=self._on_hatch).pack(side="left", padx=4)
        ttk.Button(btns, text="Make empty", command=self._on_clear).pack(side="left", padx=4)
        ttk.Button(btns, text="Add egg…", command=self._on_add).pack(side="left", padx=4)
        ttk.Button(btns, text="Remove", command=self._on_remove).pack(side="left", padx=4)

        quick = ttk.LabelFrame(self, text="Quick-add type egg", padding=6)
        quick.pack(fill="x", pady=(8, 0))
        ttk.Label(quick, text="Fills the first empty slot, or appends if all are full.",
                  foreground="#666").pack(anchor="w")
        row = ttk.Frame(quick)
        row.pack(fill="x", pady=(4, 0))
        for label, preset in self.QUICK_ADD:
            ttk.Button(row, text=f"+ {label}",
                       command=lambda p=preset: self._on_quick_add(p)).pack(side="left", padx=2)

    def refresh(self) -> None:
        for iid in self.tree.get_children():
            self.tree.delete(iid)
        d = self.app.data
        if d is None:
            return
        breeding = d["save"]["breeding"]
        self.slots_var.set(fnum(breeding.get("eggSlots", 1)))
        for i, egg in enumerate(breeding.get("eggList", [])):
            self.tree.insert("", "end", iid=str(i), values=(
                i,
                egg.get("pokemon", 0),
                f'{egg.get("type", -1)} ({self.EGG_TYPES.get(egg.get("type", -1), "?")})',
                fnum(egg.get("steps", 0)),
                fnum(egg.get("totalSteps", 0)),
                fnum(egg.get("shinyChance", 1024)),
                "yes" if egg.get("notified") else "",
            ))

    def commit(self) -> None:
        d = self.app.data
        if d is None:
            return
        d["save"]["breeding"]["eggSlots"] = parse_int(self.slots_var.get(), name="eggSlots")

    def _selected_index(self) -> int | None:
        sel = self.tree.selection()
        if not sel:
            return None
        return int(sel[0])

    def _on_edit(self, _evt=None) -> None:
        i = self._selected_index()
        if i is None:
            return
        eggs = self.app.data["save"]["breeding"]["eggList"]
        EggDialog(self, eggs[i], on_ok=lambda e: self._set(i, e))

    def _set(self, i: int, egg: dict) -> None:
        self.app.data["save"]["breeding"]["eggList"][i] = egg
        self.refresh()
        self.tree.selection_set(str(i))

    def _on_hatch(self) -> None:
        i = self._selected_index()
        if i is None:
            return
        egg = self.app.data["save"]["breeding"]["eggList"][i]
        egg["steps"] = egg.get("totalSteps", 0)
        self.refresh()
        self.tree.selection_set(str(i))

    def _on_clear(self) -> None:
        i = self._selected_index()
        if i is None:
            return
        self.app.data["save"]["breeding"]["eggList"][i] = {
            "totalSteps": 0, "steps": 0, "shinyChance": 1024,
            "pokemon": 0, "type": -1, "notified": False,
        }
        self.refresh()
        self.tree.selection_set(str(i))

    def _on_add(self) -> None:
        eggs = self.app.data["save"]["breeding"]["eggList"]
        empty = {"totalSteps": 1200, "steps": 0, "shinyChance": 1024,
                 "pokemon": 1, "type": 0, "notified": False}
        EggDialog(self, empty, on_ok=lambda e: (eggs.append(e), self.refresh()))

    def _on_remove(self) -> None:
        i = self._selected_index()
        if i is None:
            return
        del self.app.data["save"]["breeding"]["eggList"][i]
        self.refresh()

    def _on_quick_add(self, preset: dict) -> None:
        eggs = self.app.data["save"]["breeding"]["eggList"]
        egg = {
            "totalSteps":  preset["totalSteps"],
            "steps":       0,
            "shinyChance": 1024,
            "pokemon":     preset["pokemon"],
            "type":        preset["type"],
            "notified":    False,
        }
        # Replace the first empty slot if there is one; otherwise append.
        target = next((i for i, e in enumerate(eggs)
                       if isinstance(e, dict) and e.get("type", -1) == -1), None)
        if target is None:
            eggs.append(egg)
            target = len(eggs) - 1
        else:
            eggs[target] = egg
        # Make sure eggSlots reflects what's there.
        breeding = self.app.data["save"]["breeding"]
        if breeding.get("eggSlots", 1) < len(eggs):
            breeding["eggSlots"] = len(eggs)
            self.slots_var.set(str(breeding["eggSlots"]))
        self.refresh()
        self.tree.selection_set(str(target))
        self.app.status_var.set(
            f"added {self.EGG_TYPES.get(egg['type'], '?')} egg in slot {target}")


class EggDialog(tk.Toplevel):
    def __init__(self, parent, egg: dict, *, on_ok) -> None:
        super().__init__(parent)
        self.title("Edit egg")
        self.transient(parent)
        self.resizable(False, False)
        self.on_ok = on_ok

        self.fields: dict[str, tk.StringVar] = {}
        spec = [
            ("pokemon",     "Pokémon ID"),
            ("type",        "Type (-1=empty, 0=normal, 1=fire, …)"),
            ("steps",       "Current steps"),
            ("totalSteps",  "Total steps to hatch"),
            ("shinyChance", "Shiny chance (lower = more likely)"),
        ]
        for r, (k, label) in enumerate(spec):
            ttk.Label(self, text=label).grid(row=r, column=0, sticky="w", padx=8, pady=4)
            v = tk.StringVar(value=fnum(egg.get(k, 0)))
            ttk.Entry(self, textvariable=v, width=20).grid(row=r, column=1, padx=8, pady=4)
            self.fields[k] = v
        self.notified_var = tk.BooleanVar(value=bool(egg.get("notified")))
        ttk.Checkbutton(self, text="notified", variable=self.notified_var).grid(
            row=len(spec), column=1, sticky="w", padx=8, pady=4)

        bar = ttk.Frame(self)
        bar.grid(row=len(spec) + 1, column=0, columnspan=2, sticky="ew", pady=(8, 8))
        ttk.Button(bar, text="OK", command=self._ok).pack(side="right", padx=8)
        ttk.Button(bar, text="Cancel", command=self.destroy).pack(side="right")
        self.bind("<Return>", lambda _e: self._ok())
        self.bind("<Escape>", lambda _e: self.destroy())
        self.grab_set()

    def _ok(self) -> None:
        try:
            egg = {
                "totalSteps":  parse_int(self.fields["totalSteps"].get(),  name="totalSteps"),
                "steps":       parse_int(self.fields["steps"].get(),       name="steps"),
                "shinyChance": parse_float(self.fields["shinyChance"].get(), name="shinyChance"),
                "pokemon":     parse_int(self.fields["pokemon"].get(),     name="pokemon"),
                "type":        parse_int(self.fields["type"].get(),        name="type"),
                "notified":    self.notified_var.get(),
            }
        except ValueError as e:
            messagebox.showerror("Invalid value", str(e), parent=self)
            return
        self.on_ok(egg)
        self.destroy()


class ShardsTab(ttk.Frame):
    """Edit type-shard counts in player._itemList.

    PokeClicker stores each colored shard as its own item (e.g. ``Red_shard``).
    The shop unlocks colors progressively per region, but writing a non-zero
    count for an as-yet-unseen color is harmless — the game will display and
    spend it once the unlock is reached.
    """

    # PokeClicker's canonical 16 shard colors, in the order they unlock.
    # Names match the underscore-suffixed keys in player._itemList.
    KNOWN_COLORS = [
        "Red", "Yellow", "Green", "Blue",          # Kanto
        "Black", "Grey",                            # Hoenn
        "Purple", "Crimson",                        # Sinnoh
        "Pink", "White",                            # Unova
        "Cyan", "Lime",                             # Kalos
        "Rose", "Ochre",                            # Alola
        "Beige", "Indigo",                          # Galar / later
    ]

    def __init__(self, master, app: PCEditGUI) -> None:
        super().__init__(master, padding=12)
        self.app = app
        self.vars: dict[str, tk.StringVar] = {}

        ttk.Label(self,
                  text="Shard counts (player._itemList.<Color>_shard). "
                       "Editing a color you haven't unlocked yet is fine — "
                       "it appears once you reach that region.",
                  foreground="#666", wraplength=700, justify="left").pack(anchor="w")

        body = ttk.Frame(self)
        body.pack(fill="x", pady=(8, 0))

        # 4-column grid: 4 colors per row.
        for i, color in enumerate(self.KNOWN_COLORS):
            r, c = divmod(i, 4)
            cell = ttk.Frame(body, padding=4)
            cell.grid(row=r, column=c, sticky="w")
            ttk.Label(cell, text=color, width=10, anchor="w").pack(side="left")
            v = tk.StringVar(value="0")
            ttk.Entry(cell, textvariable=v, width=8).pack(side="left")
            self.vars[f"{color}_shard"] = v

        bar = ttk.Frame(self)
        bar.pack(fill="x", pady=(10, 0))
        ttk.Button(bar, text="All known to 999",
                   command=lambda: self._fill(999)).pack(side="left")
        ttk.Button(bar, text="All known to 9999",
                   command=lambda: self._fill(9999)).pack(side="left", padx=4)
        ttk.Button(bar, text="Zero all",
                   command=lambda: self._fill(0)).pack(side="left")

        # Custom shards / unrecognised entries appear here.
        self.extras_box = ttk.LabelFrame(self,
            text="Other shard items in this save", padding=8)
        self.extras_box.pack(fill="x", pady=(12, 0))

    def refresh(self) -> None:
        d = self.app.data
        if d is None:
            return
        items = d["player"].get("_itemList", {})
        for key, var in self.vars.items():
            var.set(fnum(items.get(key, 0)))

        # Refresh the "extras" section with shards we didn't predeclare.
        for child in self.extras_box.winfo_children():
            child.destroy()
        extras = sorted(k for k in items
                        if k.endswith("_shard") and k not in self.vars)
        if not extras:
            ttk.Label(self.extras_box,
                      text="(none — all shards in this save are in the grid above)",
                      foreground="#888").pack(anchor="w")
            self._extra_vars: dict[str, tk.StringVar] = {}
            return
        self._extra_vars = {}
        for i, key in enumerate(extras):
            row = ttk.Frame(self.extras_box)
            row.pack(anchor="w")
            ttk.Label(row, text=key, width=22, anchor="w").pack(side="left")
            v = tk.StringVar(value=fnum(items[key]))
            ttk.Entry(row, textvariable=v, width=8).pack(side="left")
            self._extra_vars[key] = v

    def commit(self) -> None:
        d = self.app.data
        if d is None:
            return
        items = d["player"].setdefault("_itemList", {})
        for key, var in self.vars.items():
            n = parse_int(var.get(), name=key)
            if n < 0:
                raise ValueError(f"{key} must be ≥ 0")
            if n == 0:
                items.pop(key, None)
            else:
                items[key] = n
        for key, var in getattr(self, "_extra_vars", {}).items():
            n = parse_int(var.get(), name=key)
            if n < 0:
                raise ValueError(f"{key} must be ≥ 0")
            if n == 0:
                items.pop(key, None)
            else:
                items[key] = n

    def _fill(self, n: int) -> None:
        for v in self.vars.values():
            v.set(str(n))


class CaughtTab(ttk.Frame):
    # Column "name" is a read-only friendly species name for the row's id.
    # Falls back to "?" for IDs outside Kanto until the full national-dex
    # roster is filled in (issue #4).
    COLS = [
        ("id",        "ID",           50),
        ("name",      "Name",        130),
        ("0",         "atkBonus",     90),
        ("1",         "pokerus",      80),
        ("3",         "exp",         120),
        ("4",         "in egg",       60),
        ("5",         "resistant",    80),
    ]

    def __init__(self, master, app: PCEditGUI) -> None:
        super().__init__(master, padding=12)
        self.app = app

        ttk.Label(self,
                  text="Double-click a row to edit. atkBonus increments by 25 per hatch.",
                  foreground="#666").pack(anchor="w")

        body = ttk.Frame(self)
        body.pack(fill="both", expand=True, pady=(6, 0))

        cols = [c[0] for c in self.COLS]
        self.tree = ttk.Treeview(body, columns=cols, show="headings", height=18)
        for k, lbl, w in self.COLS:
            self.tree.heading(k, text=lbl)
            anchor = "w" if k == "name" else "center"
            self.tree.column(k, width=w, anchor=anchor)
        sb = ttk.Scrollbar(body, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb.set)
        self.tree.pack(side="left", fill="both", expand=True)
        sb.pack(side="left", fill="y")
        self.tree.bind("<Double-1>", self._on_edit)

        bar = ttk.Frame(self)
        bar.pack(fill="x", pady=(8, 0))
        ttk.Button(bar, text="Edit selected…", command=self._on_edit).pack(side="left")
        ttk.Button(bar, text="Mark resistant",   command=lambda: self._set_flag("5", True)).pack(side="left", padx=4)
        ttk.Button(bar, text="Clear resistant",  command=lambda: self._set_flag("5", False)).pack(side="left")
        ttk.Button(bar, text="Set atkBonus 100", command=lambda: self._set_field("0", 100)).pack(side="left", padx=4)

    def refresh(self) -> None:
        for iid in self.tree.get_children():
            self.tree.delete(iid)
        d = self.app.data
        if d is None:
            return
        for entry in sorted(d["save"]["party"]["caughtPokemon"], key=lambda e: e.get("id", 0)):
            if not isinstance(entry, dict):
                continue
            self.tree.insert("", "end", iid=str(entry.get("id")), values=(
                entry.get("id"),
                name_for(entry.get("id", 0)),
                entry.get("0", 0),
                entry.get("1", 0),
                fnum(entry.get("3", 0)),
                "yes" if entry.get("4") else "",
                "yes" if entry.get("5") else "",
            ))

    def commit(self) -> None:
        # Edits go straight into self.app.data via the dialog, so nothing to do.
        return

    def _selected_entry(self) -> dict | None:
        sel = self.tree.selection()
        if not sel:
            return None
        pid = int(sel[0])
        for entry in self.app.data["save"]["party"]["caughtPokemon"]:
            if entry.get("id") == pid:
                return entry
        return None

    def _on_edit(self, _evt=None) -> None:
        e = self._selected_entry()
        if e is None:
            return
        CaughtDialog(self, e, on_ok=lambda new: (e.update(new), self.refresh(),
                                                  self.tree.selection_set(str(e.get("id")))))

    def _set_flag(self, key: str, value: bool) -> None:
        e = self._selected_entry()
        if e is None:
            return
        if value:
            e[key] = True
        else:
            e.pop(key, None)
        self.refresh()
        self.tree.selection_set(str(e.get("id")))

    def _set_field(self, key: str, value: int) -> None:
        e = self._selected_entry()
        if e is None:
            return
        e[key] = value
        self.refresh()
        self.tree.selection_set(str(e.get("id")))


class CaughtDialog(tk.Toplevel):
    def __init__(self, parent, entry: dict, *, on_ok) -> None:
        super().__init__(parent)
        pid = entry.get("id")
        name = name_for(pid) if isinstance(pid, int) else "?"
        title = f"Edit Pokémon #{pid}" if name == "?" else f"Edit Pokémon #{pid} {name}"
        self.title(title)
        self.transient(parent)
        self.resizable(False, False)
        self.on_ok = on_ok

        ttk.Label(self,
                  text=f"Pokédex ID: {entry.get('id')}    Species: {name}").grid(
            row=0, column=0, columnspan=2, sticky="w", padx=8, pady=(8, 4))

        spec = [
            ("0", "atkBonus (hatch tiers, +25 each)"),
            ("1", "pokerus state (0=none, 1-4 progress)"),
            ("3", "exp"),
        ]
        self.fields: dict[str, tk.StringVar] = {}
        for r, (k, label) in enumerate(spec, start=1):
            ttk.Label(self, text=label).grid(row=r, column=0, sticky="w", padx=8, pady=2)
            v = tk.StringVar(value=fnum(entry.get(k, 0)))
            ttk.Entry(self, textvariable=v, width=22).grid(row=r, column=1, padx=8, pady=2)
            self.fields[k] = v

        self.in_egg = tk.BooleanVar(value=bool(entry.get("4")))
        self.resistant = tk.BooleanVar(value=bool(entry.get("5")))
        ttk.Checkbutton(self, text="in egg / breeding-pending", variable=self.in_egg).grid(
            row=len(spec) + 1, column=1, sticky="w", padx=8, pady=2)
        ttk.Checkbutton(self, text="resistant", variable=self.resistant).grid(
            row=len(spec) + 2, column=1, sticky="w", padx=8, pady=2)

        bar = ttk.Frame(self)
        bar.grid(row=len(spec) + 3, column=0, columnspan=2, sticky="ew", pady=(10, 8))
        ttk.Button(bar, text="OK", command=self._ok).pack(side="right", padx=8)
        ttk.Button(bar, text="Cancel", command=self.destroy).pack(side="right")
        self.bind("<Return>", lambda _e: self._ok())
        self.bind("<Escape>", lambda _e: self.destroy())
        self.grab_set()

    def _ok(self) -> None:
        try:
            new = {
                "0": parse_int(self.fields["0"].get(), name="atkBonus"),
                "1": parse_int(self.fields["1"].get(), name="pokerus"),
                "3": parse_int(self.fields["3"].get(), name="exp"),
            }
        except ValueError as e:
            messagebox.showerror("Invalid value", str(e), parent=self)
            return
        if self.in_egg.get():
            new["4"] = True
        if self.resistant.get():
            new["5"] = True
        # Caller does dict.update; clear the keys the user just toggled off so
        # they don't linger. Pass a sentinel via on_ok of None-valued keys.
        # Simpler: have the caller replace fully. We keep update semantics and
        # signal removal by setting the key to a sentinel handled by caller.
        # Here, we instead pre-clear in the entry from outside. Since update()
        # is what's called, just include explicit False/0 deletions:
        self._post = {
            "remove": [k for k in ("4", "5")
                       if not getattr(self, "in_egg" if k == "4" else "resistant").get()],
            "set": new,
        }
        # Use the post-dict via on_ok: we pass `set`, then caller removes leftovers.
        self.on_ok({"__patch__": self._post})
        self.destroy()


class PokedexTab(ttk.Frame):
    """Mark uncaught pokémon as caught, filtered by region.

    Adds entries to ``save.party.caughtPokemon`` of the form
    ``{"2": {"0": 0, "1": 0, "2": 0}, "3": 1, "id": <pid>}``. Existing
    entries are left alone — re-marking is a no-op.

    The "Also bump capture stats" toggle (off by default) extends the action
    to bump the in-game capture counters as well — see :meth:`_bump_stats`.
    """

    DEFAULT_NEW_EXP = 1

    def __init__(self, master, app: PCEditGUI) -> None:
        super().__init__(master, padding=12)
        self.app = app

        ttk.Label(self,
                  text="Pick a region to see its dex. Multi-select rows and "
                       "click a button to mark them caught. Already-caught "
                       "pokémon are left untouched.",
                  foreground="#666", wraplength=700, justify="left").pack(anchor="w")

        controls = ttk.Frame(self)
        controls.pack(fill="x", pady=(8, 4))
        ttk.Label(controls, text="Region:").pack(side="left")
        self.region_var = tk.StringVar(value=REGION_RANGES[0][0])
        self.region_box = ttk.Combobox(
            controls, textvariable=self.region_var, state="readonly", width=12,
            values=[r[0] for r in REGION_RANGES])
        self.region_box.pack(side="left", padx=(4, 12))
        self.region_box.bind("<<ComboboxSelected>>", lambda _e: self._render_listbox())

        self.show_uncaught_only = tk.BooleanVar(value=False)
        ttk.Checkbutton(controls, text="Show uncaught only",
                        variable=self.show_uncaught_only,
                        command=self._render_listbox).pack(side="left")

        self.status_var = tk.StringVar(value="")
        ttk.Label(controls, textvariable=self.status_var,
                  foreground="#444").pack(side="right")

        body = ttk.Frame(self)
        body.pack(fill="both", expand=True, pady=(4, 0))
        self.lb = tk.Listbox(body, selectmode="extended", activestyle="dotbox",
                             font=("Menlo", 12), height=18)
        sb = ttk.Scrollbar(body, orient="vertical", command=self.lb.yview)
        self.lb.configure(yscrollcommand=sb.set)
        self.lb.pack(side="left", fill="both", expand=True)
        sb.pack(side="left", fill="y")

        bar = ttk.Frame(self)
        bar.pack(fill="x", pady=(8, 0))
        ttk.Button(bar, text="Mark selected caught",
                   command=self._mark_selected).pack(side="left")
        ttk.Button(bar, text="Mark all uncaught in region",
                   command=self._mark_all_uncaught).pack(side="left", padx=4)
        ttk.Button(bar, text="Refresh", command=self.refresh).pack(side="right")

        # Stat-backfill toggle (#5). Defaults to off because bumping totals
        # changes Trainer Card numbers and (down the line) achievement
        # progress; users opting in are saying "make the dex consistent
        # with the trainer card too".
        self.bump_stats = tk.BooleanVar(value=False)
        opts = ttk.Frame(self)
        opts.pack(fill="x", pady=(4, 0))
        ttk.Checkbutton(
            opts,
            text="Also bump capture stats (totalPokemonCaptured, "
                 "pokemonCaptured.<id>, …)",
            variable=self.bump_stats).pack(side="left")

        # Cache: list of (pid, caught_bool) currently shown in the listbox.
        self._rows: list[tuple[int, bool]] = []

    # --- public hooks ----------------------------------------------------

    def refresh(self) -> None:
        if self.app.data is None:
            return
        self._render_listbox()

    def commit(self) -> None:
        # All edits are applied directly to self.app.data when the user clicks
        # the buttons; nothing to do at file-save time.
        return

    # --- helpers ---------------------------------------------------------

    def _caught_ids(self) -> set[int]:
        if self.app.data is None:
            return set()
        return {e.get("id") for e in self.app.data["save"]["party"]["caughtPokemon"]
                if isinstance(e, dict) and isinstance(e.get("id"), int)}

    def _selected_region(self) -> tuple[str, int, int]:
        label = self.region_var.get()
        for entry in REGION_RANGES:
            if entry[0] == label:
                return entry
        return REGION_RANGES[0]

    def _render_listbox(self) -> None:
        self.lb.delete(0, "end")
        self._rows.clear()
        if self.app.data is None:
            self.status_var.set("")
            return
        label, lo, hi = self._selected_region()
        caught = self._caught_ids()
        total = hi - lo + 1
        c_in_region = sum(1 for pid in range(lo, hi + 1) if pid in caught)
        self.status_var.set(f"{label}: {c_in_region}/{total} caught")

        only_uncaught = self.show_uncaught_only.get()
        for pid in range(lo, hi + 1):
            is_caught = pid in caught
            if only_uncaught and is_caught:
                continue
            mark = "✓" if is_caught else " "
            line = f"{mark} #{pid:04d}  {name_for(pid)}"
            self.lb.insert("end", line)
            self._rows.append((pid, is_caught))
            if is_caught:
                # Visually de-emphasise already-caught rows.
                self.lb.itemconfigure("end", foreground="#888")

    def _mark(self, ids: list[int]) -> int:
        """Add caughtPokemon entries for any IDs not already present.

        Returns how many entries were actually added.
        """
        if self.app.data is None or not ids:
            return 0
        party = self.app.data["save"]["party"]["caughtPokemon"]
        existing = self._caught_ids()
        added_ids: list[int] = []
        for pid in ids:
            if pid in existing:
                continue
            party.append({
                "2": {"0": 0, "1": 0, "2": 0},
                "3": self.DEFAULT_NEW_EXP,
                "id": pid,
            })
            existing.add(pid)
            added_ids.append(pid)
        if added_ids:
            if self.bump_stats.get():
                self._bump_stats(added_ids)
            # Refresh the other tab too so the caught table picks up new rows.
            self.app.tab_caught.refresh()
        return len(added_ids)

    def _bump_stats(self, ids: list[int]) -> None:
        """Update statistics counters so the Trainer Card matches the dex.

        For each newly-marked id:
          - ``pokemonCaptured[<id>]`` is set to ``max(1, current)``.
          - ``pokemonEncountered[<id>]`` is set to ``max(1, current)``
            (a real catch implies at least one encounter).
        And the gender-neutral totals are bumped by the number of new ids:
          - ``totalPokemonCaptured`` += len(ids)
          - ``totalPokemonEncountered`` += len(ids)

        Per-gender counters (Male/Female/Genderless) need a species
        gender-ratio table to credit the right bucket; that's deferred
        as a follow-up so this MVP stays simple. The gender-neutral
        totals on the Trainer Card are the ones users actually look at,
        so this fixes the visible mismatch even if the per-gender numbers
        are slightly under-counted.
        """
        stats = self.app.data["save"].setdefault("statistics", {})
        captured = stats.setdefault("pokemonCaptured", {})
        encountered = stats.setdefault("pokemonEncountered", {})
        for pid in ids:
            key = str(pid)
            captured[key] = max(1, int(captured.get(key, 0)))
            encountered[key] = max(1, int(encountered.get(key, 0)))
        bump = len(ids)
        stats["totalPokemonCaptured"] = int(stats.get("totalPokemonCaptured", 0)) + bump
        stats["totalPokemonEncountered"] = int(stats.get("totalPokemonEncountered", 0)) + bump

    def _mark_selected(self) -> None:
        idxs = self.lb.curselection()
        if not idxs:
            messagebox.showinfo("Mark caught",
                                "No rows selected.", parent=self)
            return
        ids = [self._rows[i][0] for i in idxs if not self._rows[i][1]]
        added = self._mark(ids)
        self._render_listbox()
        self.app.status_var.set(f"marked {added} caught (selected)")

    def _mark_all_uncaught(self) -> None:
        label, lo, hi = self._selected_region()
        caught = self._caught_ids()
        ids = [pid for pid in range(lo, hi + 1) if pid not in caught]
        if not ids:
            messagebox.showinfo("Mark caught",
                                f"All {hi - lo + 1} pokémon in {label} are already caught.",
                                parent=self)
            return
        if not messagebox.askyesno("Mark caught",
                                    f"Mark all {len(ids)} uncaught pokémon in {label} as caught?",
                                    parent=self):
            return
        added = self._mark(ids)
        self._render_listbox()
        self.app.status_var.set(f"marked {added} caught in {label}")


# Patch CaughtTab._on_edit to interpret the __patch__ payload from the dialog.
def _apply_patch(entry: dict, payload: dict) -> None:
    patch = payload.get("__patch__")
    if not patch:
        entry.update(payload)
        return
    for k in patch.get("remove", []):
        entry.pop(k, None)
    entry.update(patch.get("set", {}))


# Re-bind edit handler to use _apply_patch.
def _caught_on_edit(self, _evt=None):  # type: ignore[no-redef]
    e = self._selected_entry()
    if e is None:
        return
    def cb(payload):
        _apply_patch(e, payload)
        self.refresh()
        self.tree.selection_set(str(e.get("id")))
    CaughtDialog(self, e, on_ok=cb)


CaughtTab._on_edit = _caught_on_edit  # type: ignore[assignment]


# --- top-level dialogs ------------------------------------------------------

class UpdateCheckDialog(tk.Toplevel):
    """Manual update check (Help → Check for updates…).

    Bypasses the 24 h cache from the on-launch check and always hits the
    network. Shows three states: latest / available / error.
    """

    def __init__(self, parent: PCEditGUI) -> None:
        super().__init__(parent)
        self.title("Check for updates")
        self.transient(parent)
        self.resizable(False, False)
        self.grab_set()
        self._parent = parent
        self._url: str | None = None

        body = ttk.Frame(self, padding=14)
        body.pack(fill="both", expand=True)
        self.status = ttk.Label(body, text="Checking github.com…",
                                wraplength=360, justify="left")
        self.status.pack(anchor="w")

        self.button_row = ttk.Frame(body)
        self.button_row.pack(fill="x", pady=(12, 0))
        self._open_btn = ttk.Button(self.button_row, text="Open release notes",
                                    command=self._open_url, state="disabled")
        self._open_btn.pack(side="left")
        ttk.Button(self.button_row, text="Close",
                   command=self.destroy).pack(side="right")

        self.bind("<Escape>", lambda _e: self.destroy())

        # Force a fresh fetch (no cache) and bounce the result to the Tk
        # main thread.
        def on_result(result: UpdateResult) -> None:
            self.after(0, lambda: self._render(result))
        check_for_update_async(on_result, force=True)

    def _render(self, result: UpdateResult) -> None:
        if result.status == "current":
            self.status.configure(
                text=f"You're on the latest version (v{result.current}).")
        elif result.status == "available":
            self._url = result.html_url
            self._open_btn.configure(state="normal")
            self.status.configure(
                text=f"v{result.latest} is available. "
                     f"You're on v{result.current}.")
        elif result.status == "error":
            self.status.configure(
                text=f"Couldn't reach github.com.\n\n{result.error}")
        else:
            self.status.configure(
                text=f"Update check skipped: {result.error or 'unknown'}.")

    def _open_url(self) -> None:
        if self._url:
            try:
                webbrowser.open(self._url)
            except Exception:  # noqa: BLE001
                pass


class BackupsDialog(tk.Toplevel):
    """List every backup of the loaded save and allow restoring any of them."""

    def __init__(self, parent: PCEditGUI, save_path: Path) -> None:
        super().__init__(parent)
        self.title(f"Backups for {save_path.name}")
        self.transient(parent)
        self.grab_set()
        self.geometry("520x320")
        self._parent = parent
        self._save_path = save_path

        body = ttk.Frame(self, padding=12)
        body.pack(fill="both", expand=True)
        ttk.Label(body, text="Newest at the top. Double-click or use the "
                              "Restore button to roll back.",
                  foreground="#666", wraplength=480, justify="left").pack(anchor="w")

        list_wrap = ttk.Frame(body)
        list_wrap.pack(fill="both", expand=True, pady=(8, 0))
        self.lb = tk.Listbox(list_wrap, font=("Menlo", 11), activestyle="dotbox")
        sb = ttk.Scrollbar(list_wrap, orient="vertical", command=self.lb.yview)
        self.lb.configure(yscrollcommand=sb.set)
        self.lb.pack(side="left", fill="both", expand=True)
        sb.pack(side="left", fill="y")
        self.lb.bind("<Double-1>", lambda _e: self._restore())

        bar = ttk.Frame(body)
        bar.pack(fill="x", pady=(8, 0))
        ttk.Button(bar, text="Restore selected",
                   command=self._restore).pack(side="left")
        ttk.Button(bar, text="Reveal in folder",
                   command=self._reveal).pack(side="left", padx=4)
        ttk.Button(bar, text="Close",
                   command=self.destroy).pack(side="right")

        self._refresh()
        self.bind("<Escape>", lambda _e: self.destroy())

    def _refresh(self) -> None:
        self.lb.delete(0, "end")
        self._backups = list_backups(self._save_path)
        if not self._backups:
            self.lb.insert("end", "(no backups found)")
            return
        import datetime as _dt
        for p in self._backups:
            ts = _dt.datetime.fromtimestamp(p.stat().st_mtime)
            tag = "sidecar" if p.parent == self._save_path.parent else "bak/"
            line = f"{ts.strftime('%Y-%m-%d %H:%M:%S')}   [{tag}]  {p.name}"
            self.lb.insert("end", line)

    def _selected(self) -> Path | None:
        idx = self.lb.curselection()
        if not idx or not self._backups:
            return None
        return self._backups[idx[0]]

    def _restore(self) -> None:
        bak = self._selected()
        if bak is None:
            messagebox.showinfo("Restore", "Pick a backup first.", parent=self)
            return
        if not messagebox.askyesno(
                "Restore from backup",
                f"Replace {self._save_path.name} with {bak.name}?",
                parent=self):
            return
        shutil.copy2(bak, self._save_path)
        self._parent.load(self._save_path)
        self._parent.status_var.set(f"restored {self._save_path.name} from {bak.name}")
        self.destroy()

    def _reveal(self) -> None:
        bak = self._selected() or (self._backups[0] if self._backups else None)
        if bak is None:
            return
        # Open the containing folder in the OS file manager. Cross-platform
        # via webbrowser.open on the file:// URL works on macOS and most
        # Linux file managers; on Windows, fall back to os.startfile.
        try:
            if sys.platform.startswith("win"):
                os.startfile(str(bak.parent))  # type: ignore[attr-defined]
            else:
                webbrowser.open(bak.parent.as_uri())
        except Exception:  # noqa: BLE001
            pass


# --- entry point ------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    app = PCEditGUI()
    if argv and Path(argv[0]).exists():
        app.after(50, lambda: app.load(Path(argv[0])))
    app.mainloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
