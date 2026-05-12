<script lang="ts">
  // Skeleton shell for the browser-based companion to the desktop editor.
  // First milestone: prove the toolchain works end-to-end — load a save
  // entirely client-side and show enough decoded state to confirm we read
  // it correctly. Subsequent PRs add the tabs from the desktop editor one
  // at a time. The save never leaves this tab.
  import { decodeBytes } from './lib/save'

  type SaveSummary = {
    fileName: string
    bytes: number
    townName: string
    region: number
    caughtCount: number
    money: number
  }

  let status = $state(
    'Drop a PokeClicker save export (.txt) here or click to browse.',
  )
  let summary: SaveSummary | null = $state(null)
  let errorDetail = $state('')

  async function handleFile(file: File): Promise<void> {
    summary = null
    errorDetail = ''
    try {
      const text = await file.text()
      const data = decodeBytes(text)
      const player = (data.player ?? {}) as Record<string, unknown>
      const save = (data.save ?? {}) as Record<string, unknown>
      const party = ((save.party as Record<string, unknown>)?.caughtPokemon ??
        []) as unknown[]
      const wallet = (save.wallet as Record<string, unknown>)?.currencies as
        | number[]
        | undefined
      summary = {
        fileName: file.name,
        bytes: text.length,
        townName: (player._townName as string) ?? '?',
        region: (player._region as number) ?? -1,
        caughtCount: party.length,
        money: wallet?.[0] ?? 0,
      }
      status = `loaded ${file.name}`
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      status = `failed to decode ${file.name}`
      errorDetail = msg
    }
  }

  function onPick(evt: Event): void {
    const input = evt.target as HTMLInputElement
    if (input.files?.[0]) void handleFile(input.files[0])
  }

  function onDrop(evt: DragEvent): void {
    evt.preventDefault()
    const file = evt.dataTransfer?.files?.[0]
    if (file) void handleFile(file)
  }

  function onDragOver(evt: DragEvent): void {
    evt.preventDefault()
  }
</script>

<main>
  <header>
    <h1>PokeClicker Save Editor — Browser</h1>
    <p class="tagline">
      Work in progress. Your save never leaves this tab —
      everything happens client-side.
    </p>
  </header>

  <section
    class="drop"
    ondrop={onDrop}
    ondragover={onDragOver}
    aria-label="Save file drop zone"
  >
    <label>
      <input type="file" accept=".txt" onchange={onPick} />
      <span class="button">Pick a save…</span>
    </label>
    <p class="status">{status}</p>
    {#if errorDetail}
      <pre class="error">{errorDetail}</pre>
    {/if}
  </section>

  {#if summary}
    <section class="summary">
      <h2>Decoded</h2>
      <dl>
        <dt>File</dt><dd>{summary.fileName} ({summary.bytes} bytes)</dd>
        <dt>Town</dt><dd>{summary.townName}</dd>
        <dt>Region id</dt><dd>{summary.region}</dd>
        <dt>Caught pokémon</dt><dd>{summary.caughtCount}</dd>
        <dt>PokéDollars</dt><dd>{summary.money}</dd>
      </dl>
    </section>
  {/if}

  <footer>
    <p>
      Source: <a
        href="https://github.com/daclink/pokeclicker-save-editor"
        target="_blank"
        rel="noreferrer">github.com/daclink/pokeclicker-save-editor</a
      >. Use at your own risk.
    </p>
  </footer>
</main>

<style>
  main {
    max-width: 720px;
    margin: 2rem auto;
    padding: 0 1rem;
    font-family:
      system-ui,
      -apple-system,
      'Segoe UI',
      Roboto,
      Helvetica,
      Arial,
      sans-serif;
    color: #222;
  }
  header h1 {
    margin: 0 0 0.25rem;
    font-size: 1.5rem;
  }
  .tagline {
    margin: 0 0 1.5rem;
    color: #666;
  }
  .drop {
    border: 2px dashed #888;
    border-radius: 8px;
    padding: 1.5rem;
    text-align: center;
    background: #fafafa;
  }
  .drop input[type='file'] {
    display: none;
  }
  .button {
    display: inline-block;
    padding: 0.5rem 1rem;
    background: #2563eb;
    color: white;
    border-radius: 4px;
    cursor: pointer;
  }
  .button:hover {
    background: #1d4ed8;
  }
  .status {
    margin: 1rem 0 0;
    color: #444;
  }
  .error {
    margin: 0.75rem 0 0;
    padding: 0.5rem;
    background: #fee;
    color: #900;
    text-align: left;
    white-space: pre-wrap;
    border-radius: 4px;
    font-size: 0.85em;
  }
  .summary {
    margin-top: 2rem;
    padding: 1rem 1.5rem;
    background: #f5f5f5;
    border-radius: 8px;
  }
  .summary h2 {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    margin: 0;
  }
  dt {
    color: #666;
  }
  dd {
    margin: 0;
  }
  footer {
    margin-top: 3rem;
    color: #888;
    font-size: 0.85em;
    text-align: center;
  }
  footer a {
    color: inherit;
  }
</style>
