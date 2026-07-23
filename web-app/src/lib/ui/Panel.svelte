<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    actions,
    children,
    class: className = "",
    bodyClass = "",
  }: {
    title?: string;
    actions?: Snippet;
    children: Snippet;
    class?: string;
    bodyClass?: string;
  } = $props();
</script>

<section class={`border border-edge bg-panel ${className}`} aria-label={title}>
  {#if title}
    <header class="flex min-h-8 items-center border-b border-edge px-3 py-1.5">
      <h2 class="text-[11px] font-bold uppercase tracking-wide text-ink">{title}</h2>
      {#if actions}<div class="ml-auto">{@render actions()}</div>{/if}
    </header>
  {/if}
  <div class={bodyClass}>{@render children()}</div>
</section>
