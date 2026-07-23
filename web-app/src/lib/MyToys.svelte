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
      const result = await toyRepository.listMine(requestedPage);
      toys = result.toys;
      page = result.page;
      pageCount = result.pageCount;
      loadState = "ready";
    } catch {
      loadState = "error";
    }
  }

  // Reload page 1 when this view becomes active; never fetches while hidden or signed out.
  $effect(() => {
    if (active) void load(1);
  });
</script>

<main class="browse-page">
  <header class="mb-6 border-b border-edge pb-3">
    <h1 class="page-title">My toys</h1>
    <p class="mt-2 text-[11px] text-ink-faint">
      Everything you've saved — private, unlisted, and public
    </p>
  </header>

  {#if loadState === "loading"}
    <div
      role="status"
      class="browse-canvas flex items-center justify-center text-center text-ink-dim"
    >
      loading your toys…
    </div>
  {:else if loadState === "error"}
    <div
      role="alert"
      class="browse-canvas flex flex-col items-center justify-center gap-1 px-6 py-16 text-center"
    >
      <p class="text-ink">Sign in to see your toys.</p>
      <p class="text-[11px] text-ink-faint">
        Use the account menu in the top right.
      </p>
    </div>
  {:else if toys.length === 0}
    <section
      aria-label="your toys"
      class="browse-canvas flex flex-col items-center justify-center gap-1 px-6 py-16 text-center"
    >
      <p class="text-ink">You haven't saved any toys yet.</p>
      <p class="text-[11px] text-ink-faint">
        Open the editor and hit Save to start your collection.
      </p>
    </section>
  {:else}
    <section
      aria-label="your toys"
      class="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]"
    >
      {#each toys as toy (toy.slug)}
        <ToyCard {toy} showVisibility={true} />
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
