<script lang="ts">
  import type { Playground } from "./playground.svelte";
  import DisplayListInspector from "./DisplayListInspector.svelte";
  import StepDock from "./StepDock.svelte";
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
  let viewportHome = $state<HTMLDivElement>();
</script>

<main class="editor-page mx-auto w-full max-w-[1280px] p-4">
  <StepDock {pg} bind:canvas {viewportHome} />
  <div class="editor-workspace" class:editor-stepping={pg.inspection.open}>
    <button
      type="button"
      aria-label="browse"
      class="ui-button ui-button-quiet editor-back justify-self-start"
      onclick={() => onexit()}>← browse</button
    >
    <div class="editor-viewport" bind:this={viewportHome}></div>
    <div class="editor-inspector"><DisplayListInspector {pg} /></div>
    <div class="editor-source">
      <Editor
        bind:value={pg.source}
        diagnostics={pg.diags}
        inspectionLine={pg.inspection.linkedLine}
        inspectionNavigation={pg.inspection.navigation}
        oncursorline={(line) => pg.inspectSourceLine(line)}
        onrun={() => pg.run()}
        oninput={() => {
          pg.scheduleRun();
        }}
      />
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
