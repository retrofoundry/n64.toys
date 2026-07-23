<script lang="ts">
  import type { ToySummary } from "../toys/types";

  let {
    toy,
    showVisibility = false,
  }: { toy: ToySummary; showVisibility?: boolean } = $props();

  function open() {
    location.hash = `t=${toy.slug}`;
  }

  function openAuthor() {
    location.hash = `u=${toy.owner.id}`;
  }
</script>

<div
  class="group flex flex-col border border-edge bg-panel transition-colors duration-150 hover:border-edge-hi"
>
  <button
    type="button"
    class="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-n64-blue"
    onclick={open}
  >
    <div class="aspect-[4/3] w-full overflow-hidden border-b border-edge bg-base">
      {#if toy.thumbnailUrl}
        <img
          src={toy.thumbnailUrl}
          alt={`${toy.title} thumbnail`}
          loading="lazy"
          class="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
        />
      {:else}
        <div
          class="flex size-full items-center justify-center text-[11px] tracking-wide text-ink-faint"
        >
          no thumbnail
        </div>
      {/if}
    </div>
    <div class="px-3 pt-3">
      <strong
        class="block truncate font-bold text-ink transition-colors group-hover:text-n64-blue"
        >{toy.title || "untitled"}</strong
      >
      {#if toy.description}
        <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-dim">
          {toy.description}
        </p>
      {/if}
    </div>
  </button>
  <div class="mt-auto flex flex-wrap items-center gap-1.5 px-3 pb-3 pt-2.5">
    <span class="tag">{toy.microcode}</span>
    {#if showVisibility}
      <span class="tag">{toy.visibility}</span>
    {/if}
    <button
      type="button"
      class="link ml-auto text-[11px]"
      onclick={openAuthor}>by {toy.owner.displayName}</button
    >
  </div>
</div>
