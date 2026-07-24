<script lang="ts">
  import { Select } from "bits-ui";
  import type { Settings } from "./playground.svelte";
  import Panel from "./ui/Panel.svelte";

  let { settings = $bindable() }: { settings: Settings } = $props();

  const microcodes = [{ value: "F3DEX2", label: "F3DEX2" }];
  const triggerCls =
    "flex min-w-[110px] cursor-pointer items-center justify-between gap-2 border border-edge bg-raised px-3 py-1.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-n64-blue";
  const contentCls =
    "z-50 border border-edge bg-panel py-1 text-xs text-ink";
  const itemCls =
    "cursor-pointer px-3 py-1.5 data-[highlighted]:bg-raised data-[highlighted]:outline-none data-[selected]:text-n64-yellow";
</script>

<Panel title="settings" bodyClass="flex flex-col gap-2 p-3">
  <div class="flex items-center justify-between border border-edge bg-base px-3 py-2.5">
    <span id="microcode-label" class="text-ink-dim text-xs">Microcode</span>
    <Select.Root type="single" bind:value={settings.microcode} items={microcodes}>
      <Select.Trigger aria-labelledby="microcode-label" class={triggerCls}>{settings.microcode} ▾</Select.Trigger>
      <Select.Portal>
        <Select.Content class={contentCls} sideOffset={6}>
          {#each microcodes as m (m.value)}
            <Select.Item class={itemCls} value={m.value} label={m.label}>{m.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  </div>

</Panel>
