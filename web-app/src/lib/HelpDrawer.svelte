<script lang="ts">
  import { X } from "@lucide/svelte";

  let {
    open = $bindable(false),
    onclose,
    returnFocus,
  }: {
    open?: boolean;
    onclose?: () => void;
    returnFocus?: HTMLElement;
  } = $props();

  // Syntax strings live here rather than in the markup: braces are Svelte template syntax, and
  // keeping them as data makes each form exactly one text node.
  const MINI_EXAMPLE = [
    "Mtx model = identity()",
    "Vtx { -70, -60, 0, 0, 0, 0, 255, 0, 0, 255 }",
    "update { guRotate(model, time * 60, 0, 0, 1) }",
    "gsSPMatrix(model, G_MTX_MODELVIEW | G_MTX_LOAD | G_MTX_NOPUSH)",
    "gsSPVertex(verts, 3, 0)",
    "gsSPEndDisplayList()",
  ].join("\n");

  const DECLARATIONS: { syntax: string; note: string }[] = [
    {
      syntax: "Vtx { x, y, z, flag, s, t, r, g, b, a }",
      note: "One vertex. Position, then texture coords (s/t in 1/32 texel units), then vertex colour. Bare Vtx lines all join a single pool, in declaration order.",
    },
    {
      syntax: "VtxN { x, y, z, flag, s, t, nx, ny, nz, a }",
      note: "A lit vertex: the colour slots carry a normal instead. Use with Lights.",
    },
    {
      syntax: "Vp { vscale0..3, vtrans0..3 }",
      note: "The viewport, referred to as vp. 640, 480, 511, 0, 640, 480, 511, 0 fills the screen.",
    },
    {
      syntax: "Mtx <name> = identity()",
      note: "Also scale(f), translate(x, y, z), perspective(fovy, aspect, near, far, scale), and lookat(ex, ey, ez, ax, ay, az, ux, uy, uz).",
    },
    {
      syntax: "Texture <name> = { width, height, FMT }",
      note: "Declares a texture slot — upload a PNG for it below the editor. FMT is RGBA16, IA4, IA8, IA16, I4, I8, CI4, or CI8.",
    },
    {
      syntax: "Lights <name> = { dir(x, y, z) col(r, g, b); ambient(r, g, b) }",
      note: "Any number of directional entries, ambient last. Apply with gsSPSetLights(name).",
    },
    {
      syntax: "LookAt <name> = lookat_reflect(ex, ey, ez, ax, ay, az, ux, uy, uz)",
      note: "The eye basis for reflection texgen. Apply with gsSPLookAt(name).",
    },
    {
      syntax: "gsSPVertex(verts, n, v0)",
      note: "Loads n vertices from the pool into the RSP's 32-slot cache starting at slot v0. Triangles then index that cache by slot number, not by name — so verts is a convention that keeps source portable, not a lookup.",
    },
    {
      syntax: "VtxSet <name> = { <Vtx/VtxN lines> }",
      note: "A named vertex block — the one place vertices take names, since morph needs two sets addressable at once. Only used as a morph operand.",
    },
    {
      syntax: "Gfx <name>[] = { ... }",
      note: "A nested display list, called with gsSPDisplayList(name).",
    },
  ];

  const ANIMATION: { syntax: string; note: string }[] = [
    {
      syntax: "update { guRotate(<mtx>, deg, x, y, z) }",
      note: "Runs every frame, baking matrices over their declared initializers. Also guTranslate, guScale, and guMtxIdent.",
    },
    {
      syntax: "time",
      note: "Seconds since the timeline started — the usual way to animate. frame is floor(time * 60).",
    },
    {
      syntax: "morph <pool> = lerp(<setA>, <setB>, <weight>)",
      note: "Per-vertex interpolation between two VtxSet blocks; weight is any time expression.",
    },
  ];

  const LINKS = [
    {
      href: "https://ultra64.ca/files/documentation/online-manuals/functions_reference_manual_2.0i/gsp/gsp.html",
      label: "SDK gSP reference (geometry, matrices, vertices)",
    },
    {
      href: "https://ultra64.ca/files/documentation/online-manuals/functions_reference_manual_2.0i/gdp/gdp.html",
      label: "SDK gDP reference (combiner, blender, textures)",
    },
    {
      href: "https://n64brew.dev/wiki/Display_List",
      label: "Display lists — concepts",
    },
  ];

  let closeButton = $state<HTMLButtonElement | undefined>();
  let copyState = $state<"idle" | "copied" | "failed">("idle");

  $effect(() => {
    if (open) {
      copyState = "idle";
      closeButton?.focus();
    }
  });

  function close(): void {
    open = false;
    returnFocus?.focus();
    onclose?.();
  }

  function onkeydown(event: KeyboardEvent): void {
    if (open && event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  async function copyExample(): Promise<void> {
    try {
      await navigator.clipboard.writeText(MINI_EXAMPLE);
      copyState = "copied";
    } catch {
      copyState = "failed";
    }
  }
</script>

<svelte:window {onkeydown} />

{#if open}
  <div
    role="dialog"
    aria-labelledby="help-drawer-title"
    class="fixed z-50 flex flex-col border-edge bg-panel text-sm text-ink-dim
           inset-0 border-t
           xl:inset-y-0 xl:right-0 xl:left-auto xl:w-[360px] xl:border-t-0 xl:border-l"
  >
    <header class="flex shrink-0 items-center gap-3 border-b border-edge px-4 py-3">
      <h2 id="help-drawer-title" class="ui-status text-ink">writing toys</h2>
      <button
        type="button"
        bind:this={closeButton}
        aria-label="close help"
        onclick={close}
        class="ui-button ml-auto flex min-h-8 items-center justify-center gap-1.5"
      >
        <X size={14} strokeWidth={2.2} /> Close
      </button>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      <section class="mb-6">
        <h3 class="mb-2 text-xs tracking-wide text-ink">anatomy</h3>
        <p class="mb-3 leading-relaxed">
          A toy has three strata, in this order: <strong class="text-ink">declarations</strong> that
          name data, an optional <strong class="text-ink">update block</strong> that recomputes
          matrices every frame, and the <strong class="text-ink">display-list commands</strong> that
          draw. Commands refer to declarations by name.
        </p>
        <pre
          class="overflow-x-auto border border-edge bg-base p-3 text-xs leading-relaxed text-ink"><code
            >{MINI_EXAMPLE}</code
          ></pre>
        <div class="mt-2 flex items-center gap-3">
          <button type="button" class="ui-button" onclick={copyExample}>Copy</button>
          {#if copyState === "copied"}
            <span role="status" class="text-xs text-n64-green">copied</span>
          {:else if copyState === "failed"}
            <span role="status" class="text-xs text-n64-red">copy failed</span>
          {/if}
        </div>
      </section>

      <section class="mb-6">
        <h3 class="mb-2 text-xs tracking-wide text-ink">declarations</h3>
        <dl class="space-y-3">
          {#each DECLARATIONS as decl (decl.syntax)}
            <div>
              <dt class="font-mono text-xs break-words text-n64-yellow">{decl.syntax}</dt>
              <dd class="mt-1 text-xs leading-relaxed">{decl.note}</dd>
            </div>
          {/each}
        </dl>
      </section>

      <section class="mb-6">
        <h3 class="mb-2 text-xs tracking-wide text-ink">animation</h3>
        <dl class="space-y-3">
          {#each ANIMATION as entry (entry.syntax)}
            <div>
              <dt class="font-mono text-xs break-words text-n64-yellow">{entry.syntax}</dt>
              <dd class="mt-1 text-xs leading-relaxed">{entry.note}</dd>
            </div>
          {/each}
        </dl>
      </section>

      <section>
        <h3 class="mb-2 text-xs tracking-wide text-ink">commands</h3>
        <p class="mb-3 text-xs leading-relaxed">
          The <code class="text-n64-blue">gs*</code> layer is the N64's standard display-list macro set
          (F3DEX2), so the SDK reference applies directly — and source written here stays portable to
          a real N64 project.
        </p>
        <ul class="space-y-2">
          {#each LINKS as link (link.href)}
            <li>
              <a
                class="text-xs underline underline-offset-2 hover:text-ink"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer">{link.label} →</a
              >
            </li>
          {/each}
        </ul>
      </section>
    </div>
  </div>
{/if}
