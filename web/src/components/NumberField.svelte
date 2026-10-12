<script lang="ts">
  // Labeled text input that parses to a number on commit (blur or Enter)
  // and reports through the `onCommit` callback. The text-input mode (not
  // type="number") lets the user paste "1,000,000" or "1e6".
  //
  // Accepted (see lib/numberInput.ts): non-negative decimal literals with an
  // optional fraction/exponent ("42", "1.5", "1e6", "2.5E3"), commas and
  // surrounding spaces ignored, blank = 0. Anything else ("5k", "12abc",
  // "-1", "0x10") is rejected: the text snaps back and nothing is written.
  // Integer fields also reject fractions ("1.5") rather than truncating.
  // onCommit fires only when the parsed value differs from `value`, so
  // tabbing through a field never marks the save dirty or rewrites it.
  // After onCommit the text resyncs from `value`: a parent that refuses the
  // number (its lib helper threw) leaves `value` unchanged, so the field
  // snaps back instead of showing a value the save doesn't hold.
  //
  // Local `text` state keeps the user's in-flight edits independent from
  // the source `value` until commit, which is what makes Reset work without
  // jankily snapping the cursor mid-typing.

  import { tick } from 'svelte'
  import { parseNumberInput } from '../lib/numberInput'

  type Props = {
    label: string
    value: number
    onCommit: (next: number) => void
    onReset?: () => void
    resetLabel?: string
    /** true → whole numbers only (default for currencies); false → any
     *  non-negative decimal (multipliers, form ids like 306.01) */
    integer?: boolean
    /** Helper text shown to the right of the input. */
    suffix?: string
    /** Greys out the row. */
    disabled?: boolean
    /** CSS length for the label column. Defaults to 14rem (room for the
     *  longest Currencies-tab label). Pass a smaller value inside narrow
     *  containers like dialogs. */
    labelWidth?: string
  }

  let {
    label,
    value,
    onCommit,
    onReset,
    resetLabel = 'Reset',
    integer = true,
    suffix,
    disabled = false,
    labelWidth = '14rem',
  }: Props = $props()

  // Mirror `value` into a local string the input is bound to. The effect
  // runs on mount and whenever `value`/`integer` change (parent or Reset),
  // not when the user edits `text` (writes to `text` aren't tracked here).
  let text = $state('')
  $effect(() => {
    text = formatValue(value, integer)
  })

  // Display only: an unchanged blur no longer commits, so the truncation in
  // integer mode can't write back into the save.
  function formatValue(v: number, isInt: boolean): string {
    if (!Number.isFinite(v)) return ''
    if (isInt) return String(Math.trunc(v))
    return String(v)
  }

  async function commit(): Promise<void> {
    const n = parseNumberInput(text, { integer })
    // Rejected input, or nothing changed: resync the text ("05" -> "5",
    // garbage -> the current value) and leave the save alone.
    if (n === null || n === value) {
      text = formatValue(value, integer)
      return
    }
    try {
      onCommit(n)
    } catch (e) {
      // Parents surface their own errors; one that escapes is a bug, so log
      // it rather than leave an unhandled rejection — and still resync.
      console.error(e)
    }
    // Let an accepting parent's new `value` arrive, then show whatever the
    // save now holds (a no-op when it accepted: the effect already did it).
    await tick()
    text = formatValue(value, integer)
  }

  function onKeyDown(evt: KeyboardEvent): void {
    if (evt.key === 'Enter') {
      ;(evt.target as HTMLInputElement).blur()
    } else if (evt.key === 'Escape') {
      text = formatValue(value, integer)
      ;(evt.target as HTMLInputElement).blur()
    }
  }
</script>

<div class="row" class:disabled style="--field-label-width: {labelWidth}">
  <label>
    <span class="label">{label}</span>
    <input
      type="text"
      inputmode={integer ? 'numeric' : 'decimal'}
      bind:value={text}
      onblur={commit}
      onkeydown={onKeyDown}
      {disabled}
    />
    {#if suffix}<span class="suffix">{suffix}</span>{/if}
  </label>
  {#if onReset}
    <button type="button" onclick={onReset} {disabled}>{resetLabel}</button>
  {/if}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
  }
  .row.disabled {
    opacity: 0.5;
  }
  label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }
  .label {
    flex: 0 0 var(--field-label-width, 14rem);
    color: var(--text);
  }
  input {
    flex: 0 0 9rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
    text-align: right;
  }
  input:focus {
    outline: 2px solid var(--focus-ring);
    outline-offset: -1px;
  }
  .suffix {
    color: var(--text-muted);
    font-size: 0.9em;
  }
  button {
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font: inherit;
    font-size: 0.85em;
  }
  button:hover:not(:disabled) {
    border-color: var(--text-muted);
  }
  button:disabled {
    cursor: not-allowed;
  }
</style>
