<script lang="ts">
  import type { Diagnostic } from "./playground.svelte";
  import Panel from "./ui/Panel.svelte";

  let { diagnostics, onselect }: { diagnostics: Diagnostic[]; onselect?: (diagnostic: Diagnostic) => void } = $props();
</script>

{#snippet actions()}
  {#if diagnostics.length}
    <span class="ui-status text-ink-faint">{diagnostics.length}</span>
  {/if}
{/snippet}

<Panel title="diagnostics" {actions}>
  <div class="p-3 flex flex-col gap-2">
    {#if diagnostics.length === 0}
      <div class="text-n64-green text-xs">no diagnostics</div>
    {:else}
      {#each diagnostics as d (`${d.kind}:${d.line}:${d.severity}:${d.msg}`)}
        <div class="flex gap-2.5 border border-edge border-l-[3px] {d.severity === "warn" ? "border-l-n64-yellow" : "border-l-n64-red"} bg-raised px-2.5 py-1.5 text-xs">
          {#if d.kind === "src"}
            <span class="text-n64-yellow shrink-0">line {d.line}</span>
          {:else if d.kind === "addr"}
            <span class="text-n64-yellow shrink-0">addr 0x{d.line.toString(16)}</span>
          {/if}
          {#if onselect}
            <button type="button" class="text-ink text-left underline" onclick={() => onselect(d)}>{d.msg}</button>
          {:else}<span class="text-ink">{d.msg}</span>{/if}
        </div>
      {/each}
    {/if}
  </div>
</Panel>
