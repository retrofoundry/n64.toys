<script lang="ts">
  import type { Playground } from "./playground.svelte";
  import Panel from "./ui/Panel.svelte";
  import PlayerBar from "./PlayerBar.svelte";

  let { pg, canvas = $bindable() }: { pg: Playground; canvas?: HTMLCanvasElement } = $props();
</script>

<Panel title="viewport">
  <div class="flex aspect-[4/3] items-center justify-center bg-[#050605]">
    <canvas
      bind:this={canvas}
      width="640"
      height="480"
      aria-label="N64 render output"
      class="max-h-full max-w-full"
    ></canvas>
  </div>
  <PlayerBar {pg} {canvas} />
</Panel>
