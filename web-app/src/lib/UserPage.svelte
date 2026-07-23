<script lang="ts">
  import { repository, type ToyRepository } from "../toys/repository";
  import type { ToyOwner, ToySummary } from "../toys/types";
  import ToyCard from "./ToyCard.svelte";

  let {
    userId,
    toyRepository = repository,
    active = true,
  }: {
    userId: string;
    toyRepository?: ToyRepository;
    active?: boolean;
  } = $props();
  let loadState = $state<"loading" | "ready" | "error">("loading");
  let owner = $state<ToyOwner>({ id: "", displayName: "" });
  let toys = $state<ToySummary[]>([]);
  let page = $state(1);
  let pageCount = $state(0);

  async function load(requestedPage: number, requestedUserId: string) {
    page = requestedPage;
    loadState = "loading";
    try {
      const result = await toyRepository.listUserPublic(
        requestedUserId,
        requestedPage,
      );
      owner = result.owner;
      toys = result.toys;
      page = result.page;
      pageCount = result.pageCount;
      loadState = "ready";
    } catch {
      loadState = "error";
    }
  }

  $effect(() => {
    const requestedUserId = userId;
    if (active) void load(1, requestedUserId);
  });
</script>

<main class="browse-page">
  {#if loadState === "loading"}
    <div
      role="status"
      class="browse-canvas flex items-center justify-center text-center text-ink-dim"
    >
      loading user toys…
    </div>
  {:else if loadState === "error"}
    <div
      role="alert"
      class="browse-canvas flex flex-col items-center justify-center gap-1 px-6 py-16 text-center"
    >
      <p class="text-ink">This user could not be found.</p>
    </div>
  {:else}
    <header class="mb-6 border-b border-edge pb-3">
      <h1 class="text-base font-bold tracking-wide text-ink">
        Toys by {owner.displayName}
      </h1>
      <p class="mt-2 text-[11px] text-ink-faint">Public toys</p>
    </header>
    {#if toys.length === 0}
      <section
        aria-label="user toys"
        class="browse-canvas flex flex-col items-center justify-center px-6 py-16 text-center"
      >
        <p class="text-ink">
          {owner.displayName
            ? `${owner.displayName} has no public toys yet.`
            : "This user has no public toys yet."}
        </p>
      </section>
    {:else}
      <section
        aria-label="user toys"
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
            onclick={() => load(page - 1, userId)}>Prev</button
          >
          <span class="text-[11px] text-ink-dim"
            >page {page} of {pageCount}</span
          >
          <button
            type="button"
            class="ui-button"
            aria-label="Next page"
            disabled={page >= pageCount}
            onclick={() => load(page + 1, userId)}>Next</button
          >
        </nav>
      {/if}
    {/if}
  {/if}
</main>
