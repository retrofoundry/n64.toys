<script lang="ts">
  import { Play, Pause, RotateCcw, Maximize } from "@lucide/svelte";
  import type { Playground } from "./playground.svelte";

  let { pg, canvas }: { pg: Playground; canvas?: HTMLCanvasElement } = $props();

  function fullscreen() {
    canvas?.requestFullscreen?.();
  }
</script>

<div class="border-t border-edge">
  <div class="flex items-center gap-3 px-3.5 py-2.5">
    <span class="ui-status text-ink-dim tracking-wide">{pg.settings.microcode}</span>
    <span class="text-xs {pg.errored ? 'text-n64-red' : 'text-n64-green'}">{pg.status}</span>
    <span class="ml-auto text-xs text-ink-dim tabular-nums">640×480</span>
    <button
      type="button"
      onclick={fullscreen}
      title="Fullscreen"
      aria-label="Fullscreen"
      class="ui-button flex min-h-8 items-center justify-center"
    ><Maximize size={15} strokeWidth={2} /></button>
  </div>

  {#if pg.isAnimated}
    <div class="flex items-center gap-3 px-3.5 py-2.5 border-t border-edge">
      {#if pg.playing}
        <button type="button" onclick={() => pg.pause()} title="Pause" aria-label="Pause"
          class="ui-button flex min-h-8 items-center justify-center">
          <Pause size={15} fill="currentColor" strokeWidth={0} /></button>
      {:else}
        <button type="button" onclick={() => pg.play()} title="Play" aria-label="Play"
          class="ui-button ui-button-primary flex min-h-8 items-center justify-center">
          <Play size={15} fill="currentColor" strokeWidth={0} /></button>
      {/if}
      <button type="button" onclick={() => pg.reset()} title="Reset" aria-label="Reset"
        class="ui-button flex min-h-8 items-center justify-center">
        <RotateCcw size={15} strokeWidth={2} /></button>
      <input
        class="scrub flex-1"
        type="range" min="0" max={pg.scrubMax} step="0.01" value={pg.time}
        oninput={(e) => pg.seek(parseFloat((e.currentTarget as HTMLInputElement).value))}
        aria-label="Time"
      />
      <div class="text-right leading-tight tabular-nums w-14 shrink-0">
        <div class="text-xs text-ink">{pg.time.toFixed(2)}s</div>
        {#if pg.playing}<div class="text-[10px] text-ink-dim">{pg.fps} fps</div>{/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .scrub {
    -webkit-appearance: none;
    appearance: none;
    height: 16px;
    background: transparent;
    cursor: pointer;
  }
  .scrub::-webkit-slider-runnable-track {
    height: 5px;
    background: var(--color-edge);
  }
  .scrub::-moz-range-track { height: 5px; border-radius: 0; background: var(--color-edge); }
  .scrub::-moz-range-progress { height: 5px; border-radius: 0; background: var(--color-n64-blue); }
  .scrub::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 13px; height: 13px; margin-top: -4px;
    border-radius: 0; background: var(--color-ink);
  }
  .scrub::-moz-range-thumb {
    width: 13px; height: 13px; border: none;
    border-radius: 0; background: var(--color-ink);
  }
</style>
