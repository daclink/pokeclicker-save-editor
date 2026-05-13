<script lang="ts">
  // Top-of-content tab notebook. Plain button row + parent-controlled
  // active state — no routing, no transitions, no kept-alive panels.
  // The parent renders the active tab's component conditionally.

  export type Tab = { id: string; label: string }

  type Props = {
    tabs: readonly Tab[]
    active: string
    onSelect: (id: string) => void
  }

  let { tabs, active, onSelect }: Props = $props()
</script>

<nav class="tabs" aria-label="Editor tabs">
  {#each tabs as t (t.id)}
    <button
      type="button"
      class="tab"
      class:active={active === t.id}
      aria-current={active === t.id ? 'page' : undefined}
      onclick={() => onSelect(t.id)}
    >
      {t.label}
    </button>
  {/each}
</nav>

<style>
  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 2px solid #e5e5e5;
    margin-bottom: 1rem;
    overflow-x: auto;
  }
  .tab {
    padding: 0.5rem 1rem;
    border: none;
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 0.95em;
    color: #666;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    white-space: nowrap;
  }
  .tab:hover:not(.active) {
    color: #222;
    background: #f5f5f5;
  }
  .tab.active {
    color: #2563eb;
    border-bottom-color: #2563eb;
    font-weight: 500;
  }
</style>
