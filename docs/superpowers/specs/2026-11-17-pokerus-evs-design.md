# Pokérus Resistant sets EVs + EV editing (web) — short design

**Date:** 2026-11-17 · **Scope:** web Caught tab only (desktop is sunset)

## Why

In-game a pokémon only becomes Resistant by reaching 50 EVs. The editor wrote
the Resistant status alone, producing a Resistant pokémon with 0 EVs — a state
the game never creates. EVs also had no editor at all.

## Save facts (game v0.10.26, `PartyPokemon.ts` / `GameConstants.ts`)

- Party entry key `"9"` = `effortPoints` (default 0; the game omits default keys).
- `EVs = floor(effortPoints / EP_EV_RATIO / modifier)`, `EP_EV_RATIO = 1000`,
  `modifier = EP_CHALLENGE_MODIFIER = 10` when `save.challenges.list.slowEVs`
  is true, else 1. A missing challenge entry counts as off.
- The game promotes to Resistant at 50 EVs and never demotes. There is no EV cap.

## Behaviour

1. **Resistant raises EVs (raise-only).** Setting pokérus to Resistant — edit
   dialog or bulk — raises EVs to 50 when they are lower. Higher EVs are never
   lowered (bulk "all Resistant" must not reset a 500-EV pokémon to 50).
2. **EV editing.** Sortable `EVs` column, an EVs field in the edit dialog, and
   a bulk "Set EVs" control. Whole EVs only.
3. **Exact points preserved.** If the requested EVs equal the entry's current
   EVs, key `"9"` is not rewritten (52,836 points stays 52,836, not 52,000).
4. **EVs 0** deletes key `"9"`.
5. **No demotion.** Lowering EVs below 50 leaves Resistant as it is. Raising an
   infected pokémon's EVs to 50+ is left for the game to promote on load (the
   existing hint already says so).
6. **Same-patch conflict.** `{pokerus: Resistant, evs: 30}` yields 50: the EV
   write is applied first, the Resistant raise last.
7. **Dialog sends only changed fields**, so an untouched EVs field cannot
   override the raise, and lowering EVs on an already-Resistant pokémon works.

## Approaches considered

- **Raise-only on Resistant (picked).** Matches the game's own invariant and
  never destroys progress.
- **Always set exactly 50.** Simpler, but bulk Resistant would wipe higher EVs.
- **Edit raw effort points.** Exact, but the user thinks in EVs and would have
  to know the ×1000 / ×10000 conversion.

## Validation

EVs must be a non-negative integer whose effort-point value is a safe integer;
otherwise `RangeError` and nothing is written (bulk validates before any write).

## Tests

Vitest: `caught.spec.ts` (conversion, Slow EVs, raise-only, exact-points,
delete-on-0, bad input, bulk), `caught-bulk.spec.ts` and
`caught-modal.spec.ts` (UI wiring).
