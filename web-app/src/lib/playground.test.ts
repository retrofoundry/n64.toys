// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wasm = vi.hoisted(() => ({
  render: vi.fn(),
  analyze: vi.fn(),
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
}));

vi.mock("../wasm/n64_toys.js", () => ({
  default: vi.fn(async () => undefined),
  Renderer: { init: vi.fn(async () => ({ render: wasm.render })) },
  analyze: wasm.analyze,
}));

import { Playground } from "./playground.svelte";
import type { TextureDeclaration } from "./texture-inputs";
import type { Toy } from "../toys/types";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function declaration(name: string, line = 1): TextureDeclaration {
  return { name, width: 1, height: 1, format: "RGBA16", line };
}

function pngFile(
  name: string,
  rgba: [number, number, number, number],
  padding = 0,
  type = "image/png",
): File {
  return new File(
    [PNG_SIGNATURE, new Uint8Array(rgba), new Uint8Array(padding)],
    name,
    { type },
  );
}

function pngBlob(rgba: [number, number, number, number]): Blob {
  return new Blob([PNG_SIGNATURE, new Uint8Array(rgba)], { type: "image/png" });
}

function toy(slug: string, source: string, textures: Toy["textures"]): Toy {
  return {
    slug,
    title: slug,
    description: `${slug} description`,
    visibility: "public",
    owner: { id: "author", displayName: "Ada Author" },
    thumbnailUrl: null,
    forkOf: null,
    isOwner: false,
    createdAt: "2026-07-22T12:00:00.000Z",
    schemaVersion: 1,
    microcode: "F3DEX2",
    source,
    textures,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  wasm.render.mockReturnValue({
    diags: [],
    // serde-wasm-bindgen serializes Rust `None` to `undefined`, not `null`, so a
    // clean render's error is `undefined`. Mirror that here so capture/publish
    // gating is tested against the real shape.
    error: undefined,
  });
  wasm.analyze.mockReturnValue({
    textures: [],
    references_time: false,
    diags: [],
  });
  let nextUrl = 1;
  wasm.createObjectURL.mockImplementation(() => `blob:${nextUrl++}`);

  const NativeURL = URL;
  class ObjectURL extends NativeURL {
    static createObjectURL = wasm.createObjectURL;
    static revokeObjectURL = wasm.revokeObjectURL;
  }
  vi.stubGlobal("URL", ObjectURL);

  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (blob: Blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const oversized = blob instanceof File && blob.name.includes("oversized");
      return {
        width: oversized ? 513 : 1,
        height: 1,
        rgba: bytes.slice(8, 12),
        close: vi.fn(),
      };
    }),
  );
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      #bitmap: { rgba: Uint8Array } | undefined;

      getContext() {
        return {
          drawImage: (bitmap: { rgba: Uint8Array }) => (this.#bitmap = bitmap),
          getImageData: () => ({
            data: new Uint8ClampedArray(this.#bitmap?.rgba ?? []),
          }),
        };
      }
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("Playground named texture lifecycle", () => {
  it("initializes without creating an implicit white texture", async () => {
    const playground = new Playground();
    const run = vi.spyOn(playground, "run");

    await playground.init({} as HTMLCanvasElement);

    expect(playground.textureSlots).toEqual([]);
    expect(wasm.createObjectURL).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("discovers exact names and reuses distinct immutable RGBA snapshots", async () => {
    wasm.analyze.mockReturnValue({
      textures: [declaration("grass"), declaration("mask", 2)],
      references_time: false,
      diags: [],
    });
    const playground = new Playground();
    await playground.init({} as HTMLCanvasElement);
    playground.source = "two named textures";
    playground.reconcileTextureDeclarations();

    await playground.loadTexture(
      "grass",
      pngFile("grass.png", [255, 0, 0, 255]),
    );
    await playground.loadTexture("mask", pngFile("mask.png", [0, 255, 0, 255]));

    expect(
      playground.textureSlots.map((slot) => slot.declaration.name),
    ).toEqual(["grass", "mask"]);
    expect(wasm.render).toHaveBeenLastCalledWith(
      playground.source,
      0,
      expect.arrayContaining([
        expect.objectContaining({
          name: "grass",
          rgba: expect.any(Uint8Array),
        }),
        expect.objectContaining({ name: "mask", rgba: expect.any(Uint8Array) }),
      ]),
    );
    const snapshots = wasm.render.mock.lastCall?.[2] as Array<{
      name: string;
      rgba: Uint8Array;
    }>;
    expect(snapshots.find((entry) => entry.name === "grass")?.rgba).toEqual(
      new Uint8Array([255, 0, 0, 255]),
    );
    expect(snapshots.find((entry) => entry.name === "mask")?.rgba).toEqual(
      new Uint8Array([0, 255, 0, 255]),
    );
    expect(snapshots[0].rgba).not.toBe(playground.textureSlots[0].asset?.rgba);
    playground.textureSlots[0].asset!.rgba[0] = 7;
    expect(snapshots[0].rgba[0]).toBe(255);
    playground.renderFrame(1);
    const nextSnapshots = wasm.render.mock.lastCall?.[2] as typeof snapshots;
    expect(nextSnapshots).toBe(snapshots);
    expect(nextSnapshots[0].rgba).toBe(snapshots[0].rgba);
    expect(nextSnapshots[0].rgba[0]).toBe(255);
    expect(playground.textureSlots[0].asset?.png).toBeInstanceOf(File);
  });

  it("retains the previous asset when replacement validation fails", async () => {
    wasm.analyze.mockReturnValue({
      textures: [declaration("grass")],
      references_time: false,
      diags: [],
    });
    const playground = new Playground();
    playground.source = "Texture grass";
    playground.reconcileTextureDeclarations();
    await playground.loadTexture(
      "grass",
      pngFile("grass.png", [255, 0, 0, 255]),
      {
        run: false,
      },
    );
    const previous = playground.textureSlots[0].asset;

    await expect(
      playground.loadTexture(
        "grass",
        pngFile("not-png.jpg", [0, 0, 0, 255], 0, "image/jpeg"),
      ),
    ).rejects.toThrow("PNG");

    expect(playground.textureSlots[0].asset).toBe(previous);
    expect(playground.textureSlots[0].uploadError).toContain("PNG");
    expect(wasm.revokeObjectURL).not.toHaveBeenCalledWith(previous?.previewUrl);
  });

  it("does not commit a decoded upload after its declaration changes", async () => {
    wasm.analyze.mockReturnValue({
      textures: [declaration("grass")],
      references_time: false,
      diags: [],
    });
    let finishDecode!: (bitmap: ImageBitmap) => void;
    vi.mocked(createImageBitmap).mockImplementationOnce(
      () => new Promise<ImageBitmap>((resolve) => (finishDecode = resolve)),
    );
    const playground = new Playground();
    playground.source = "first dimensions";
    playground.reconcileTextureDeclarations();
    const loading = playground.loadTexture(
      "grass",
      pngFile("grass.png", [255, 0, 0, 255]),
      {
        run: false,
      },
    );
    await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledOnce());

    wasm.analyze.mockReturnValue({
      textures: [{ ...declaration("grass"), width: 2 }],
      references_time: false,
      diags: [],
    });
    playground.source = "changed dimensions";
    playground.reconcileTextureDeclarations();
    finishDecode({
      width: 1,
      height: 1,
      rgba: new Uint8Array([255, 0, 0, 255]),
      close: vi.fn(),
    } as unknown as ImageBitmap);

    await expect(loading).rejects.toThrow("declares 2x1");
    expect(playground.textureSlots[0].asset).toBeUndefined();
  });

  it("revokes previews on rename, removal, replacement, draft reset, and teardown", async () => {
    wasm.analyze.mockReturnValue({
      textures: [declaration("grass"), declaration("mask", 2)],
      references_time: false,
      diags: [],
    });
    const playground = new Playground();
    playground.source = "first source";
    playground.reconcileTextureDeclarations();
    await playground.loadTexture(
      "grass",
      pngFile("grass.png", [255, 0, 0, 255]),
      {
        run: false,
      },
    );
    await playground.loadTexture(
      "mask",
      pngFile("mask.png", [0, 255, 0, 255]),
      {
        run: false,
      },
    );
    const grassUrl = playground.textureSlots[0].asset!.previewUrl;
    const maskUrl = playground.textureSlots[1].asset!.previewUrl;

    await playground.loadTexture(
      "mask",
      pngFile("mask-2.png", [0, 0, 255, 255]),
      {
        run: false,
      },
    );
    const replacementUrl = playground.textureSlots[1].asset!.previewUrl;
    expect(wasm.revokeObjectURL).toHaveBeenCalledWith(maskUrl);

    wasm.analyze.mockReturnValue({
      textures: [declaration("ground"), declaration("mask", 2)],
      references_time: false,
      diags: [],
    });
    playground.source = "renamed source";
    playground.reconcileTextureDeclarations();
    expect(wasm.revokeObjectURL).toHaveBeenCalledWith(grassUrl);

    playground.removeTexture("mask");
    expect(wasm.revokeObjectURL).toHaveBeenCalledWith(replacementUrl);

    await playground.loadTexture(
      "mask",
      pngFile("mask-3.png", [1, 2, 3, 255]),
      {
        run: false,
      },
    );
    const teardownUrl = playground.textureSlots[1].asset!.previewUrl;
    playground.teardown();
    expect(wasm.revokeObjectURL).toHaveBeenCalledWith(teardownUrl);

    playground.textureSlots = [
      {
        declaration: declaration("mask"),
        asset: {
          previewUrl: "blob:draft",
          png: pngBlob([1, 1, 1, 255]),
          rgba: new Uint8Array([1, 1, 1, 255]),
          width: 1,
          height: 1,
        },
      },
    ];
    await playground.newDraft();
    expect(wasm.revokeObjectURL).toHaveBeenCalledWith("blob:draft");
    expect(playground.textureSlots).toEqual([]);
  });
});

describe("Playground PNG validation", () => {
  it("rejects bad signatures, per-file size, and decoded dimensions", async () => {
    wasm.analyze.mockReturnValue({
      textures: [declaration("tex")],
      references_time: false,
      diags: [],
    });
    const playground = new Playground();
    playground.source = "Texture tex";
    playground.reconcileTextureDeclarations();

    const badSignature = new File([new Uint8Array(12)], "bad.png", {
      type: "image/png",
    });
    await expect(playground.loadTexture("tex", badSignature)).rejects.toThrow(
      "signature",
    );
    await expect(
      playground.loadTexture(
        "tex",
        pngFile("large.png", [1, 2, 3, 255], 1024 * 1024),
      ),
    ).rejects.toThrow("1 MiB");
    await expect(
      playground.loadTexture("tex", pngFile("oversized.png", [1, 2, 3, 255])),
    ).rejects.toThrow("512x512");
    expect(playground.textureSlots[0].asset).toBeUndefined();
  });

  it("enforces the aggregate original-file limit before committing", async () => {
    const names = ["a", "b", "c", "d", "e"];
    wasm.analyze.mockReturnValue({
      textures: names.map((name, index) => declaration(name, index + 1)),
      references_time: false,
      diags: [],
    });
    const playground = new Playground();
    playground.source = "five textures";
    playground.reconcileTextureDeclarations();
    const padding = 900 * 1024;
    for (const name of names.slice(0, 4)) {
      await playground.loadTexture(
        name,
        pngFile(`${name}.png`, [1, 2, 3, 255], padding),
        {
          run: false,
        },
      );
    }

    await expect(
      playground.loadTexture("e", pngFile("e.png", [1, 2, 3, 255], padding), {
        run: false,
      }),
    ).rejects.toThrow("4 MiB");
    expect(playground.textureSlots[4].asset).toBeUndefined();
  });
});

describe("Playground toy transitions", () => {
  it("keeps internal bin fixture decoding for exact named toy assets", async () => {
    wasm.analyze.mockReturnValue({
      textures: [declaration("tex")],
      references_time: false,
      diags: [],
    });
    const bytes = new Uint8Array(12);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 1, true);
    view.setUint32(4, 1, true);
    bytes.set([9, 8, 7, 255], 8);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, arrayBuffer: async () => bytes.buffer }),
    );
    const playground = new Playground();

    await playground.loadToy(
      toy("fixture", "fixture source", [{ name: "tex", url: "tex.bin" }]),
    );

    expect(playground.textureSlots[0].declaration.name).toBe("tex");
    expect(playground.textureSlots[0].asset?.rgba).toEqual(
      new Uint8Array([9, 8, 7, 255]),
    );
  });

  it("normalizes duplicate toy declarations using the first dimensions", async () => {
    const first = declaration("tex");
    const duplicate = { ...first, width: 2, line: 2 };
    const duplicateDiag = {
      line: 2,
      msg: "duplicate texture declaration: tex",
    };
    wasm.analyze.mockReturnValue({
      textures: [first, duplicate],
      references_time: false,
      diags: [duplicateDiag],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => pngBlob([9, 8, 7, 255]),
      }),
    );
    const playground = new Playground();

    await playground.loadToy(
      toy("duplicate", "duplicate source", [{ name: "tex", url: "tex.png" }]),
    );

    expect(playground.textureSlots).toHaveLength(1);
    expect(playground.textureSlots[0].declaration).toEqual(first);
    expect(playground.textureSlots[0].asset?.rgba).toEqual(
      new Uint8Array([9, 8, 7, 255]),
    );
    expect(playground.declarationDiags).toEqual([duplicateDiag]);
  });

  it("keeps successful textures when another saved texture returns 404", async () => {
    wasm.analyze.mockReturnValue({
      textures: [declaration("missing"), declaration("loaded", 2)],
      references_time: false,
      diags: [],
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: "Not Found",
        })
        .mockResolvedValueOnce({
          ok: true,
          blob: async () => pngBlob([9, 8, 7, 255]),
        }),
    );
    const playground = new Playground();
    await playground.init({} as HTMLCanvasElement);

    await playground.loadToy(
      toy("partial", "partial source", [
        { name: "missing", url: "/missing.png" },
        { name: "loaded", url: "/loaded.png" },
      ]),
    );

    expect(playground.source).toBe("partial source");
    expect(playground.title).toBe("partial");
    expect(playground.textureSlots[0]).toMatchObject({
      declaration: declaration("missing"),
      error: expect.stringContaining("404"),
    });
    expect(playground.textureSlots[0].asset).toBeUndefined();
    expect(playground.textureSlots[1].error).toBeUndefined();
    expect(playground.textureSlots[1].asset?.rgba).toEqual(
      new Uint8Array([9, 8, 7, 255]),
    );
    expect(wasm.render).toHaveBeenCalledWith(
      "partial source",
      0,
      expect.arrayContaining([expect.objectContaining({ name: "loaded" })]),
    );
  });

  it("does not commit stale assets from an aborted multi-texture transition", async () => {
    wasm.analyze.mockImplementation((source: string) => ({
      textures:
        source === "stale source"
          ? [declaration("a"), declaration("b", 2)]
          : [],
      references_time: false,
      diags: [],
    }));
    let resolveSecond!: (response: {
      ok: boolean;
      blob: () => Promise<Blob>;
    }) => void;
    const second = new Promise<{
      ok: boolean;
      blob: () => Promise<Blob>;
    }>((resolve) => {
      resolveSecond = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => pngBlob([255, 0, 0, 255]),
      })
      .mockReturnValueOnce(second);
    vi.stubGlobal("fetch", fetchMock);
    const playground = new Playground();
    const staleController = new AbortController();
    const staleLoad = playground.loadToy(
      toy("stale", "stale source", [
        { name: "a", url: "a.png" },
        { name: "b", url: "b.png" },
      ]),
      { signal: staleController.signal },
    );
    await vi.waitFor(() => expect(wasm.createObjectURL).toHaveBeenCalledOnce());

    staleController.abort();
    await playground.loadToy(toy("current", "current source", []));
    resolveSecond({
      ok: true,
      blob: async () => pngBlob([0, 255, 0, 255]),
    });
    await expect(staleLoad).rejects.toMatchObject({ name: "AbortError" });

    expect(playground.source).toBe("current source");
    expect(playground.title).toBe("current");
    expect(playground.textureSlots).toEqual([]);
    expect(wasm.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });
});

describe("Playground capture rendering", () => {
  it("returns false without a renderer", () => {
    const playground = new Playground();

    expect(playground.renderForCapture()).toBe(false);
    expect(wasm.render).not.toHaveBeenCalled();
  });

  it("synchronously renders the exact current source and time", async () => {
    const playground = new Playground();
    await playground.init({} as HTMLCanvasElement);
    playground.source = "current capture source";
    playground.time = 2.5;

    expect(playground.renderForCapture()).toBe(true);
    expect(wasm.render).toHaveBeenLastCalledWith(
      "current capture source",
      2.5,
      [],
    );
  });

  it.each([
    {
      result: { diags: [], error: "render failed" },
    },
    {
      result: {
        diags: [{ line: 1, msg: "render diagnostic" }],
        error: null,
      },
    },
  ])("returns false for an unclean capture render", async ({ result }) => {
    wasm.render.mockReturnValue(result);
    const playground = new Playground();
    await playground.init({} as HTMLCanvasElement);

    expect(playground.renderForCapture()).toBe(false);
  });
});

describe("Playground animation analysis", () => {
  it("sets isAnimated from the analysis pass, not the render result", async () => {
    wasm.analyze.mockReturnValue({
      textures: [],
      references_time: true,
      diags: [],
    });
    const playground = new Playground();
    await playground.init({} as HTMLCanvasElement);
    playground.source = "update { guRotate(model, time * 90, 0, 0, 1) }";
    playground.reconcileTextureDeclarations();

    expect(playground.isAnimated).toBe(true);
  });

  it("clears isAnimated when the source stops referencing time", async () => {
    wasm.analyze.mockReturnValue({
      textures: [],
      references_time: true,
      diags: [],
    });
    const playground = new Playground();
    await playground.init({} as HTMLCanvasElement);
    playground.reconcileTextureDeclarations();
    expect(playground.isAnimated).toBe(true);

    wasm.analyze.mockReturnValue({
      textures: [],
      references_time: false,
      diags: [],
    });
    playground.reconcileTextureDeclarations();

    expect(playground.isAnimated).toBe(false);
  });

  it("keeps isAnimated stable across a failed render", async () => {
    wasm.analyze.mockReturnValue({
      textures: [],
      references_time: true,
      diags: [],
    });
    const playground = new Playground();
    await playground.init({} as HTMLCanvasElement);
    playground.reconcileTextureDeclarations();
    expect(playground.isAnimated).toBe(true);

    // A failing render must no longer touch animation state.
    wasm.render.mockReturnValue({ diags: [], error: "render failed" });
    playground.run();

    expect(playground.isAnimated).toBe(true);
  });

  it("re-analyzes on source assignment without an explicit reconcile call", async () => {
    wasm.analyze.mockReturnValue({
      textures: [],
      references_time: true,
      diags: [],
    });
    const playground = new Playground();
    await playground.init({} as HTMLCanvasElement);

    playground.source = "update { guRotate(model, time * 90, 0, 0, 1) }";

    expect(playground.isAnimated).toBe(true); // no reconcileTextureDeclarations() call needed
  });

  it("analyzes a source assigned before init once init completes", async () => {
    wasm.analyze.mockReturnValue({
      textures: [],
      references_time: true,
      diags: [],
    });
    const playground = new Playground();
    playground.source = "update { guRotate(model, time * 90, 0, 0, 1) }"; // pre-init: guard skips
    expect(playground.isAnimated).toBe(false);

    await playground.init({} as HTMLCanvasElement); // catch-up block analyzes the pending source

    expect(playground.isAnimated).toBe(true);
  });
});

describe("Playground diagnostics", () => {
  it("blocks rendering and merges declaration then product-limit diagnostics", async () => {
    wasm.analyze.mockReturnValue({
      textures: Array.from({ length: 9 }, (_, index) =>
        declaration(`tex${index}`, index + 1),
      ),
      references_time: false,
      diags: [{ line: 3, msg: "declaration diagnostic" }],
    });
    const playground = new Playground();
    await playground.init({} as HTMLCanvasElement);
    playground.source = "too many textures";
    playground.reconcileTextureDeclarations();

    playground.renderFrame(0);

    expect(wasm.render).not.toHaveBeenCalled();
    expect(playground.diags.map((diag) => diag.msg)).toEqual([
      "declaration diagnostic",
      "a toy supports at most 8 textures",
    ]);
    expect(playground.status).toBe("2 diagnostic(s)");
    expect(playground.errored).toBe(true);
  });

  it("blocks rendering for an oversized declaration", async () => {
    wasm.analyze.mockReturnValue({
      textures: [{ ...declaration("huge"), width: 513 }],
      references_time: false,
      diags: [],
    });
    const playground = new Playground();
    await playground.init({} as HTMLCanvasElement);
    playground.source = "oversized texture";
    playground.reconcileTextureDeclarations();

    playground.renderFrame(0);

    expect(wasm.render).not.toHaveBeenCalled();
    expect(playground.diags).toEqual([
      { line: 0, msg: "huge exceeds 512x512" },
    ]);
    expect(playground.status).toBe("1 diagnostic(s)");
    expect(playground.errored).toBe(true);
  });

  it("deduplicates an exact declaration and renderer diagnostic", async () => {
    const duplicate = { line: 3, msg: "same diagnostic" };
    wasm.analyze.mockReturnValue({
      textures: [],
      references_time: false,
      diags: [duplicate],
    });
    wasm.render.mockReturnValue({
      diags: [duplicate, { line: 4, msg: "renderer only" }],
      error: null,
    });
    const playground = new Playground();
    await playground.init({} as HTMLCanvasElement);
    playground.source = "duplicate diagnostic";
    playground.reconcileTextureDeclarations();

    playground.renderFrame(0);

    expect(wasm.render).toHaveBeenCalledOnce();
    expect(playground.diags).toEqual([
      duplicate,
      { line: 4, msg: "renderer only" },
    ]);
  });
});
