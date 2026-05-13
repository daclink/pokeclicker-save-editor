<script lang="ts">
  // Currencies & Multipliers tab — first port of a desktop PCEdit tab.
  //
  // Reads `save.wallet.currencies[0..4]` and `player._itemMultipliers`,
  // exposes editable rows, and writes back to the shared store on every
  // commit (which flags the save as dirty so the user sees the unsaved
  // marker in the top bar). The "drop multipliers at exactly 1.0" rule
  // is enforced inside `writeMultipliers` — same as the desktop editor.

  import { store } from '../lib/store.svelte'
  import {
    MULTIPLIERS,
    readCurrencies,
    readMultipliers,
    writeCurrencies,
    writeMultipliers,
    type Currencies,
    type CurrencyKey,
    type MultiplierKey,
    type Multipliers,
  } from '../lib/currencies'
  import NumberField from '../components/NumberField.svelte'

  // Derive the editable snapshot from store.data. Re-derives whenever the
  // user loads a new save (store.data identity changes).
  let currencies = $derived.by<Currencies>(() => {
    if (!store.data) {
      return { money: 0, tokens: 0, quest: 0, diamonds: 0, farm: 0 }
    }
    return readCurrencies(store.data)
  })

  let multipliers = $derived.by<Multipliers>(() => {
    if (!store.data) {
      return {
        'Protein|money': 1.0,
        'Calcium|money': 1.0,
        'Carbos|money': 1.0,
        'Masterball|farmPoint': 1.0,
      }
    }
    return readMultipliers(store.data)
  })

  function setCurrency(key: CurrencyKey, next: number): void {
    if (!store.data) return
    const edits: Currencies = { ...currencies, [key]: next }
    try {
      writeCurrencies(store.data, edits)
      store.markDirty()
    } catch (e) {
      // RangeError from writeCurrencies — surface it through the status bar.
      store.errorDetail = e instanceof Error ? e.message : String(e)
      store.status = 'invalid value rejected'
    }
  }

  function setMultiplier(key: MultiplierKey, next: number): void {
    if (!store.data) return
    const edits: Multipliers = { ...multipliers, [key]: next }
    try {
      writeMultipliers(store.data, edits)
      store.markDirty()
    } catch (e) {
      store.errorDetail = e instanceof Error ? e.message : String(e)
      store.status = 'invalid value rejected'
    }
  }

  function resetMultiplier(key: MultiplierKey): void {
    setMultiplier(key, 1.0)
  }

  function resetAllVitamins(): void {
    if (!store.data) return
    const edits: Multipliers = { ...multipliers }
    for (const { key, kind } of MULTIPLIERS) {
      if (kind === 'vitamin') edits[key] = 1.0
    }
    writeMultipliers(store.data, edits)
    store.markDirty()
  }

  const CURRENCY_ROWS: Array<{ key: CurrencyKey; label: string }> = [
    { key: 'money', label: 'PokéDollars' },
    { key: 'tokens', label: 'Dungeon Tokens' },
    { key: 'quest', label: 'Quest Points' },
    { key: 'diamonds', label: 'Diamonds' },
    { key: 'farm', label: 'Farm Points' },
  ]
</script>

{#if store.data === null}
  <p class="empty">Load a save with <strong>Browse…</strong> above to edit currencies and multipliers.</p>
{:else}
  <section class="block">
    <h2>Wallet <span class="hint">(save.wallet.currencies)</span></h2>
    {#each CURRENCY_ROWS as row (row.key)}
      <NumberField
        label={row.label}
        value={currencies[row.key]}
        onCommit={(n) => setCurrency(row.key, n)}
      />
    {/each}
  </section>

  <section class="block">
    <h2>Multipliers <span class="hint">(player._itemMultipliers)</span></h2>
    <p class="note">
      Higher = costs more next purchase. Reset to 1.0 to restore base price.
      A row at exactly 1.0 is dropped from the save instead of being written.
    </p>
    {#each MULTIPLIERS as row (row.key)}
      <NumberField
        label={row.label}
        value={multipliers[row.key]}
        integer={false}
        onCommit={(n) => setMultiplier(row.key, n)}
        onReset={() => resetMultiplier(row.key)}
        resetLabel="Reset to 1.0"
      />
    {/each}
    <div class="actions">
      <button type="button" onclick={resetAllVitamins}>
        Reset all vitamins to 1.0
      </button>
    </div>
  </section>
{/if}

<style>
  .empty {
    color: #666;
    padding: 1rem;
    background: #f5f5f5;
    border-radius: 6px;
  }
  .block {
    margin-bottom: 1.5rem;
    padding: 1rem 1.25rem;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    background: #fafafa;
  }
  .block h2 {
    margin: 0 0 0.75rem;
    font-size: 1.05rem;
  }
  .hint {
    color: #999;
    font-weight: normal;
    font-family: ui-monospace, monospace;
    font-size: 0.85em;
  }
  .note {
    margin: 0 0 0.75rem;
    color: #666;
    font-size: 0.9em;
  }
  .actions {
    margin-top: 0.75rem;
  }
  .actions button {
    padding: 0.4rem 0.9rem;
    border: 1px solid #ccc;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font: inherit;
    font-size: 0.9em;
  }
  .actions button:hover {
    background: #f0f0f0;
  }
</style>
