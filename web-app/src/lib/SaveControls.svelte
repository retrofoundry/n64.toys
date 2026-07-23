<script lang="ts">
  import { onMount } from "svelte";

  import type { SaveController } from "./save-controller.svelte";

  let { controller }: { controller: SaveController } = $props();

  function saveShortcut(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void controller.save();
    }
  }

  function deleteToy(): void {
    if (
      window.confirm("Delete this toy permanently? This cannot be undone.")
    ) {
      void controller.deleteToy();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", saveShortcut);
    return () => window.removeEventListener("keydown", saveShortcut);
  });
</script>

<section aria-label="save controls" class="flex flex-wrap items-center gap-2">
  <label class="flex items-center gap-2 text-[11px] text-ink-dim">
    visibility
    <select
      aria-label="visibility"
      class="border border-edge bg-panel px-2 py-1.5 text-ink"
      value={controller.visibility}
      onchange={(event) =>
        controller.setVisibility(
          event.currentTarget.value as "private" | "unlisted" | "public",
        )}
    >
      <option value="private">private</option>
      <option value="unlisted">unlisted</option>
      <option value="public">public</option>
    </select>
  </label>
  <button
    type="button"
    class="ui-button ui-button-primary"
    disabled={controller.status === "saving"}
    onclick={() => controller.save()}
  >
    {controller.status === "saving"
      ? "Saving…"
      : controller.ownedSlug
        ? "Update"
        : "Save"}
  </button>
  {#if controller.ownedSlug}
    <button
      type="button"
      class="ui-button ui-button-quiet text-n64-red"
      disabled={controller.status === "saving"}
      onclick={deleteToy}
    >
      Delete
    </button>
  {/if}
  {#if controller.pendingDraft}
    <button
      type="button"
      class="ui-button ui-button-quiet"
      onclick={() => controller.discardPendingDraft()}
    >
      Discard draft
    </button>
  {/if}
  {#if controller.status === "saved"}
    <span role="status" class="text-[11px] text-n64-green">saved</span>
  {:else if controller.status === "error"}
    <span role="alert" class="text-[11px] text-n64-red">
      {controller.errorMessage ?? "unable to save"}
    </span>
  {:else if controller.status === "dirty"}
    <span role="status" class="text-[11px] text-ink-faint">unsaved</span>
  {/if}
</section>
