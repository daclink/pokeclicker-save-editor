<script lang="ts">
  // Top-level shell: top bar + tab notebook + active tab's component.
  // Tabs render conditionally — unmount on switch — which keeps state
  // (e.g. open dialogs) from leaking across.
  import TopBar from './components/TopBar.svelte'
  import TabsBar, { type Tab } from './components/TabsBar.svelte'
  import CurrenciesTab from './tabs/CurrenciesTab.svelte'
  import EggsTab from './tabs/EggsTab.svelte'
  import ShardsTab from './tabs/ShardsTab.svelte'

  const tabs: readonly Tab[] = [
    { id: 'currencies', label: 'Currencies & Multipliers' },
    { id: 'eggs', label: 'Eggs' },
    { id: 'shards', label: 'Shards' },
  ]

  let active = $state(tabs[0].id)
</script>

<main>
  <header>
    <h1>PokeClicker Save Editor — Browser</h1>
    <p class="tagline">
      Your save never leaves this tab — everything happens client-side.
    </p>
  </header>

  <TopBar />

  <TabsBar {tabs} {active} onSelect={(id) => (active = id)} />

  {#if active === 'currencies'}
    <CurrenciesTab />
  {:else if active === 'eggs'}
    <EggsTab />
  {:else if active === 'shards'}
    <ShardsTab />
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
    max-width: 760px;
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
