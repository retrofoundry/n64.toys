<script lang="ts">
  import AuthMenu from "./auth/AuthMenu.svelte";
</script>

<header class="border-b border-edge bg-panel">
  <nav
    aria-label="primary"
    class="mx-auto flex min-h-12 w-full max-w-[1280px] items-center gap-4 px-4"
  >
    <button
      type="button"
      class="ui-button ui-button-quiet flex items-center text-[15px]"
      onclick={() => (location.hash = "")}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        class="mr-2 size-5 shrink-0"
        fill="none"
      >
        <polygon points="12,3 21,12 12,12" fill="#ffd400" />
        <polygon points="12,3 12,12 3,12" fill="#ef3e24" />
        <polygon points="3,12 12,12 12,21" fill="#25b85b" />
        <polygon points="21,12 12,12 12,21" fill="#168bd2" />
      </svg>
      <span class="font-bold text-ink">n64</span><span class="text-n64-yellow">.</span><span class="text-ink-dim">toys</span>
    </button>
    <button
      type="button"
      class="ui-button ui-button-quiet"
      onclick={() => (location.hash = "")}>browse</button
    >
    <button
      type="button"
      class="ui-button ui-button-primary ml-auto"
      onclick={() => (location.hash = "new")}>create toy</button
    >
    <AuthMenu />
  </nav>
</header>
