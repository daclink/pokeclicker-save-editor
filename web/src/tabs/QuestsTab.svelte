<script lang="ts">
  // Quests tab — read-only examiner for both quest systems (save.quests),
  // with a guarded one-click repair for the "stale initial" bug class: a
  // save edit that lowers a tracked value (e.g. a shard count) after a
  // quest snapshotted it produces permanently negative, stuck progress.
  // Repair mirrors what PokeClicker's own live-decrease compensation does
  // (see lib/quests.ts) and is only ever offered on rows this tool can
  // actually verify — everything else reads "can't verify", never a guess.

  import { store } from '../lib/store.svelte'
  import {
    readBoardQuests,
    readQuestLines,
    repairBoardQuest,
    repairQuestLine,
    type BoardQuestRow,
    type QuestLineRow,
  } from '../lib/quests'

  let tick = $state(0)
  let showAllLines = $state(false)

  let boardQuests = $derived.by(() => {
    void tick
    return store.data ? readBoardQuests(store.data) : []
  })

  let questLines = $derived.by(() => {
    void tick
    return store.data ? readQuestLines(store.data) : []
  })

  let visibleLines = $derived(
    showAllLines
      ? questLines
      : questLines.filter((q) => q.state === 'started' || q.state === 'suspended'),
  )

  function refreshAfter(fn: () => void): void {
    if (!store.data) return
    fn()
    store.markDirty()
    tick++
  }

  function repairBoard(row: BoardQuestRow): void {
    refreshAfter(() => repairBoardQuest(store.data!, row.index))
  }

  function repairLine(row: QuestLineRow): void {
    refreshAfter(() => repairQuestLine(store.data!, row.name))
  }

  const NO_PROGRESS = '—'
  const CANT_VERIFY = "can't verify"

  function progressText(
    row: { progress: number | null; amount: number | null },
    finished = false,
  ): string {
    if (finished) return NO_PROGRESS
    if (row.progress === null || row.amount === null) return CANT_VERIFY
    return `${row.progress.toLocaleString('en-US')} / ${row.amount.toLocaleString('en-US')}`
  }
</script>

{#if store.data === null}
  <p class="empty">Load a save with <strong>Browse…</strong> above to examine quests.</p>
{:else}
  <section class="block">
    <h3>Board Quests</h3>
    <p class="note">
      The 10 rotating quests in <code>save.quests.questList</code>. Progress
      shows for the quest types this tool can verify against a live save
      value; everything else is shown as <em>unverifiable</em> rather than guessed.
    </p>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Claimed</th>
          <th>Progress</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each boardQuests as row (row.index)}
          <tr class:flagged={row.flagged}>
            <td>{row.name}</td>
            <td>{row.claimed ? 'Yes' : 'No'}</td>
            <td>{progressText(row, row.claimed)}</td>
            <td>
              {#if row.flagged}
                <button type="button" onclick={() => repairBoard(row)}>Repair</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section class="block">
    <div class="line-header">
      <h3>Quest Lines</h3>
      <label class="toggle">
        <input type="checkbox" bind:checked={showAllLines} />
        Show inactive / ended lines
      </label>
    </div>
    <p class="note">
      The story quest lines in <code>save.quests.questLines</code>. Only the
      currently active step of each line can be checked — earlier and later
      steps aren't tracked by the save.
    </p>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>State</th>
          <th>Step</th>
          <th>Progress</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each visibleLines as row (row.name)}
          <tr class:flagged={row.flagged}>
            <td>{row.name}</td>
            <td>{row.state}</td>
            <td>{row.step + 1}{row.stepType ? ` (${row.stepType})` : ''}</td>
            <td>{progressText(row, row.state === 'ended' || row.state === 'inactive')}</td>
            <td>
              {#if row.flagged}
                <button type="button" onclick={() => repairLine(row)}>Repair</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}

<style>
  .empty {
    color: var(--text-muted);
    padding: var(--space-4);
    background: var(--surface-2);
    border-radius: var(--radius);
  }
  .block {
    margin-bottom: var(--space-5);
    padding: var(--space-4) var(--space-5);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .block h3 {
    margin: 0 0 var(--space-2);
    font-size: 1rem;
    color: var(--text);
  }
  .line-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 0.85em;
    color: var(--text-muted);
  }
  .note {
    margin: 0 0 var(--space-3);
    color: var(--text-muted);
    font-size: 0.9em;
  }
  .note code {
    background: var(--surface-2);
    padding: 0 0.25rem;
    border-radius: 3px;
    font-size: 0.95em;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
  }
  th,
  td {
    text-align: left;
    padding: var(--space-2) var(--space-2);
    border-bottom: 1px solid var(--border);
    color: var(--text);
  }
  th {
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.85em;
  }
  tr.flagged td {
    color: var(--danger);
  }
  button {
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--brand);
    background: transparent;
    color: var(--brand);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font: inherit;
    font-size: 0.85em;
  }
  button:hover {
    background: var(--brand);
    color: var(--brand-contrast);
  }
</style>
