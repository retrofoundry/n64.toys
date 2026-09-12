<script lang="ts">
  import { ArrowDownToDot, ArrowUpFromDot, Play, Redo2, RotateCcw, SkipBack, Square, StepBack } from "@lucide/svelte";
  import type { Playground } from "./playground.svelte";
  let { pg }: { pg: Playground } = $props();
  const inspection = $derived(pg.inspection);
  const rows = $derived(inspection.trace?.rows ?? []);
  const selected = $derived(inspection.selected);
  const frozen = $derived(inspection.stale || rows.length === 0);
  const atEnd = $derived(selected !== undefined && selected.seq === rows.at(-1)?.seq);
  const atStart = $derived(selected !== undefined && selected.seq === rows[0]?.seq);
  const buttons = $derived([
    { label: "Reverse continue", icon: SkipBack, disabled: frozen || atStart, run: () => pg.continueFrame(-1) },
    { label: "Step back", icon: StepBack, disabled: frozen || inspection.stepLine("over", -1) === null, run: () => pg.stepLine("over", -1) },
    { label: "Continue", icon: Play, disabled: frozen || atEnd, run: () => pg.continueFrame(1), primary: true },
    { label: "Step over", icon: Redo2, disabled: frozen || inspection.stepLine("over", 1) === null, run: () => pg.stepLine("over", 1) },
    { label: "Step into", icon: ArrowDownToDot, disabled: frozen || inspection.stepLine("into", 1) === null, run: () => pg.stepLine("into", 1) },
    { label: "Step out", icon: ArrowUpFromDot, disabled: frozen || inspection.stepLine("out", 1) === null, run: () => pg.stepLine("out", 1) },
    { label: "Restart", icon: RotateCcw, disabled: frozen, run: () => pg.restartFrame() },
    { label: "Stop", icon: Square, disabled: false, run: () => pg.toggleInspection() },
  ]);
</script>

<div class="debug-bar" role="toolbar" aria-label="Debug frame">
  <div class="debug-buttons">
    {#each buttons as button (button.label)}
      <button type="button" class="ui-button debug-button" class:ui-button-primary={button.primary} aria-label={button.label} title={button.label} disabled={button.disabled} onclick={button.run}>
        <button.icon size={14} strokeWidth={2.2} />
      </button>
    {/each}
    <button type="button" class="ui-button debug-text" disabled={frozen || inspection.step(1) === null} onclick={() => pg.stepCommand(1)}>Next command</button>
    <button type="button" class="ui-button debug-text" disabled={frozen || inspection.nextDraw() === null} onclick={() => pg.nextDrawCommand()}>Next draw</button>
  </div>
  <p class="debug-status" role="status">
    {#if inspection.stale}Stale trace · run to refresh.
    {:else if selected}{inspection.presented === true ? "Rendered through" : "Selected"} command {selected.seq} · {selected.decoded.mnemonic} · {selected.line === null ? "unmapped" : `line ${selected.line}`} · t = {pg.time.toFixed(2)}s
    {:else}Waiting for the frame.{/if}
  </p>
  {#if selected && !inspection.stale && inspection.presented === false}
    <p class="inspection-presentation" role="status">This prefix presented no image. The canvas still shows the previous image.</p>
  {/if}
</div>
