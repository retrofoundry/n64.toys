<script lang="ts">
  import { repository, type ToyRepository } from "../toys/repository";
  import type { ToySummary } from "../toys/types";
  import ToyCard from "./ToyCard.svelte";

  let {
    toyRepository = repository,
    active = true,
  }: { toyRepository?: ToyRepository; active?: boolean } = $props();
  let loadState = $state<"loading" | "ready" | "error">("loading");
  let toys = $state<ToySummary[]>([]);
  let page = $state(1);
  let pageCount = $state(0);

  async function load(requestedPage = page) {
    page = requestedPage;
    loadState = "loading";
    try {
      const result = await toyRepository.list(requestedPage);
      toys = result.toys;
      page = result.page;
      pageCount = result.pageCount;
      loadState = "ready";
    } catch {
      loadState = "error";
    }
  }

  // Reload page 1 when this view becomes active; never fetches while hidden.
  $effect(() => {
    if (active) void load(1);
  });
</script>

<main class="browse-page">
  <header class="mb-6 border-b border-edge pb-3">
    <h1 class="page-title">Browse</h1>
    <p class="mt-2 text-[11px] text-ink-faint">
      Public toys shared by the community
    </p>
  </header>

  {#if loadState === "loading"}
    <div
      role="status"
      class="browse-canvas flex items-center justify-center text-center text-ink-dim"
    >
      loading toys…
    </div>
  {:else if loadState === "error"}
    <div
      role="alert"
      class="border border-n64-red bg-panel px-4 py-8 text-center"
    >
      <p class="text-ink">unable to load toys</p>
      <button type="button" class="ui-button mt-3" onclick={() => load()}
        >retry</button
      >
    </div>
  {:else if toys.length === 0}
    <section
      aria-label="published toys"
      class="browse-canvas flex flex-col items-center justify-center gap-1 px-6 py-16 text-center"
    >
      <p class="text-ink">no toys here yet</p>
      <p class="text-[11px] text-ink-faint">published toys will appear here</p>
    </section>
  {:else}
    <section
      aria-label="published toys"
      class="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]"
    >
      {#each toys as toy (toy.slug)}
        <ToyCard {toy} />
      {/each}
    </section>
    {#if pageCount > 1}
      <nav
        class="mt-6 flex items-center justify-center gap-3"
        aria-label="Toy pages"
      >
        <button
          type="button"
          class="ui-button"
          aria-label="Previous page"
          disabled={page <= 1}
          onclick={() => load(page - 1)}>Prev</button
        >
        <span class="text-[11px] text-ink-dim">page {page} of {pageCount}</span>
        <button
          type="button"
          class="ui-button"
          aria-label="Next page"
          disabled={page >= pageCount}
          onclick={() => load(page + 1)}>Next</button
        >
      </nav>
    {/if}
  {/if}
</main>
