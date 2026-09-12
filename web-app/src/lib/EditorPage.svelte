<script lang="ts">
  import type { Playground } from "./playground.svelte";
  import DebugBar from "./DebugBar.svelte";
  import DebugPanel from "./DebugPanel.svelte";
  import Viewport from "./Viewport.svelte";
  import Editor from "./Editor.svelte";
  import ToyMeta from "./ToyMeta.svelte";
  import TextureInputs from "./TextureInputs.svelte";
  import Diagnostics from "./Diagnostics.svelte";
  import Settings from "./Settings.svelte";
  import SaveControls from "./SaveControls.svelte";
  import type { SaveController } from "./save-controller.svelte";

  let {
    pg = $bindable(),
    canvas = $bindable(),
    saveController,
    onexit = () => {
      location.hash = "";
    },
  }: {
    pg: Playground;
    canvas?: HTMLCanvasElement;
    saveController: SaveController;
    onexit?: () => void | Promise<void>;
  } = $props();
</script>

<main class="editor-page mx-auto w-full max-w-[1280px] p-4">
  <div class="editor-workspace" class:stepping={pg.inspection.open}>
    <button
      type="button"
      aria-label="browse"
      class="ui-button ui-button-quiet editor-back justify-self-start"
      onclick={() => onexit()}>← browse</button
    >
    <div class="editor-viewport"><Viewport {pg} bind:canvas /></div>
    <div class="editor-source">
      {#if pg.inspection.open}<DebugBar {pg} />{/if}
      <Editor
        bind:value={pg.source}
        diagnostics={pg.diags}
        inspectionLine={pg.inspection.linkedLine}
        inspectionNavigation={pg.inspection.navigation}
        breakpoints={pg.inspection.breakpoints}
        onbreakpoints={(lines) => pg.setBreakpoints(lines)}
        ondebug={(command) => pg.debugCommand(command)}
        oncursorline={(line) => pg.inspectSourceLine(line)}
        onrun={() => pg.run()}
        oninput={() => {
          pg.scheduleRun();
        }}
      />
      {#if pg.inspection.open}<DebugPanel {pg} />{/if}
    </div>
    <div class="editor-meta">
      <ToyMeta bind:title={pg.title} bind:description={pg.description} />
      <div class="mt-3"><SaveControls controller={saveController} /></div>
    </div>
    <div class="editor-textures">
      <TextureInputs
        slots={pg.textureSlots}
        onupload={(name, file) => pg.loadTexture(name, file)}
        onremove={(name) => pg.removeTexture(name)}
      />
    </div>
    <div class="editor-diagnostics"><Diagnostics diagnostics={pg.diags} onselect={(diagnostic) => pg.inspectDiagnostic(diagnostic)} /></div>
    <div class="editor-settings"><Settings {pg} /></div>
  </div>
</main>
