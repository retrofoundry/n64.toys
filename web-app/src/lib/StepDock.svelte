<script lang="ts">
  import { StepForward } from "@lucide/svelte";
  import type { Playground } from "./playground.svelte";
  import { emittedCount } from "./inspection";
  import Viewport from "./Viewport.svelte";

  let { pg, canvas = $bindable(), viewportHome }: {
    pg: Playground;
    canvas?: HTMLCanvasElement;
    viewportHome?: HTMLDivElement;
  } = $props();
  let preview = $state<HTMLDivElement>();
  const inspection = $derived(pg.inspection);
  const trace = $derived(inspection.trace);
  const incomplete = $derived(trace !== null && trace.termination !== "end");
  const selected = $derived(inspection.selected);
  const snapshot = $derived(selected && inspection.trace?.states[selected.state]);

  function placeViewport(node: HTMLDivElement) {
    // Moving the mounted canvas preserves the renderer's WebGPU surface and Svelte binding.
    $effect(() => {
      const target = inspection.open ? preview : viewportHome;
      if (target) target.appendChild(node);
    });
    return { destroy() { node.remove(); } };
  }
</script>

<section class="editor-step-dock" aria-label="Frame stepping" hidden={!inspection.open}>
  <div class="inspection-preview" bind:this={preview}>
    <div class="inspection-viewport" use:placeViewport><Viewport {pg} bind:canvas /></div>
  </div>
  {#if inspection.open}
    <div class="inspection-current">
      <button type="button" class="ui-button inspection-toggle" aria-pressed={inspection.open} onclick={() => pg.toggleInspection()}><StepForward size={15} strokeWidth={2} /> Step through frame</button>
      <p class="inspection-command" role="status">
        {#if inspection.stale}Stale trace · run to refresh.
        {:else if selected}Rendered through command {selected.seq} · {selected.decoded.mnemonic} · {selected.line === null ? "unmapped" : `line ${selected.line}`}
        {:else}Select a command to render through.{/if}
      </p>
      <div class="inspection-controls">
        <button type="button" class="ui-button" disabled={inspection.stale || inspection.step(-1) === null} onclick={() => pg.stepCommand(-1)}>Step back</button>
        <button type="button" class="ui-button" disabled={inspection.stale || inspection.step(1) === null} onclick={() => pg.stepCommand(1)}>Step forward</button>
        <button type="button" class="ui-button" disabled={inspection.stale || inspection.nextDraw() === null} onclick={() => pg.nextDrawCommand()}>Next draw</button>
        <button type="button" class="ui-button" disabled={inspection.stale || !trace?.rows.length} onclick={() => pg.renderToEnd()}>{incomplete ? "Render to last captured command" : "Render to end"}</button>
        <span class="inspection-exit"><button type="button" class="ui-button" onclick={() => pg.toggleInspection()}>Exit</button></span>
      </div>
      {#if incomplete}<p class="inspection-summary">Last captured command {trace?.rows.at(-1)?.seq ?? "none"} · partial: {trace?.termination}</p>{/if}
      {#if selected && snapshot}
        <p class="inspection-summary">
          Depth {selected.depthAfter} · geometry {snapshot.geometryNames.join(" | ") || "none"} ({snapshot.geometryMode})<br />
          Texture {snapshot.texture.on ? "on" : "off"} · tile {snapshot.texture.tile} · emissions {emittedCount(selected)}
        </p>
      {/if}
    </div>
  {/if}
</section>
