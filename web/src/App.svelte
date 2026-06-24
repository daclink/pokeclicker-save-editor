<script lang="ts">
  // App shell: sidebar nav + main column (save bar, active section, footer).
  // Sections render conditionally — unmounting on switch keeps per-tab state
  // (open dialogs, drafts) from leaking across.
  import Sidebar from './components/Sidebar.svelte'
  import SaveBar from './components/SaveBar.svelte'
  import EmptyState from './components/EmptyState.svelte'
  import { store } from './lib/store.svelte'
  import { SECTIONS, type SectionId } from './lib/sections'

  import CurrenciesTab from './tabs/CurrenciesTab.svelte'
  import EggsTab from './tabs/EggsTab.svelte'
  import ShardsTab from './tabs/ShardsTab.svelte'
  import GemsTab from './tabs/GemsTab.svelte'
  import FlutesTab from './tabs/FlutesTab.svelte'
  import BerriesTab from './tabs/BerriesTab.svelte'
  import CaughtTab from './tabs/CaughtTab.svelte'
  import PokedexTab from './tabs/PokedexTab.svelte'

  let active = $state<SectionId>(SECTIONS[0].id)
</script>

<div class="app">
  <Sidebar {active} onSelect={(id) => (active = id)} />

  <main>
    <SaveBar />

    {#if store.data === null}
      <EmptyState />
    {:else if active === 'currencies'}
      <CurrenciesTab />
    {:else if active === 'eggs'}
      <EggsTab />
    {:else if active === 'shards'}
      <ShardsTab />
    {:else if active === 'gems'}
      <GemsTab />
    {:else if active === 'flutes'}
      <FlutesTab />
    {:else if active === 'berries'}
      <BerriesTab />
    {:else if active === 'caught'}
      <CaughtTab />
    {:else if active === 'pokedex'}
      <PokedexTab />
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
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: minmax(180px, 230px) 1fr;
    min-height: 100vh;
  }
  main {
    padding: var(--space-5);
    max-width: 860px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  footer {
    margin-top: auto;
    padding-top: var(--space-5);
    color: var(--text-muted);
    font-size: 0.8rem;
    text-align: center;
  }
  footer a {
    color: inherit;
  }

  @media (max-width: 720px) {
    .app {
      grid-template-columns: 1fr;
    }
    main {
      padding: var(--space-5) var(--space-4);
      padding-top: var(--space-6);
    }
  }
</style>
