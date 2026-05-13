<script lang="ts">
  // Top-level shell. TopBar handles browse + save + status. Below it,
  // the active tab. Right now only Currencies & Multipliers exists;
  // additional tabs (Eggs, Shards, Berries, Caught, Pokédex) land in
  // subsequent PRs and will replace the single-tab section with a
  // notebook then.
  import TopBar from './components/TopBar.svelte'
  import CurrenciesTab from './tabs/CurrenciesTab.svelte'
</script>

<main>
  <header>
    <h1>PokeClicker Save Editor — Browser</h1>
    <p class="tagline">
      Your save never leaves this tab — everything happens client-side.
    </p>
  </header>

  <TopBar />

  <CurrenciesTab />

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
    margin: 1.5rem auto;
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
    margin: 0 0 1rem;
    color: #666;
    font-size: 0.95em;
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
