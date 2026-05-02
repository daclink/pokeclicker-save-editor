#!/usr/bin/env python3
"""Build the synthetic save fixtures the schema tests load.

The fixtures live under ``tests/fixtures/<game-version>/`` and are committed
so CI doesn't need to regenerate them. Run this script after intentionally
changing the editor's expected shape.

We build saves from a Python dict literal rather than redacting a real one
so:

1. There's no risk of leaking the user's trainer id, achievements, etc.
2. Each fixture is small (~5 KB) and reviewable on every diff.
3. Latin-1 quirks the editor depends on (e.g. ``"Pokémon Tower"`` as the
   town name) are explicitly exercised.

The shape mirrors ``v0.10.25`` saves observed in the wild but is the
*minimum* the editor's code paths read. If a future game version ships a
new key the editor wants to read, add it here too.
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from pokeclicker_save import encode_file  # noqa: E402

OUT_DIR = REPO_ROOT / "tests" / "fixtures" / "v0.10.25"


def minimal_save() -> dict:
    """Return a minimum save dict that exercises every key the editor reads."""
    return {
        "player": {
            "_timeTraveller": False,
            "effectList": {},
            # ms timestamps; specific values don't matter as long as the
            # editor parses them as ints.
            "_lastSeen": 1700000000000,
            "_createdTime": 1690000000000,
            "_region": 0,
            "_subregion": 0,
            "_route": 1,
            # Latin-1 quirk: the game writes "Pokémon" as a single 0xe9
            # byte inside the JSON. encode_file handles that via latin-1
            # serialisation.
            "_townName": "Pokémon Tower",
            "highestRegion": 0,
            "highestSubRegion": 0,
            "regionStarters": [4, -1, -1, -1, -1, -1, -1, -1],
            "_itemList": {
                "Pokeball":     500,
                "Greatball":     50,
                "Lucky_egg":     10,
                "Yellow_shard":  25,
                "Protein":        7,
            },
            "_itemMultipliers": {
                "Protein|money":         3.5,
                "Masterball|farmPoint":  1.4,
            },
            "_origins": [0],
            "trainerId": "000000",
            "challenges": {"list": {}},
        },
        "save": {
            "update": {"version": "0.10.25"},
            "profile": {
                "name":          "Player",
                "trainer":       0,
                "pokemon":       1,
                "pokemonShiny":  False,
                "background":    0,
                "challenges":    {"list": {}},
                "pokerusStatus": 0,
            },
            "breeding": {
                "eggList": [
                    {"totalSteps": 1200, "steps": 600, "shinyChance": 1024,
                     "pokemon": 4, "type": 0, "notified": False},
                    {"totalSteps": 0, "steps": 0, "shinyChance": 1024,
                     "pokemon": 0, "type": -1, "notified": False},
                ],
                "eggSlots": 2,
                "queueList": [],
                "queueSlots": 0,
                "hatcheryHelpers": {"hired": [], "available": []},
            },
            "pokeballs": {"pokeballs": [500, 50, 0, 0, 0, 0, 0]},
            "pokeballFilters": {"list": []},
            "wallet": {"currencies": [10000, 1000, 100, 10, 50, 0, 0]},
            "keyItems": {
                "Town_map":     True,
                "Dungeon_ticket": True,
                "Super_rod":    False,
                "Explorer_kit": False,
            },
            "badgeCase": [True, False, False, False, False, False, False, False],
            "oakItems": {
                "Magic_Ball": {"isActive": False, "exp": 0, "level": 0},
            },
            "oakItemLoadouts": [
                {"name": "Loadout 1", "loadout": []},
            ],
            "categories": {"list": []},
            "party": {
                "caughtPokemon": [
                    # Charmander, hatched once, has some EVs and exp.
                    {"0": 25, "1": 0,
                     "2": {"0": 5, "1": 0, "2": 0},
                     "3": 250000, "id": 4},
                    # Pikachu, never hatched.
                    {"2": {"0": 0, "1": 0, "2": 0}, "3": 1, "id": 25},
                ],
            },
            "gems": {
                "gemWallet": [10, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                "gemUpgrades": [],
            },
            "underground": {
                "battery": {"charges": 0, "activeDischargeFrame": 0,
                            "batteryCooldown": 0},
                "tools":   {"selectedToolType": 0, "tools": []},
                "mine":    {"grid": [], "rewardGrid": [], "itemsBuried": 0,
                            "itemsFound": 0, "timeUntilDiscovery": 0,
                            "properties": {"config": {"displayName": "",
                                                       "type": 0},
                                            "extraItemsToGenerate": 0,
                                            "minimumItemsToGenerate": 0,
                                            "timeToDiscover": 0}},
                "helpers": [],
                "autoSearchMineType": 0,
                "undergroundExp": 0,
            },
            "farming": {
                "berryList":        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                "unlockedBerries":  [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                "mutations":        [],
                "plotList":         [],
                "farmHands":        [],
                "wanderCounter":    0,
                "shovelAmt":        0,
                "mulchShovelAmt":   0,
            },
            "logbook": {"logs": []},
            "redeemableCodes": [],
            "statistics": {
                "totalPokemonCaptured":   2,
                "totalPokemonEncountered": 2,
                "totalPokemonHatched":     1,
                "totalPokemonDefeated":    5,
                "totalShinyPokemonCaptured": 0,
                "totalDungeonTokens":      1000,
                "totalMoney":              10000,
                "totalQuestPoints":        100,
                "totalFarmPoints":         50,
                "secondsPlayed":           3600,
                "clickAttacks":            120,
                "questsCompleted":         3,
                "undergroundItemsFound":   0,
                "undergroundLayersMined":  0,
                # Per-id sub-dicts the back-fill code touches.
                "pokemonCaptured":   {"4": 1, "25": 1},
                "pokemonEncountered": {"4": 1, "25": 1},
            },
            "quests": {
                "level": 1, "xp": 100,
                "questLines": [],
                "questList":  [],
                "lastRefresh": "",
                "lastRefreshLevel": 0,
            },
            "events": {"list": []},
            "discord": {"id": "", "name": ""},
            "achievementTracker": {"trackedAchievementName": None},
            "challenges": {"list": {}},
            "battleFrontier": {"highestStage": 0, "currency": 0},
            "saveReminder": {"counter": 0, "saveReminderTimer": 0},
            "BattleCafe": {"choices": []},
            "dream-orbs": {"orbs": []},
            "PurifyChamber": {"chambers": []},
            "weatherapp": {"weatherState": []},
            "zMoves": {"available": [], "given": [], "used": []},
            "achievements": [],
        },
        "settings": {
            # The editor only reads a handful of keys here and writes them
            # back unchanged; we just need the dict to exist.
            "moduleHeight.pokeballSelector": 265,
            "achievementSort": 0,
            "partySort": 0,
        },
    }


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / "minimal.txt"
    encode_file(minimal_save(), out)
    print(f"OK wrote {out.relative_to(REPO_ROOT)}  ({out.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
