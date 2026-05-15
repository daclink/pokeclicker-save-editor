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
    border: 1px solid #ccc;
    border-radius: 8px;
    padding: 1.25rem;
    width: min(24rem, 92vw);
    background: white;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.4);
  }
  h3 {
    margin: 0 0 0.5rem;
  }
  .prompt {
    margin: 0 0 0.75rem;
    color: #444;
    font-size: 0.95em;
  }
  input {
    width: 100%;
    padding: 0.35rem 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font: inherit;
    text-align: right;
  }
  input:focus {
    outline: 2px solid #2563eb;
    outline-offset: -1px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .actions button {
    padding: 0.4rem 0.9rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    font: inherit;
  }
  .actions .primary {
    background: #2563eb;
    color: white;
    border-color: #2563eb;
  }
  .actions .primary:hover {
    background: #1d4ed8;
  }
</style>
