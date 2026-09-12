<script lang="ts">
  import type { Playground } from "./playground.svelte";
  let { pg }: { pg: Playground } = $props();
  const inspection = $derived(pg.inspection);
  const sources = $derived(new Map(inspection.trace?.sourceLines.map(line => [line.line, line.text]) ?? []));
  const hitLines = $derived(new Set(inspection.trace?.rows.map(row => row.line) ?? []));
</script>

<div class="p-3 text-xs" role="group" aria-label="Breakpoints">
  {#if !inspection.breakpoints.length}
    <p class="text-ink-dim">No breakpoints. Click a line number's margin in the editor to add one; Continue runs to the next.</p>
  {:else}
    <ul class="breakpoint-list">
      {#each inspection.breakpoints as line (line)}
        <li>
          <span class="cm-breakpoint" aria-hidden="true"></span>
          <span class="tabular-nums text-ink-dim">line {line}</span>
          <span class="truncate">{sources.get(line) ?? ""}</span>
          {#if inspection.trace && !hitLines.has(line)}<span class="text-ink-faint">never reached</span>{/if}
          <button type="button" class="ui-button" aria-label={`Remove breakpoint at line ${line}`} onclick={() => pg.setBreakpoints(inspection.breakpoints.filter(l => l !== line))}>×</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
