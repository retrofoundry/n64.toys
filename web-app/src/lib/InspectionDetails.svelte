<script lang="ts">
  import { combineCycleActive, combineFormula, geometryNames, matrixSummary, otherModeFields, renderModePreset, type InspectionRow, type InspectionState } from "./inspection";
  let { row, snapshot, microcode, changed = [] }: { row: InspectionRow; snapshot: InspectionState; microcode: string; changed?: string[] | null } = $props();
  const sections: Record<string, string> = {
    geometryMode: "Geometry", geometryNames: "Geometry", texture: "Texture", modelviewDepth: "Modelview", modelview: "Modelview", projection: "Projection",
    viewportScale: "Matrices", viewportTranslation: "Matrices", lightCount: "Lights", lights: "Lights", ambient: "Lights", lookatAxes: "Lights",
    tiles: "Tiles", loadViaTile: "Tiles", textureImage: "Tiles", combineL: "Combiner", combineH: "Combiner", otherModeH: "Other modes", otherModeL: "Other modes",
    primColor: "Colors", envColor: "Colors", fogColor: "Colors", blendColor: "Colors", fillColorRaw: "Colors", colorImage: "Colors", depthImage: "Colors", scissor: "Colors",
  };
  const touched = $derived(new Set((changed ?? []).map(key => sections[key] ?? key)));
  let tileIndex = $state<number | undefined>();
  const tile = $derived(snapshot.tiles[tileIndex ?? snapshot.texture.tile]);
  const geometry = $derived(geometryNames(snapshot.geometryMode, microcode));
</script>

<div class="inspection-details">
  <h3 class="font-bold">State after command {row.seq}</h3>
  <p class="text-ink-dim">{#if changed === null}First command of the frame; the state below is what it left behind.{:else if changed.length}Changed by this command: <span class="changed-keys">{changed.join(", ")}</span>.{:else}Nothing changed since the previous command.{/if} Vertex transforms and lighting are latched when vertices load.</p>
  <dl class="mt-2">
    <dt>Control flow</dt><dd>{row.flow} · depth {row.depthBefore} → {row.depthAfter} · next {row.nextPc ?? "none"}</dd>
    <dt class:changed={touched.has("Geometry")}>Geometry</dt><dd class:changed={touched.has("Geometry")}>{snapshot.geometryNames.join(" | ") || "none"} · {snapshot.geometryMode} · unknown {geometry.unknown}</dd>
    <dt class:changed={touched.has("Texture")}>Texture</dt><dd class:changed={touched.has("Texture")}>{snapshot.texture.on ? "on" : "off"} · tile {snapshot.texture.tile} · level {snapshot.texture.level} · scale {snapshot.texture.sc}, {snapshot.texture.tc}</dd>
    <dt class:changed={touched.has("Modelview")}>Modelview</dt><dd class:changed={touched.has("Modelview")}>depth {snapshot.modelviewDepth} · {matrixSummary(snapshot.modelview)}</dd>
    <dt class:changed={touched.has("Projection")}>Projection</dt><dd class:changed={touched.has("Projection")}>{matrixSummary(snapshot.projection)}</dd>
  </dl>
  <details>
    <summary>Words for {row.seq} · {row.words.length - 1} continuation(s)</summary>
    <p>PC: <code>{row.pc}</code></p>
    {#each row.words as word}<p><code>{word.pc}: {word.w0} {word.w1}</code> · address {word.w1Addr} · line {word.line ?? "unmapped"}</p>{/each}
  </details>
  <details open={touched.has("Matrices")}>
    <summary class:changed={touched.has("Matrices")}>Matrices and viewport</summary>
    {#each [["Modelview", snapshot.modelview], ["Projection", snapshot.projection]] as [name, matrix]}
      <h4>{name}</h4><pre>{(matrix as number[][]).map(row => row.join("  ")).join("\n")}</pre>
    {/each}
    <p>Viewport scale: {snapshot.viewportScale.join(", ")} · translation: {snapshot.viewportTranslation.join(", ")}</p>
  </details>
  <details open={touched.has("Lights")}>
    <summary class:changed={touched.has("Lights")}>Lights ({snapshot.lightCount}) and look-at</summary>
    <p>Ambient: {snapshot.ambient.join(", ")}</p>
    {#each snapshot.lights as [direction, color], i}
      <p>Light {i}{i >= snapshot.lightCount ? " (inactive)" : ""} · direction {direction.join(", ")} · color {color.join(", ")}</p>
    {/each}
    <p>Look-at axes: {snapshot.lookatAxes.map(axis => axis.join(", ")).join(" / ")}</p>
  </details>
  <details open>
    <summary class:changed={touched.has("Combiner")}>Combiner</summary>
    <p>combine_l (w0): {snapshot.combineL} · combine_h (w1): {snapshot.combineH}</p>
    {#each [0, 1] as cycle}
      {@const formulas = combineFormula(snapshot.combineL, snapshot.combineH, cycle as 0 | 1)}
      <p class="mt-1">Cycle {cycle + 1}{!combineCycleActive(snapshot.otherModeH, cycle as 0 | 1) ? " (inactive)" : ""}</p>
      <div>RGB: <code>{formulas.rgb}</code></div>
      <div>Alpha: <code>{formulas.alpha}</code></div>
    {/each}
  </details>
  <details open={touched.has("Other modes")}>
    <summary class:changed={touched.has("Other modes")}>Other modes · {renderModePreset(snapshot.otherModeL)}</summary>
    <p>high {snapshot.otherModeH} · low {snapshot.otherModeL}</p>
    <dl>{#each Object.entries(otherModeFields(snapshot.otherModeH, snapshot.otherModeL)) as [name, value]}
      <dt>{name}</dt><dd>{String(value)}</dd>
    {/each}</dl>
  </details>
  <details open={touched.has("Tiles")}>
    <summary class:changed={touched.has("Tiles")}>Tiles and texture image</summary>
    <p>Texture image: {snapshot.textureImage.addr} · format {snapshot.textureImage.fmt} · size {snapshot.textureImage.siz} · width {snapshot.textureImage.width}</p>
    <p>Last load: {snapshot.loadViaTile ? "tile" : "block"}</p>
    <label>Tile <select class="ui-input" value={tileIndex ?? snapshot.texture.tile} onchange={e => tileIndex = Number(e.currentTarget.value)}>
      {#each snapshot.tiles as _, i}<option value={i}>{i}{i === snapshot.texture.tile ? " (RSP selected)" : ""}</option>{/each}
    </select></label>
    {#if tile}<dl>{#each Object.entries(tile) as [name, value]}<dt>{name}</dt><dd>{value}</dd>{/each}</dl>{/if}
  </details>
  <details open={touched.has("Colors")}>
    <summary class:changed={touched.has("Colors")}>Colors, framebuffer and scissor</summary>
    <dl>
      {#each [["Primitive", snapshot.primColor], ["Environment", snapshot.envColor], ["Fog", snapshot.fogColor], ["Blend", snapshot.blendColor]] as [name, color]}
        <dt>{name}</dt><dd><span style={`display:inline-block;width:1em;height:1em;background:rgba(${(color as number[]).slice(0,3).join(",")},${(color as number[])[3]/255})`}></span> RGBA {(color as number[]).join(", ")}</dd>
      {/each}
      <dt>Fill raw</dt><dd>{snapshot.fillColorRaw}</dd>
      <dt>Color image</dt><dd>{snapshot.colorImage.addr} · format {snapshot.colorImage.fmt} · size {snapshot.colorImage.siz} · width {snapshot.colorImage.width}</dd>
      <dt>Depth image</dt><dd>{snapshot.depthImage}</dd>
      <dt>Scissor (pixels)</dt><dd>{snapshot.scissor.ulx}, {snapshot.scissor.uly} → {snapshot.scissor.lrx}, {snapshot.scissor.lry} · mode {snapshot.scissor.mode}</dd>
    </dl>
  </details>
  <details open>
    <summary>Emissions ({row.draws.length})</summary>
    {#if !row.draws.length}<p>No draw.</p>{/if}
    {#each row.draws as draw}
      <p class="mt-2 font-bold">{draw.kind}</p>
      {#if draw.target}
        <p>Pair {draw.target.pairIndex} · color {draw.target.colorImage.addr} ({draw.target.colorImage.width}px, format {draw.target.colorImage.fmt}, size {draw.target.colorImage.siz}) · depth {draw.target.depthImage ?? "none"}{draw.target.isDepthClear ? " · depth clear" : ""}</p>
      {:else}<p>Unpaired triangles</p>{/if}
      {#if draw.kind === "triangles"}
        <p>run {draw.runIndex ?? "none"}, op {draw.opIndex ?? "none"}, material {draw.materialIndex}, render mode {draw.renderModeIndex}</p>
        <p>Index start {draw.indexStart} · indices {draw.indices.join(", ")}</p>
      {:else}
        <p>op {draw.opIndex} · bounds ({draw.kind === "texRect" ? "raw 10.2" : "pixels"}) {draw.rect.join(", ")}</p>
        {#if draw.kind === "fillRect"}<p>Color raw {draw.colorRaw}</p>
        {:else}
          <p>Explicit tile {draw.tile} · ST {draw.uls}, {draw.ult} · derivatives {draw.dsdx}, {draw.dtdy} · flip {String(draw.flip)} · copy {String(draw.copyMode)}</p>
          <p>Framebuffer source: {draw.fbSource ?? "none"}</p>
        {/if}
      {/if}
    {/each}
  </details>
</div>
