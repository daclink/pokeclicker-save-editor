<script lang="ts">
  // Vertical nav rail. Brand logo on top, one row per section. Below the
  // mobile breakpoint it collapses behind a hamburger into an overlay drawer.
  import Logo from './Logo.svelte'
  import { SECTIONS, type SectionId } from '../lib/sections'

  let {
    active,
    onSelect,
  }: { active: SectionId; onSelect: (id: SectionId) => void } = $props()

  let open = $state(false)

  function pick(id: SectionId): void {
    onSelect(id)
    open = false
  }
</script>

<button
  class="hamburger"
  type="button"
  aria-label="Toggle navigation"
  aria-expanded={open}
  onclick={() => (open = !open)}
>
  ☰
</button>

<nav class="sidebar" class:open aria-label="Editor sections">
  <div class="brand">
    <Logo size={26} />
    <span class="wordmark">PokéSave <span class="dim">Editor</span></span>
  </div>
  <ul>
    {#each SECTIONS as s (s.id)}
      <li>
        <button
          type="button"
          class="item"
          class:active={active === s.id}
          aria-current={active === s.id ? 'page' : undefined}
          onclick={() => pick(s.id)}
        >
          <span class="icon" aria-hidden="true">{s.icon}</span>
          <span class="text">{s.label}</span>
        </button>
      </li>
    {/each}
  </ul>
</nav>

{#if open}
  <button
    class="scrim"
    type="button"
    aria-label="Close navigation"
    onclick={() => (open = false)}
  ></button>
{/if}

<style>
  .sidebar {
    background: var(--surface);
    border-right: 1px solid var(--border);
    padding: var(--space-4) var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-2);
  }
  .wordmark {
    font-weight: 700;
    color: var(--text);
    font-size: 0.95rem;
  }
  .dim {
    color: var(--text-muted);
    font-weight: 500;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    border-left: 2px solid transparent;
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
    text-align: left;
  }
  .item:hover:not(.active) {
    background: var(--surface-2);
    color: var(--text);
  }
  .item.active {
    background: var(--surface-2);
    color: var(--text);
    border-left-color: var(--brand);
    font-weight: 600;
  }
  .icon {
    width: 1.2em;
    text-align: center;
  }
  .hamburger {
    display: none;
    position: fixed;
    top: var(--space-3);
    left: var(--space-3);
    z-index: 30;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
    font-size: 1rem;
    cursor: pointer;
  }
  .scrim {
    display: none;
  }

  @media (max-width: 720px) {
    .hamburger {
      display: block;
    }
    .sidebar {
      position: fixed;
      inset: 0 auto 0 0;
      z-index: 25;
      transform: translateX(-100%);
      transition: transform 0.18s ease;
      box-shadow: var(--shadow);
    }
    .sidebar.open {
      transform: translateX(0);
    }
    .scrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 20;
      border: none;
      background: rgba(0, 0, 0, 0.5);
      cursor: pointer;
    }
  }
</style>
