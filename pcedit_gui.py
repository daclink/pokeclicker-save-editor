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

import shutil
import sys
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from typing import Any

from pokeclicker_save import decode_file, encode_file


# Index → label for save.wallet.currencies. Position 5 is BattlePoints in some
# versions; we leave it untouched.
CURRENCY_LABELS = [
    ("PokéDollars",   0),
    ("Dungeon Tokens", 1),
    ("Quest Points",   2),
    ("Diamonds",       3),
    ("Farm Points",    4),
]

PROTEIN_KEY = "Protein|money"  # in player._itemMultipliers


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
        self.title("PokeClicker Save Editor")
        self.geometry("760x620")
        self.minsize(640, 480)

        self.path: Path | None = None
        self.data: dict | None = None

        self._build_top_bar()
        self._build_status_bar()
        self._build_notebook()
        self._set_data_loaded(False)

    # --- top + status -----------------------------------------------------

    def _build_top_bar(self) -> None:
        bar = ttk.Frame(self, padding=(8, 6))
        bar.pack(fill="x")

        self.path_var = tk.StringVar(value="(no file)")
        ttk.Label(bar, text="Save:").pack(side="left")
        ttk.Label(bar, textvariable=self.path_var, foreground="#444",
                  width=60, anchor="w").pack(side="left", padx=(6, 8))

        ttk.Button(bar, text="Browse…", command=self.on_browse).pack(side="left")
        self.btn_reload = ttk.Button(bar, text="Reload", command=self.on_reload)
        self.btn_reload.pack(side="left", padx=4)
        self.btn_save = ttk.Button(bar, text="Save", command=self.on_save)
        self.btn_save.pack(side="left", padx=4)
        self.btn_undo = ttk.Button(bar, text="Undo (.bak)", command=self.on_undo)
        self.btn_undo.pack(side="left", padx=4)

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
        self.tab_caught = CaughtTab(nb, self)
        nb.add(self.tab_curr, text="Currencies & Multipliers")
        nb.add(self.tab_eggs, text="Eggs")
        nb.add(self.tab_caught, text="Caught Pokémon")

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
            self.tab_caught.commit()
        except ValueError as e:
            messagebox.showerror("Invalid value", str(e))
            return
        bak = self.path.with_suffix(self.path.suffix + ".bak")
        try:
            shutil.copy2(self.path, bak)
            encode_file(self.data, self.path)
        except OSError as e:
            messagebox.showerror("Save failed", str(e))
            return
        self.status_var.set(f"saved {self.path.name}  (backup: {bak.name})")

    def on_undo(self) -> None:
        if self.path is None:
            return
        bak = self.path.with_suffix(self.path.suffix + ".bak")
        if not bak.exists():
            messagebox.showinfo("No backup", f"No backup found at\n{bak}")
            return
        if not messagebox.askyesno("Undo from backup",
                                    f"Restore {self.path.name} from {bak.name}?"):
            return
        shutil.copy2(bak, self.path)
        self.load(self.path)
        self.status_var.set(f"restored {self.path.name} from {bak.name}")

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
        self.tab_caught.refresh()
        self.status_var.set(f"loaded {path.name}")

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

        ttk.Label(mult, text="Protein price multiplier", width=24, anchor="w").grid(row=0, column=0, sticky="w")
        self.protein_var = tk.StringVar()
        ttk.Entry(mult, textvariable=self.protein_var, width=22).grid(row=0, column=1, sticky="w")
        ttk.Label(mult, text="(higher = vitamins cost more next purchase)",
                  foreground="#888").grid(row=0, column=2, sticky="w", padx=(8, 0))
        ttk.Button(mult, text="Reset to 1.0",
                   command=lambda: self.protein_var.set("1.0")).grid(row=1, column=1, sticky="w", pady=(6, 0))

    def refresh(self) -> None:
        d = self.app.data
        if d is None:
            return
        arr = d["save"]["wallet"]["currencies"]
        for idx, v in self.curr_vars.items():
            v.set(fnum(arr[idx] if idx < len(arr) else 0))
        mults = d["player"].get("_itemMultipliers", {})
        self.protein_var.set(fnum(mults.get(PROTEIN_KEY, 1.0)))

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
        val = parse_float(self.protein_var.get(), name="Protein price multiplier")
        if val <= 0:
            raise ValueError("Protein price multiplier must be > 0")
        mults[PROTEIN_KEY] = val


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


class CaughtTab(ttk.Frame):
    COLS = [
        ("id",        "ID",           50),
        ("0",         "atkBonus",     90),
        ("1",         "pokerus",      80),
        ("3",         "exp",          120),
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
            self.tree.column(k, width=w, anchor="center")
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
        self.title(f"Edit Pokémon #{entry.get('id')}")
        self.transient(parent)
        self.resizable(False, False)
        self.on_ok = on_ok

        ttk.Label(self, text=f"Pokédex ID: {entry.get('id')}").grid(
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
