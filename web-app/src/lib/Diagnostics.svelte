<script lang="ts">
  import type { Diagnostic } from "./playground.svelte";
  import Panel from "./ui/Panel.svelte";

  let { diagnostics }: { diagnostics: Diagnostic[] } = $props();
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
      {#each diagnostics as d (`${d.line}:${d.msg}`)}
        <div class="flex gap-2.5 border border-edge border-l-[3px] border-l-n64-red bg-raised px-2.5 py-1.5 text-xs">
          <span class="text-n64-yellow shrink-0">line {d.line}</span>
          <span class="text-ink">{d.msg}</span>
        </div>
      {/each}
    {/if}
  </div>
</Panel>
