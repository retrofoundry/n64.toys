<script lang="ts">
  import type { Playground } from "./playground.svelte";
  import { stateChanges } from "./inspection";
  import CommandList from "./CommandList.svelte";
  import BreakpointList from "./BreakpointList.svelte";
  import InspectionDetails from "./InspectionDetails.svelte";
  import Panel from "./ui/Panel.svelte";
  let { pg }: { pg: Playground } = $props();
  const inspection = $derived(pg.inspection);
  const trace = $derived(inspection.trace);
  const selected = $derived(inspection.selected);
  const previous = $derived(trace && selected ? trace.rows[trace.rows.indexOf(selected) - 1] : undefined);
  const changed = $derived(trace && selected ? stateChanges(previous && trace.states[previous.state], trace.states[selected.state]) : []);
  const tabs = ["State", "Commands", "Breakpoints"] as const;
  let tab = $state<(typeof tabs)[number]>("State");
</script>

<Panel class="debug-panel">
  <div class="debug-tabs" role="tablist" aria-label="Debug views">
    {#each tabs as name (name)}
      <button type="button" role="tab" class="debug-tab" aria-selected={tab === name} onclick={() => (tab = name)}>
        {name}{#if name === "Breakpoints" && inspection.breakpoints.length}{` (${inspection.breakpoints.length})`}{/if}
      </button>
    {/each}
  </div>
  <div class="debug-body" role="tabpanel" aria-label={tab}>
    {#if tab === "State"}
      {#if trace && selected && trace.states[selected.state]}
        {#key selected.seq}<InspectionDetails row={selected} snapshot={trace.states[selected.state]} microcode={trace.microcode} changed={previous ? changed : null} />{/key}
      {:else}<p class="p-3 text-xs text-ink-dim">Select a command to see the RSP/RDP state after it.</p>{/if}
    {:else if tab === "Commands"}
      <CommandList {pg} />
    {:else}
      <BreakpointList {pg} />
    {/if}
  </div>
</Panel>
