<script lang="ts">
  // Title + optional description at the top of a section.
  let { title, description }: { title: string; description?: string } =
    $props()
</script>

<header class="section-header">
  <h2>{title}</h2>
  {#if description}<p>{description}</p>{/if}
</header>

<style>
  .section-header {
    margin-bottom: var(--space-4);
  }
  .section-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text);
  }
  .section-header p {
    margin: var(--space-1) 0 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
</style>
