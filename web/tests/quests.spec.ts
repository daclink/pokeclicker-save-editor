/**
 * Pure-function tests for the quests helpers. Mirrors gems.spec.ts /
 * shards.spec.ts, but builds inline SaveData fixtures rather than using
 * the shared minimal fixture — tests/fixtures/v0.10.25/minimal.txt has
 * empty save.quests.{questList,questLines}.
 */
import { describe, expect, test } from 'vitest'

import type { SaveData } from '../src/lib/save'
import {
  readBoardQuests,
  readQuestLines,
  repairBoardQuest,
  repairQuestLine,
  type QuestStepsData,
} from '../src/lib/quests'
// Static import, matching the pattern already used in src/lib/data.ts —
// avoids relying on dynamic-JSON-import behavior in the test runner.
import realQuestStepsJson from '../../data/quest-steps.json'

function baseSave(overrides: {
  questList?: unknown[]
  questLines?: unknown[]
  statistics?: Record<string, unknown>
  itemList?: Record<string, unknown>
}): SaveData {
  return {
    player: { _itemList: overrides.itemList ?? {} },
    save: {
      statistics: overrides.statistics ?? {},
      quests: {
        questList: overrides.questList ?? [],
        questLines: overrides.questLines ?? [],
      },
    },
  } as unknown as SaveData
}

describe('readBoardQuests', () => {
  test('GainMoneyQuest: verifiable, positive progress, not flagged', () => {
    const data = baseSave({
      questList: [
        { name: 'GainMoneyQuest', data: [1000, 50], initial: 500, claimed: false, index: 0 },
      ],
      statistics: { totalMoney: 900 },
    })
    const rows = readBoardQuests(data)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ index: 0, name: 'GainMoneyQuest', amount: 1000, progress: 400, flagged: false })
  })

  test('GainTokensQuest reads statistics.totalDungeonTokens', () => {
    const data = baseSave({
      questList: [{ name: 'GainTokensQuest', data: [100, 10], initial: 50, claimed: false, index: 0 }],
      statistics: { totalDungeonTokens: 80 },
    })
    expect(readBoardQuests(data)[0].progress).toBe(30)
  })

  test('GainFarmPointsQuest reads statistics.totalFarmPoints', () => {
    const data = baseSave({
      questList: [{ name: 'GainFarmPointsQuest', data: [200, 20], initial: 100, claimed: false, index: 0 }],
      statistics: { totalFarmPoints: 260 },
    })
    expect(readBoardQuests(data)[0].progress).toBe(160)
  })

  test('GainGemsQuest reads statistics.gemsGained at the type index in data[2]', () => {
    const data = baseSave({
      questList: [{ name: 'GainGemsQuest', data: [430, 821, 10], initial: 519763, claimed: false, index: 0 }],
      statistics: { gemsGained: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 519900, 0, 0, 0, 0, 0, 0, 0] },
    })
    expect(readBoardQuests(data)[0].progress).toBe(137)
  })

  test('flags negative progress (regressed statistic)', () => {
    const data = baseSave({
      questList: [{ name: 'GainMoneyQuest', data: [1000, 50], initial: 500, claimed: false, index: 0 }],
      statistics: { totalMoney: 100 },
    })
    const row = readBoardQuests(data)[0]
    expect(row.progress).toBe(-400)
    expect(row.flagged).toBe(true)
  })

  test('unresolvable quest type: progress null, not flagged', () => {
    const data = baseSave({
      questList: [{ name: 'HatchEggsQuest', data: [20, 5], initial: 3, claimed: false, index: 0 }],
    })
    const row = readBoardQuests(data)[0]
    expect(row.progress).toBeNull()
    expect(row.flagged).toBe(false)
  })

  test.each([
    'UsePokeballQuest',
    'CatchShadowsQuest',
    'DefeatGymQuest',
    'CapturePokemonTypesQuest',
    'ClearBattleFrontierQuest',
  ])('real-save type %s is unresolvable by construction', (name) => {
    const data = baseSave({
      questList: [{ name, data: [10, 5, 1], initial: 999999, claimed: false, index: 0 }],
      statistics: { totalMoney: 1, totalDungeonTokens: 1, totalFarmPoints: 1, gemsGained: [1] },
    })
    const row = readBoardQuests(data)[0]
    expect(row.progress).toBeNull()
    expect(row.flagged).toBe(false)
  })

  test('uses array position as index, not the entry index field', () => {
    const data = baseSave({
      questList: [{ name: 'GainMoneyQuest', data: [10, 1], initial: 0, claimed: true, index: 7 }],
      statistics: { totalMoney: 5 },
    })
    expect(readBoardQuests(data)[0]).toMatchObject({ index: 0, claimed: true })
  })

  test('readers never mutate the save', () => {
    const data = baseSave({
      questList: [{ name: 'GainGemsQuest', data: [1, 1, 3], initial: 5, claimed: false, index: 0 }],
      questLines: [
        { state: 1, name: "Zero's Ambition", quest: 4, initial: 10479 },
        { state: 1, name: 'Some Future Line', quest: 0, initial: 1 },
      ],
    })
    const before = JSON.stringify(data)
    readBoardQuests(data)
    readQuestLines(data, TEST_STEPS)
    expect(JSON.stringify(data)).toBe(before)
  })

  test('claimed quest with regressed stat: progress null, not flagged', () => {
    const data = baseSave({
      questList: [{ name: 'GainMoneyQuest', data: [1000, 50], initial: 500, claimed: true, index: 0 }],
      statistics: { totalMoney: 100 },
    })
    const row = readBoardQuests(data)[0]
    expect(row.progress).toBeNull()
    expect(row.amount).toBeNull()
    expect(row.flagged).toBe(false)
  })

  test('missing save.quests.questList reads as empty', () => {
    const data = { player: {}, save: {} } as unknown as SaveData
    expect(readBoardQuests(data)).toEqual([])
  })
})

describe('repairBoardQuest', () => {
  test('resets initial to the live statistic on a flagged row', () => {
    const data = baseSave({
      questList: [{ name: 'GainMoneyQuest', data: [1000, 50], initial: 500, claimed: false, index: 0 }],
      statistics: { totalMoney: 100 },
    })
    repairBoardQuest(data, 0)
    const entry = (data.save as any).quests.questList[0]
    expect(entry.initial).toBe(100)
    expect(readBoardQuests(data)[0].progress).toBe(0)
  })

  test('no-ops on a non-flagged row', () => {
    const data = baseSave({
      questList: [{ name: 'GainMoneyQuest', data: [1000, 50], initial: 500, claimed: false, index: 0 }],
      statistics: { totalMoney: 900 },
    })
    repairBoardQuest(data, 0)
    expect((data.save as any).quests.questList[0].initial).toBe(500)
  })

  test('no-ops on a claimed row', () => {
    const data = baseSave({
      questList: [{ name: 'GainMoneyQuest', data: [1000, 50], initial: 500, claimed: true, index: 0 }],
      statistics: { totalMoney: 100 },
    })
    repairBoardQuest(data, 0)
    expect((data.save as any).quests.questList[0].initial).toBe(500)
  })

  test('no-ops on an out-of-range index', () => {
    const data = baseSave({ questList: [] })
    expect(() => repairBoardQuest(data, 0)).not.toThrow()
  })
})

const TEST_STEPS: QuestStepsData = {
  "Zero's Ambition": [
    { type: 'TalkToNPCQuest' },
    { type: 'TalkToNPCQuest' },
    { type: 'TalkToNPCQuest' },
    { type: 'TalkToNPCQuest' },
    { type: 'CustomQuest', itemKey: 'Purple_shard', amount: 10 },
  ],
  'Tutorial Quests': [{ type: 'TalkToNPCQuest' }],
}

describe('readQuestLines', () => {
  test('CustomQuest step: verifiable progress against player._itemList', () => {
    const data = baseSave({
      questLines: [{ state: 1, name: "Zero's Ambition", quest: 4, initial: 10479 }],
      itemList: { Purple_shard: 9517 },
    })
    const rows = readQuestLines(data, TEST_STEPS)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: "Zero's Ambition",
      state: 'started',
      step: 4,
      stepType: 'CustomQuest',
      amount: 10,
      progress: -962,
      flagged: true,
    })
  })

  test('decodes all four QuestLineState values', () => {
    const data = baseSave({
      questLines: [
        { state: 0, name: 'A', quest: 0, initial: null },
        { state: 1, name: 'Tutorial Quests', quest: 0, initial: false },
        { state: 2, name: 'C', quest: 0, initial: null },
        { state: 3, name: 'D', quest: 0, initial: null },
      ],
    })
    const rows = readQuestLines(data, TEST_STEPS)
    expect(rows.map((r) => r.state)).toEqual(['inactive', 'started', 'ended', 'suspended'])
  })

  test('non-CustomQuest step type: progress null, no crash', () => {
    const data = baseSave({
      questLines: [{ state: 1, name: 'Tutorial Quests', quest: 0, initial: false }],
    })
    const row = readQuestLines(data, TEST_STEPS)[0]
    expect(row.stepType).toBe('TalkToNPCQuest')
    expect(row.progress).toBeNull()
    expect(row.flagged).toBe(false)
  })

  test('MultipleQuestsQuest-shaped array initial: progress null, no crash', () => {
    const data = baseSave({
      questLines: [{ state: 1, name: "Zero's Ambition", quest: 4, initial: [true, 3] }],
      itemList: { Purple_shard: 9517 },
    })
    const row = readQuestLines(data, TEST_STEPS)[0]
    expect(row.progress).toBeNull()
    expect(row.flagged).toBe(false)
  })

  test('questline name absent from step metadata: progress null, no crash', () => {
    const data = baseSave({
      questLines: [{ state: 1, name: 'Some Future Line', quest: 0, initial: 5 }],
    })
    const row = readQuestLines(data, TEST_STEPS)[0]
    expect(row.stepType).toBeNull()
    expect(row.progress).toBeNull()
  })
})

describe('readQuestLines gating', () => {
  const endedLine = (state: number) =>
    baseSave({
      questLines: [{ state, name: "Zero's Ambition", quest: 4, initial: 10479 }],
      itemList: { Purple_shard: 9517 },
    })

  test.each([[0, 'inactive'], [2, 'ended']])('state %i (%s): progress null, not flagged', (state) => {
    const row = readQuestLines(endedLine(state), TEST_STEPS)[0]
    expect(row.progress).toBeNull()
    expect(row.flagged).toBe(false)
    expect(row.amount).toBeNull()
  })

  test('suspended line is still verified and flagged', () => {
    const row = readQuestLines(endedLine(3), TEST_STEPS)[0]
    expect(row.state).toBe('suspended')
    expect(row.progress).toBe(-962)
    expect(row.flagged).toBe(true)
  })

  test('out-of-range step index: stepType null, progress null, not flagged', () => {
    const data = baseSave({ questLines: [{ state: 1, name: "Zero's Ambition", quest: 5, initial: 1 }] })
    const row = readQuestLines(data, TEST_STEPS)[0]
    expect(row.stepType).toBeNull()
    expect(row.progress).toBeNull()
    expect(row.flagged).toBe(false)
  })
})

describe('repairQuestLine', () => {
  test('no-ops on an ended line even with a stale initial', () => {
    const data = baseSave({
      questLines: [{ state: 2, name: "Zero's Ambition", quest: 4, initial: 10479 }],
      itemList: { Purple_shard: 9517 },
    })
    repairQuestLine(data, "Zero's Ambition", TEST_STEPS)
    expect((data.save as any).quests.questLines[0].initial).toBe(10479)
  })

  test("fixes the exact Zero's Ambition / Purple Shards regression case", () => {
    const data = baseSave({
      questLines: [{ state: 1, name: "Zero's Ambition", quest: 4, initial: 10479 }],
      itemList: { Purple_shard: 9517 },
    })
    repairQuestLine(data, "Zero's Ambition", TEST_STEPS)
    const entry = (data.save as any).quests.questLines[0]
    expect(entry.initial).toBe(9517)
    expect(readQuestLines(data, TEST_STEPS)[0].progress).toBe(0)
    expect(readQuestLines(data, TEST_STEPS)[0].flagged).toBe(false)
  })

  test('no-ops on a non-flagged line', () => {
    const data = baseSave({
      questLines: [{ state: 1, name: "Zero's Ambition", quest: 4, initial: 9000 }],
      itemList: { Purple_shard: 9517 },
    })
    repairQuestLine(data, "Zero's Ambition", TEST_STEPS)
    expect((data.save as any).quests.questLines[0].initial).toBe(9000)
  })

  test('no-ops when the name is not found', () => {
    const data = baseSave({ questLines: [] })
    expect(() => repairQuestLine(data, 'Nonexistent', TEST_STEPS)).not.toThrow()
  })
})

describe('real generated data/quest-steps.json', () => {
  test("Zero's Ambition step 4 matches the diagnosed bug shape", () => {
    const real = realQuestStepsJson as unknown as QuestStepsData
    expect(real["Zero's Ambition"][4]).toEqual({
      type: 'CustomQuest',
      itemKey: 'Purple_shard',
      amount: 10,
    })
  })
})
