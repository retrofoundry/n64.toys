<script lang="ts">
  import Panel from "./ui/Panel.svelte";

  let {
    title = $bindable(),
    description = $bindable(),
  }: { title: string; description: string } = $props();
</script>

<Panel title="toy">
  <div class="p-3 flex flex-col gap-2">
    <input
      bind:value={title}
      placeholder="Toy title"
      aria-label="Toy title"
      class="ui-field text-[17px] font-semibold"
    />
    <textarea
      bind:value={description}
      rows="2"
      placeholder="Description"
      aria-label="Toy description"
      class="ui-field resize-none text-xs leading-relaxed text-ink-dim"
    ></textarea>
  </div>
</Panel>
