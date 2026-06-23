<script lang="ts">
  // First-run front door, shown when no save is loaded. Leads with the
  // privacy promise — for a save editor, that IS the pitch.
  import Logo from './Logo.svelte'
  import { store } from '../lib/store.svelte'

  function onPick(evt: Event): void {
    const input = evt.target as HTMLInputElement
    if (input.files?.[0]) void store.load(input.files[0])
    input.value = ''
  }
</script>

<div class="empty">
  <Logo size={64} />
  <h1>PokéSave Editor</h1>
  <p class="lead">Edit your PokeClicker save — Pokédollars, eggs, shards, gems, flutes, berries, and your caught Pokémon.</p>
  <label class="cta">
    <input type="file" accept=".txt" onchange={onPick} />
    Browse your save…
  </label>
  <p class="privacy">
    🔒 Your save never leaves this tab — everything happens in your browser.
  </p>
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-3);
    padding: var(--space-6) var(--space-4);
    max-width: 30rem;
    margin: 0 auto;
  }
  .empty h1 {
    margin: var(--space-2) 0 0;
    font-size: 1.6rem;
    color: var(--text);
  }
  .lead {
    margin: 0;
    color: var(--text-muted);
  }
  .cta {
    margin-top: var(--space-2);
    padding: var(--space-3) var(--space-5);
    background: var(--brand);
    color: var(--brand-contrast);
    border-radius: var(--radius);
    font-weight: 700;
    cursor: pointer;
  }
  .cta input[type='file'] {
    display: none;
  }
  .privacy {
    margin-top: var(--space-2);
    color: var(--text-muted);
    font-size: 0.85rem;
  }
</style>
