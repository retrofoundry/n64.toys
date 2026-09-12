<script lang="ts">
  import { tick } from "svelte";
  import type { Playground } from "./playground.svelte";
  import { emittedCount, pageCount, pageRows } from "./inspection";
  let { pg }: { pg: Playground } = $props();
  const inspection = $derived(pg.inspection);
  const trace = $derived(inspection.trace);
  const sources = $derived(new Map(trace?.sourceLines.map(line => [line.line, line.text]) ?? []));
  const selected = $derived(inspection.selected);
  async function keydown(event: KeyboardEvent) {
    if (["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const list = (event.currentTarget as HTMLElement).closest("[data-inspection]");
      pg.stepCommand(event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1);
      await tick();
      const row = list?.querySelector<HTMLButtonElement>('.inspection-row[aria-pressed="true"]');
      row?.focus({ preventScroll: true });
      const scroller = row?.closest<HTMLElement>(".inspection-rows");
      if (row && scroller) {
        const top = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        if (top < 0) scroller.scrollTop += top;
        else if (top + row.offsetHeight > scroller.clientHeight) scroller.scrollTop += top + row.offsetHeight - scroller.clientHeight;
      }
    }
  }
</script>

<div data-inspection role="group" aria-label="Commands">
  {#if inspection.stale}<p class="p-3 text-n64-yellow text-xs" role="status">Stale trace · pause or run to refresh. Stepping is disabled.</p>{/if}
  {#if trace}
    <p class="p-3 text-xs">{trace.microcode} · {trace.time.toFixed(3)}s · {trace.dispatched} commands · {trace.termination === "end" ? "frame complete" : `last captured command ${trace.rows.at(-1)?.seq ?? "none"} · partial: ${trace.termination}`}</p>
    {#if trace.error}<p class="px-3 text-n64-red text-xs" role="alert">{trace.error}</p>{/if}
    <div class="inspection-rows">
      <div>
        <div class="inspection-row text-ink-dim" aria-hidden="true"><span>seq</span><span>line</span><span>source</span><span>mnemonic</span><span>draws</span></div>
        {#each pageRows(trace.rows, inspection.page) as row (row.seq)}
          <button type="button" class:source-match={!inspection.stale && row.line !== null && row.line === inspection.cursorLine}
            class:breakpoint={row.line !== null && inspection.breakpoints.includes(row.line)}
            class="inspection-row" onkeydown={keydown} aria-label={`Command ${row.seq}, ${row.decoded.mnemonic}, line ${row.line ?? "unknown"}`}
            aria-pressed={row.seq === inspection.selectedSeq} disabled={inspection.stale} onclick={() => pg.selectCommand(row.seq)}>
            <span class="inspection-position">{#if row.seq === inspection.selectedSeq}<span class="inspection-marker" aria-label="Rendered through">→</span>{/if}{row.seq}</span><span>{row.line ?? "—"}</span>
            <span class="truncate" style={`padding-left:${Math.min(row.depthBefore, 12) * 8}px`} title={`depth ${row.depthBefore}: ${sources.get(row.line ?? 0) ?? "unmapped"}`}>{sources.get(row.line ?? 0) ?? "unmapped"}</span>
            <span class="inspection-mnemonic">{row.decoded.mnemonic}</span><span>{emittedCount(row)}</span>
          </button>
        {/each}
      </div>
    </div>
    <div class="flex items-center justify-between gap-2 p-3 text-xs">
      <button type="button" class="ui-button" disabled={inspection.page === 0} onclick={() => inspection.page--}>Previous page</button>
      <span>Page {inspection.page + 1} / {pageCount(trace.rows.length)}</span>
      <button type="button" class="ui-button" disabled={inspection.page + 1 >= pageCount(trace.rows.length)} onclick={() => inspection.page++}>Next page</button>
    </div>
    {#if selected}
      {#each selected.diagnostics as index}
        <p class="px-3 text-xs text-n64-yellow">Command diagnostic: {trace.diags[index].msg}</p>
      {/each}
    {/if}
    {#each trace.diags.filter(diagnostic => diagnostic.seq === null) as diagnostic}
      <p class="px-3 pb-2 text-xs text-n64-yellow">{trace.error ? "Assembly" : "Terminal"} diagnostic: {diagnostic.msg}{diagnostic.pc ? ` · ${diagnostic.pc}` : ""}</p>
    {/each}
  {:else}<p class="p-3 text-xs">Waiting for inspection.</p>{/if}
</div>
