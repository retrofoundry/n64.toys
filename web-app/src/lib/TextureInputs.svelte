<script lang="ts">
  import type { TextureSlot } from "./texture-inputs";
  import Panel from "./ui/Panel.svelte";

  let {
    slots,
    onupload,
    onremove,
  }: {
    slots: TextureSlot[];
    onupload: (name: string, file: File) => void | Promise<void>;
    onremove: (name: string) => void;
  } = $props();

  async function onchange(name: string, e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      try {
        await onupload(name, file);
      } catch {
        // Playground records the rejection on the named slot for inline display.
      } finally {
        input.value = ""; // reset so re-selecting the same file fires onchange again
      }
    }
  }
</script>

<Panel title="texture inputs">
  {#if slots.length === 0}
    <p class="p-3 text-xs text-ink-faint">declare a Texture in source to add an input</p>
  {:else}
    <div class="grid gap-3 p-3 sm:grid-cols-2">
      {#each slots as slot (slot.declaration.name)}
        <div class="flex min-w-0 gap-3 border border-edge p-2">
          <label
            class="shrink-0 cursor-pointer text-center focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-n64-blue"
          >
            {#if slot.asset}
              {#if slot.asset.png.type.startsWith("image/")}
                <img
                  src={slot.asset.previewUrl}
                  alt={`${slot.declaration.name} texture preview`}
                  class="h-[72px] w-[72px] border border-edge-hi object-cover [image-rendering:pixelated]"
                />
              {:else}
                <span
                  class="flex h-[72px] w-[72px] items-center justify-center border border-edge-hi px-2 text-[10px] text-ink-dim"
                >binary loaded</span>
              {/if}
              <span class="mt-1 block text-[10px] text-ink-faint">replace PNG</span>
            {:else}
              <span
                class="flex h-[72px] w-[72px] items-center justify-center border border-dashed border-edge-hi px-2 text-[10px] text-ink-dim"
              >choose PNG</span>
            {/if}
            <input
              type="file"
              accept="image/png"
              aria-label={`upload ${slot.declaration.name} texture`}
              onchange={(event) => onchange(slot.declaration.name, event)}
              class="sr-only"
            />
          </label>
          <div class="min-w-0 flex-1">
            <p class="break-words text-xs font-medium text-ink">
              {slot.declaration.name} · {slot.declaration.width}x{slot.declaration.height} · {slot
                .declaration.format}
            </p>
            {#if slot.error}
              <p class="mt-1 text-[11px] text-n64-red" role="alert">{slot.error}</p>
            {/if}
            {#if slot.uploadError}
              <p class="mt-1 text-[11px] text-n64-red" role="alert">{slot.uploadError}</p>
            {/if}
            {#if slot.asset}
              <button
                type="button"
                class="ui-button ui-button-quiet mt-2"
                aria-label={`remove ${slot.declaration.name} texture`}
                onclick={() => onremove(slot.declaration.name)}>remove</button
              >
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</Panel>
