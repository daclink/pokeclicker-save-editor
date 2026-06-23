<script lang="ts">
  let { size = 24 }: { size?: number } = $props()
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 32 32"
  role="img"
  aria-label="PokéSave Editor logo"
  xmlns="http://www.w3.org/2000/svg"
>
  <!-- floppy body -->
  <path
    d="M5 3h18l4 4v22a0 0 0 0 1 0 0H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
    fill="#2f2a26"
    stroke="#f2ece3"
    stroke-width="1.5"
  />
  <!-- top shutter -->
  <rect x="9" y="3" width="12" height="7" rx="1" fill="#f2ece3" />
  <rect x="16" y="4" width="3" height="5" fill="#8a8178" />
  <!-- pokéball label -->
  <circle cx="16" cy="20" r="6.5" fill="#fff" stroke="#1a1a1a" stroke-width="1.2" />
  <path d="M9.7 20a6.5 6.5 0 0 1 12.6 0z" fill="#ee1515" stroke="#1a1a1a" stroke-width="1.2" />
  <line x1="9.5" y1="20" x2="22.5" y2="20" stroke="#1a1a1a" stroke-width="1.2" />
  <circle cx="16" cy="20" r="2" fill="#fff" stroke="#1a1a1a" stroke-width="1.2" />
</svg>
