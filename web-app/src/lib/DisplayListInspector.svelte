<script lang="ts">
  import { tick } from "svelte";
  import type { Playground } from "./playground.svelte";
  import { emittedCount, pageCount, pageRows } from "./inspection";
  import InspectionDetails from "./InspectionDetails.svelte";
  import Panel from "./ui/Panel.svelte";
  let { pg }: { pg: Playground } = $props();
  const inspection = $derived(pg.inspection);
  const trace = $derived(inspection.trace);
  const sources = $derived(new Map(trace?.sourceLines.map(line => [line.line, line.text]) ?? []));
  const selected = $derived(inspection.selected);
  async function keydown(event: KeyboardEvent) {
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
    if (["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const list = (event.currentTarget as HTMLElement).closest("[data-inspection]");
      pg.stepCommand(event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1);
      await tick();
      list?.querySelector<HTMLButtonElement>('.inspection-row[aria-pressed="true"]')?.focus();
    }
  }
</script>

{#snippet actions()}
  <button type="button" class="ui-button" aria-label={inspection.open ? "Close display list" : "Open display list"}
    aria-expanded={inspection.open} onclick={() => pg.toggleInspection()}>{inspection.open ? "Close" : "Open"}</button>
{/snippet}

<Panel title="display list" {actions}>
  {#if inspection.open}
    <div data-inspection role="group" aria-label="Display list commands">
      {#if inspection.stale}<p class="p-3 text-n64-yellow text-xs" role="status">Stale trace · pause or run to refresh. Source linking and stepping are disabled.</p>{/if}
      {#if trace}
        <p class="p-3 text-xs">{trace.microcode} · {trace.time.toFixed(3)}s · {trace.dispatched} commands · {trace.termination === "end" ? "end" : `partial: ${trace.termination}`}</p>
        {#if trace.error}<p class="px-3 text-n64-red text-xs" role="alert">{trace.error}</p>{/if}
        <div class="flex flex-wrap gap-2 px-3 pb-3">
          <button type="button" class="ui-button" disabled={inspection.stale || inspection.step(-1) === null} onclick={() => pg.stepCommand(-1)}>Previous command</button>
          <button type="button" class="ui-button" disabled={inspection.stale || inspection.step(1) === null} onclick={() => pg.stepCommand(1)}>Next command</button>
          <button type="button" class="ui-button" disabled={inspection.stale || inspection.nextDraw() === null} onclick={() => pg.nextDrawCommand()}>Next draw</button>
        </div>
        <div class="inspection-rows">
          <div style="min-width: 470px">
            <div class="inspection-row text-ink-dim" aria-hidden="true"><span>seq</span><span>pc</span><span>line</span><span>source</span><span>mnemonic</span><span>draws</span></div>
            {#each pageRows(trace.rows, inspection.page) as row (row.seq)}
              <button type="button" class:source-match={!inspection.stale && row.line !== null && row.line === inspection.cursorLine}
                class="inspection-row" onkeydown={keydown} aria-label={`Command ${row.seq}, ${row.decoded.mnemonic}, line ${row.line ?? "unknown"}`}
                aria-pressed={row.seq === inspection.selectedSeq} disabled={inspection.stale} onclick={() => pg.selectCommand(row.seq)}>
                <span>{row.seq}</span><code>{row.pc}</code><span>{row.line ?? "—"}</span>
                <span class="truncate" style={`padding-left:${Math.min(row.depthBefore, 12) * 8}px`} title={`depth ${row.depthBefore}: ${sources.get(row.line ?? 0) ?? "unmapped"}`}>{sources.get(row.line ?? 0) ?? "unmapped"}</span>
                <span>{row.decoded.mnemonic}</span><span>{emittedCount(row)}</span>
              </button>
              <details class="px-3 text-[10px]">
                <summary>Words for {row.seq}{row.words.length > 1 ? ` · ${row.words.length - 1} continuation(s)` : ""}</summary>
                {#each row.words as word}<p><code>{word.pc}: {word.w0} {word.w1}</code> · address {word.w1Addr} · line {word.line ?? "unmapped"}</p>{/each}
              </details>
            {/each}
          </div>
        </div>
        <div class="flex items-center justify-between gap-2 p-3 text-xs">
          <button type="button" class="ui-button" disabled={inspection.page === 0} onclick={() => inspection.page--}>Previous page</button>
          <span>Page {inspection.page + 1} / {pageCount(trace.rows.length)}</span>
          <button type="button" class="ui-button" disabled={inspection.page + 1 >= pageCount(trace.rows.length)} onclick={() => inspection.page++}>Next page</button>
        </div>
        {#if selected && trace.states[selected.state]}
          {#key selected.seq}<InspectionDetails row={selected} snapshot={trace.states[selected.state]} microcode={trace.microcode} />{/key}
          {#each selected.diagnostics as index}
            <p class="px-3 text-xs text-n64-yellow">Command diagnostic: {trace.diags[index].msg}</p>
          {/each}
        {/if}
        {#each trace.diags.filter(diagnostic => diagnostic.seq === null) as diagnostic}
          <p class="px-3 pb-2 text-xs text-n64-yellow">{trace.error ? "Assembly" : "Terminal"} diagnostic: {diagnostic.msg}{diagnostic.pc ? ` · ${diagnostic.pc}` : ""}</p>
        {/each}
      {:else}<p class="p-3 text-xs">Waiting for inspection.</p>{/if}
    </div>
  {/if}
</Panel>
