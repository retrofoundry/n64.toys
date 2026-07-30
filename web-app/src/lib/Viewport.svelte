<script lang="ts">
  import type { Playground } from "./playground.svelte";
  import Panel from "./ui/Panel.svelte";
  import PlayerBar from "./PlayerBar.svelte";

  let { pg, canvas = $bindable() }: { pg: Playground; canvas?: HTMLCanvasElement } = $props();
</script>

<Panel title="viewport">
  <div class="flex aspect-[4/3] items-center justify-center bg-[#050605]">
    {#if pg.rendererState === "unsupported"}
      <div class="max-w-sm p-6 text-center text-sm text-ink-dim">
        <p class="mb-2 text-ink">n64.toys renders with <strong>WebGPU</strong>.</p>
        <p class="mb-3">This browser doesn't support it yet — Chrome and Edge work today.</p>
        <a class="underline" href="https://caniuse.com/webgpu" target="_blank" rel="noopener noreferrer">
          Browser support →
        </a>
        <p class="mt-3 text-xs">Browsing and editing still work; only the live view needs WebGPU.</p>
      </div>
    {:else if pg.rendererState === "failed"}
      <div class="max-w-sm p-6 text-center text-sm text-ink-dim">
        <p class="mb-3 text-ink">The renderer failed to start.</p>
        <button type="button" class="ui-button ui-button-primary" onclick={() => pg.retryRenderer()}>
          Retry
        </button>
        <details class="mt-3 text-left text-xs">
          <summary>error details</summary>
          <pre class="whitespace-pre-wrap">{pg.rendererError}</pre>
        </details>
      </div>
    {:else}
      <canvas
        bind:this={canvas}
        width="640"
        height="480"
        aria-label="N64 render output"
        class="max-h-full max-w-full"
      ></canvas>
    {/if}
  </div>
  <PlayerBar {pg} {canvas} />
</Panel>
