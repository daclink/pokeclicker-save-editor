<script lang="ts">
  // One-question modal: prompt for a single non-negative integer. Uses the
  // native <dialog> element so focus trap + Escape-to-close come for free.
  //
  // Open by calling `open(...)` with a title/prompt + the current value;
  // the returned promise resolves with the user's number on OK or null on
  // Cancel. Caller does whatever with the value (write it to the save,
  // apply to a selection, etc.).

  type Props = {
    /** Wired via `bind:this` so the parent can call `open()`. */
    ref?: { open: (title: string, prompt: string, defaultValue?: number) => Promise<number | null> }
  }

  let { ref = $bindable() }: Props = $props()

  let dialogEl: HTMLDialogElement | undefined = $state()
  let title = $state('')
  let prompt = $state('')
  let text = $state('0')
  let inputEl: HTMLInputElement | undefined = $state()
  let resolver: ((v: number | null) => void) | null = null

  function open(
    nextTitle: string,
    nextPrompt: string,
    defaultValue = 0,
  ): Promise<number | null> {
    title = nextTitle
    prompt = nextPrompt
    text = String(defaultValue)
    return new Promise((resolve) => {
      resolver = resolve
      dialogEl?.showModal()
      // Pre-select the text so the user can just type a new value.
      queueMicrotask(() => {
        inputEl?.focus()
        inputEl?.select()
      })
    })
  }

  // Expose `open` to the parent through the bindable ref.
  ref = { open }

  function commit(): void {
    const cleaned = text.replace(/,/g, '').trim()
    if (cleaned === '') {
      resolver?.(0)
      resolver = null
      dialogEl?.close()
      return
    }
    const n = Number.parseInt(cleaned, 10)
    if (!Number.isFinite(n) || n < 0) {
      // Snap to 0 on garbage and let the user try again.
      text = '0'
      return
    }
    resolver?.(n)
    resolver = null
    dialogEl?.close()
  }

  function cancel(): void {
    resolver?.(null)
    resolver = null
    dialogEl?.close()
  }

  function onKey(evt: KeyboardEvent): void {
    if (evt.key === 'Enter') {
      evt.preventDefault()
      commit()
    } else if (evt.key === 'Escape') {
      // Native <dialog> already closes on Escape — make sure we resolve.
      cancel()
    }
  }
</script>

<dialog bind:this={dialogEl} aria-labelledby="simple-int-title" onclose={cancel}>
  <h3 id="simple-int-title">{title}</h3>
  <p class="prompt">{prompt}</p>
  <input
    bind:this={inputEl}
    type="text"
    inputmode="numeric"
    bind:value={text}
    onkeydown={onKey}
  />
  <div class="actions">
    <button type="button" onclick={cancel}>Cancel</button>
    <button type="button" class="primary" onclick={commit}>OK</button>
  </div>
</dialog>

<style>
  dialog {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-5);
    width: min(24rem, 92vw);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  dialog::backdrop {
    background: var(--backdrop);
  }
  h3 {
    margin: 0 0 var(--space-2);
  }
  .prompt {
    margin: 0 0 var(--space-3);
    color: var(--text-muted);
    font-size: 0.95em;
  }
  input {
    width: 100%;
    padding: 0.35rem var(--space-2);
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
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
  .actions button {
    padding: 0.4rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    font: inherit;
  }
  .actions button:hover {
    border-color: var(--text-muted);
  }
  .actions .primary {
    background: var(--brand);
    color: var(--brand-contrast);
    border-color: var(--brand);
  }
  .actions .primary:hover {
    filter: brightness(1.1);
  }
</style>
