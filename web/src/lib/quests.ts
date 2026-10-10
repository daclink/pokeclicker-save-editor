/**
 * Read/flag/repair helpers for the Quests tab.
 *
 * PokeClicker has two independent quest systems under `save.quests`:
 *
 *   - `questList`  — 10 rotating "board" quests, always one of a fixed
 *     roster of quest *types*. Each entry:
 *     `{name, data: [amount, reward, ...extra], initial, claimed, notified}`.
 *   - `questLines` — fixed story quest lines. Each entry:
 *     `{state, name, quest: <active step index>, initial}`, where `state`
 *     is PokeClicker's `QuestLineState` enum (0 inactive / 1 started /
 *     2 ended / 3 suspended) and `initial` reflects whatever the
 *     *currently active* step snapshotted when it began.
 *
 * Both systems compute live progress the same way (PokeClicker's
 * `Quest.ts`): `progress = focus() - initial()`, with **no floor at
 * zero**. If a save edit lowers the tracked value after a quest snapshots
 * `initial`, progress goes negative and gets stuck forever — that's the
 * exact bug this module flags (diagnosed 2026-07-28: "Zero's Ambition" /
 * Purple Shards went to -962/10 after a save edit).
 *
 * Only quest types whose live focus maps to a save path we can read are
 * "resolvable" — flagged and repairable. Everything else reports
 * `progress: null` ("can't verify") rather than guessing:
 *
 *   - Board: `GainMoneyQuest`/`GainTokensQuest`/`GainFarmPointsQuest`/
 *     `GainGemsQuest` read a **lifetime** `save.statistics` counter
 *     (verified against PokeClicker source — NOT the spendable
 *     wallet/gemWallet balance `currencies.ts`/`gems.ts` model, a
 *     different field). These only ever increase under normal play, so a
 *     negative reading here is an unambiguous tamper signal.
 *   - Quest lines: only `CustomQuest` steps whose focus reads
 *     `player.itemList.<Key>` — resolved via the generated
 *     `data/quest-steps.json` (built by
 *     `scripts/fetch_pokeclicker_data.py` from PokeClicker's
 *     `QuestLineHelper.ts`).
 *
 * Board quests that are already `claimed` are finished: they report
 * progress null, are never flagged, and repair no-ops on them (the
 * live-minus-initial number is meaningless after claiming).
 *
 * Quest lines are only verified in the `started`/`suspended` states; an
 * `ended` line is saved with `quest: 0` and an `inactive` one never began,
 * so their step index/`initial` carry no meaning (progress null, never
 * flagged, never repaired).
 *
 * Quest-line step metadata is tied to one game version
 * (`data/quest-steps.json` -> `gameVersion`). Step indices shift between
 * releases, so line progress/flag/repair require `save.update.version` to
 * equal it exactly; otherwise the step type is shown for display only and
 * nothing is verified (see `questStepsMatchSave`). Board quests don't depend
 * on step data and are unaffected.
 *
 * Repair (on flagged rows only) resets `initial` to the current live
 * value. This is the closest safe approximation of PokeClicker's own
 * live-decrease compensation (`initial -= oldFocus - newFocus` in
 * `Quest.ts`'s focus subscriber), which only fires during an active browser
 * session and never for an out-of-band save edit. The game's version keeps
 * pre-decrease progress, which can't be recovered offline; resetting to the
 * live value restores progress 0.
 */
import type { SaveData } from './save'
import questStepsJson from '../../../data/quest-steps.json'

// --- types -------------------------------------------------------------

export type QuestLineState = 'inactive' | 'started' | 'ended' | 'suspended'

export type QuestStepMeta = {
  type: string
  itemKey?: string
  amount?: number
}

export type QuestStepsData = {
  /** PokeClicker version the step metadata was generated from. */
  gameVersion: string
  lines: Record<string, QuestStepMeta[]>
}

export type BoardQuestRow = {
  index: number
  name: string
  claimed: boolean
  /** False when the quest has no `initial` snapshot yet (game: not inProgress). */
  started: boolean
  amount: number | null
  progress: number | null
  flagged: boolean
}

export type QuestLineRow = {
  name: string
  state: QuestLineState
  step: number
  stepType: string | null
  amount: number | null
  progress: number | null
  flagged: boolean
}

const QUEST_STEPS = questStepsJson as QuestStepsData

/** PokeClicker version this editor's quest-line step data was built for. */
export const QUEST_STEPS_GAME_VERSION = QUEST_STEPS.gameVersion

const QUEST_LINE_STATES: readonly QuestLineState[] = [
  'inactive',
  'started',
  'ended',
  'suspended',
]

/** Only these states have a live, meaningful step index and `initial`.
 *  Ended lines are saved with `quest: 0`; inactive lines never started. */
const VERIFIABLE_LINE_STATES: ReadonlySet<QuestLineState> = new Set(['started', 'suspended'])

const CUSTOM_QUEST_TYPE = 'CustomQuest'

/** Version of the loaded save, or null if it has none. */
export function saveGameVersion(data: SaveData): string | null {
  const save = (data.save ?? {}) as Record<string, unknown>
  const update = save.update
  if (update === null || typeof update !== 'object') return null
  const v = (update as Record<string, unknown>).version
  return typeof v === 'string' ? v : null
}

/** True when the quest-step metadata was generated for exactly this save's
 *  game version. When false, quest-line checks are disabled. */
export function questStepsMatchSave(data: SaveData, steps: QuestStepsData = QUEST_STEPS): boolean {
  return saveGameVersion(data) === steps.gameVersion
}

// --- board quests --------------------------------------------------------

type QuestListEntry = {
  claimed?: boolean
  data?: unknown[]
  initial?: unknown
  name?: string
}

/** Board-quest type names we can resolve. This is an explicit allow-list:
 *  any other type (UsePokeballQuest, CatchShadowsQuest, DefeatGymQuest, ...)
 *  has no entry in the resolvers below and so reads as unverifiable. */
const QUEST_GAIN_MONEY = 'GainMoneyQuest'
const QUEST_GAIN_TOKENS = 'GainTokensQuest'
const QUEST_GAIN_FARM_POINTS = 'GainFarmPointsQuest'
const QUEST_GAIN_GEMS = 'GainGemsQuest'

const STAT_TOTAL_MONEY = 'totalMoney'
const STAT_TOTAL_DUNGEON_TOKENS = 'totalDungeonTokens'
const STAT_TOTAL_FARM_POINTS = 'totalFarmPoints'
const STAT_GEMS_GAINED = 'gemsGained'

/** Position of the gem-type index inside a GainGemsQuest `data` array. */
const GEMS_QUEST_TYPE_DATA_INDEX = 2
/** Position of the target amount inside a board quest `data` array. */
const QUEST_AMOUNT_DATA_INDEX = 0

/** Board-quest types whose live focus is a plain `save.statistics` scalar.
 *  `GainGemsQuest` is handled separately (positional array). */
const SIMPLE_STAT_FIELD: Record<string, string> = {
  [QUEST_GAIN_MONEY]: STAT_TOTAL_MONEY,
  [QUEST_GAIN_TOKENS]: STAT_TOTAL_DUNGEON_TOKENS,
  [QUEST_GAIN_FARM_POINTS]: STAT_TOTAL_FARM_POINTS,
}

function getStatistics(data: SaveData): Record<string, unknown> {
  const save = (data.save ?? {}) as Record<string, unknown>
  return (save.statistics ?? {}) as Record<string, unknown>
}

function getQuestList(data: SaveData): QuestListEntry[] {
  const save = (data.save ?? {}) as Record<string, unknown>
  const quests = (save.quests ?? {}) as Record<string, unknown>
  const list = quests.questList
  return Array.isArray(list) ? (list as QuestListEntry[]) : []
}

/** Live focus value for a board-quest entry, or `null` if this quest type
 *  isn't resolvable (or its expected save fields are missing/malformed). */
function liveBoardFocus(data: SaveData, entry: QuestListEntry): number | null {
  const stats = getStatistics(data)
  const field = Object.hasOwn(SIMPLE_STAT_FIELD, entry.name ?? '')
    ? SIMPLE_STAT_FIELD[entry.name as string]
    : undefined
  if (field) {
    const v = stats[field]
    return typeof v === 'number' ? v : null
  }
  if (entry.name === QUEST_GAIN_GEMS) {
    const typeIndex = entry.data?.[GEMS_QUEST_TYPE_DATA_INDEX]
    const gained = stats[STAT_GEMS_GAINED]
    if (typeof typeIndex === 'number' && Array.isArray(gained)) {
      const v = gained[typeIndex]
      return typeof v === 'number' ? v : null
    }
  }
  return null
}

export function readBoardQuests(data: SaveData): BoardQuestRow[] {
  return getQuestList(data).map((entry, i) => {
    const focus = entry.claimed ? null : liveBoardFocus(data, entry)
    const canVerify = focus !== null && typeof entry.initial === 'number'
    const progress = canVerify ? (focus as number) - (entry.initial as number) : null
    const amount = typeof entry.data?.[QUEST_AMOUNT_DATA_INDEX] === 'number'
        ? (entry.data[QUEST_AMOUNT_DATA_INDEX] as number)
        : null
    return {
      index: i,
      name: entry.name ?? '',
      claimed: entry.claimed ?? false,
      started: entry.initial !== null && entry.initial !== undefined,
      amount: canVerify ? amount : null,
      progress,
      flagged: progress !== null && progress < 0,
    }
  })
}

/** Resets `initial` to the live focus value. Only mutates when the row is
 *  actually flagged (recomputed here, not trusted from the caller) — an
 *  out-of-range index or an unflagged row is a silent no-op. */
export function repairBoardQuest(data: SaveData, index: number): void {
  const list = getQuestList(data)
  const entry = list[index]
  if (!entry || entry.claimed) return
  const focus = liveBoardFocus(data, entry)
  if (focus === null || typeof entry.initial !== 'number') return
  if (focus - entry.initial >= 0) return
  entry.initial = focus
}

// --- quest lines -----------------------------------------------------------

type QuestLineEntry = {
  state?: number
  name?: string
  quest?: number
  initial?: unknown
}

/** The player's item counts, or null if `_itemList` is absent/not a plain object. */
function getItemList(data: SaveData): Record<string, unknown> | null {
  const player = (data.player ?? {}) as Record<string, unknown>
  const items = player._itemList
  if (items === null || typeof items !== 'object' || Array.isArray(items)) return null
  return items as Record<string, unknown>
}

function getQuestLines(data: SaveData): QuestLineEntry[] {
  const save = (data.save ?? {}) as Record<string, unknown>
  const quests = (save.quests ?? {}) as Record<string, unknown>
  const lines = quests.questLines
  return Array.isArray(lines) ? (lines as QuestLineEntry[]) : []
}

function stateLabel(n: number | undefined): QuestLineState {
  return QUEST_LINE_STATES[n ?? 0] ?? 'inactive'
}

function stepMetaFor(steps: QuestStepsData, name: string, stepIndex: unknown): QuestStepMeta | null {
  if (typeof stepIndex !== 'number' || !Number.isInteger(stepIndex)) return null
  if (!Object.hasOwn(steps.lines, name)) return null
  return steps.lines[name][stepIndex] ?? null
}

/** Live focus + target amount for a quest-line step, or `null` if the step
 *  isn't a resolvable CustomQuest (no metadata, wrong type, or a
 *  CustomQuest whose focus isn't a player.itemList read). */
function liveLineFocus(
  data: SaveData,
  steps: QuestStepsData,
  state: QuestLineState,
  meta: QuestStepMeta | null,
): { focus: number; amount: number } | null {
  if (!VERIFIABLE_LINE_STATES.has(state)) return null
  if (!questStepsMatchSave(data, steps)) return null
  if (!meta || meta.type !== CUSTOM_QUEST_TYPE || meta.itemKey === undefined || meta.amount === undefined) {
    return null
  }
  const items = getItemList(data)
  if (items === null) return null
  // Absent key means the player holds 0: the game deletes zero-count items
  // when serializing (Player.ts toJSON) and re-initializes them to 0 on load
  // (Save.ts initializeItemlist). A present non-number value is corrupt.
  if (!Object.hasOwn(items, meta.itemKey)) return { focus: 0, amount: meta.amount }
  const v = items[meta.itemKey]
  if (typeof v !== 'number') return null
  return { focus: v, amount: meta.amount }
}

export function readQuestLines(data: SaveData, steps: QuestStepsData = QUEST_STEPS): QuestLineRow[] {
  return getQuestLines(data).map((entry) => {
    const state = stateLabel(entry.state)
    // Ended lines are saved with quest 0 and inactive ones never began, so
    // their step index is not a real step: show none.
    const meta = VERIFIABLE_LINE_STATES.has(state)
      ? stepMetaFor(steps, entry.name ?? '', entry.quest)
      : null
    const live = liveLineFocus(data, steps, state, meta)
    const canVerify = live !== null && typeof entry.initial === 'number'
    const progress = canVerify ? live!.focus - (entry.initial as number) : null
    return {
      name: entry.name ?? '',
      state,
      step: entry.quest ?? 0,
      stepType: meta?.type ?? null,
      amount: canVerify ? live!.amount : null,
      progress,
      flagged: progress !== null && progress < 0,
    }
  })
}

/** Resets `initial` to the live focus value. Recomputes flagged-ness
 *  itself rather than trusting the caller; a name that isn't found, isn't
 *  resolvable, or isn't actually flagged is a silent no-op. */
export function repairQuestLine(
  data: SaveData,
  name: string,
  steps: QuestStepsData = QUEST_STEPS,
): void {
  const lines = getQuestLines(data)
  const entry = lines.find((e) => e.name === name)
  if (!entry) return
  const meta = stepMetaFor(steps, entry.name ?? '', entry.quest)
  const live = liveLineFocus(data, steps, stateLabel(entry.state), meta)
  if (live === null || typeof entry.initial !== 'number') return
  if (live.focus - entry.initial >= 0) return
  entry.initial = live.focus
}
