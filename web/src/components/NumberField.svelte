<script lang="ts">
  // Labeled text input that parses to a number on commit (blur or Enter)
  // and reports through the `onCommit` callback. The text-input mode (not
  // type="number") lets the user paste "1,000,000" or "1e6"; we clean it
  // up on commit.
  //
  // Local `text` state keeps the user's in-flight edits independent from
  // the source `value` until commit, which is what makes Reset work without
  // jankily snapping the cursor mid-typing.

  type Props = {
    label: string
    value: number
    onCommit: (next: number) => void
    onReset?: () => void
    resetLabel?: string
    /** false → parseFloat; true → parseInt (default for currencies) */
    integer?: boolean
    /** Helper text shown to the right of the input. */
    suffix?: string
    /** Greys out the row. */
    disabled?: boolean
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
  }: Props = $props()

  // Mirror `value` into a local string the input is bound to. The effect
  // runs on mount and whenever `value`/`integer` change (parent or Reset),
  // not when the user edits `text` (writes to `text` aren't tracked here).
  let text = $state('')
  $effect(() => {
    text = formatValue(value, integer)
  })

  function formatValue(v: number, isInt: boolean): string {
    if (!Number.isFinite(v)) return ''
    if (isInt) return String(Math.trunc(v))
    // Drop trailing ".0" so 1.0 doesn't look noisier than "1".
    return Number.isInteger(v) ? String(v) : String(v)
  }

  function commit(): void {
    const cleaned = text.replace(/,/g, '').trim()
    if (cleaned === '') {
      // Treat blank as zero — matches the desktop editor's parse_int/float.
      onCommit(0)
      return
    }
    const n = integer ? Number.parseInt(cleaned, 10) : Number.parseFloat(cleaned)
    if (Number.isFinite(n) && n >= 0) {
      onCommit(n)
    } else {
      // Reject silently — snap the text back to the source value.
      text = formatValue(value, integer)
    }
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

<div class="row" class:disabled>
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
    flex: 0 0 14rem;
    color: #444;
  }
  input {
    flex: 0 0 9rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font: inherit;
    text-align: right;
  }
  input:focus {
    outline: 2px solid #2563eb;
    outline-offset: -1px;
  }
  .suffix {
    color: #888;
    font-size: 0.9em;
  }
  button {
    padding: 0.25rem 0.6rem;
    border: 1px solid #ccc;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font: inherit;
    font-size: 0.85em;
  }
  button:hover:not(:disabled) {
    background: #f0f0f0;
  }
  button:disabled {
    cursor: not-allowed;
  }
</style>
