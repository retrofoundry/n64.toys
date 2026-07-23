import { describe, expect, it } from "vitest";
import {
  reconcileTextureSlots,
  validateTextureLimits,
  type TextureAsset,
} from "./texture-inputs";

const asset: TextureAsset = {
  previewUrl: "blob:grass",
  png: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
  rgba: new Uint8Array([255, 0, 0, 255]),
  width: 1,
  height: 1,
};

describe("reconcileTextureSlots", () => {
  it("retains by name and orphans a rename", () => {
    const previous = [
      {
        declaration: {
          name: "grass",
          width: 1,
          height: 1,
          format: "RGBA16",
          line: 1,
        },
        asset,
      },
    ];
    const next = [
      { name: "ground", width: 1, height: 1, format: "RGBA16", line: 1 },
    ];

    const result = reconcileTextureSlots(previous, next);

    expect(result.slots).toEqual([
      { declaration: next[0], asset: undefined, error: undefined },
    ]);
    expect(result.orphaned).toEqual([asset]);
  });

  it("keeps a same-name png but marks changed dimensions", () => {
    const previous = [
      {
        declaration: {
          name: "grass",
          width: 1,
          height: 1,
          format: "RGBA16",
          line: 1,
        },
        asset,
      },
    ];
    const next = [
      { name: "grass", width: 2, height: 1, format: "IA8", line: 4 },
    ];

    const result = reconcileTextureSlots(previous, next);

    expect(result.slots[0].asset).toBe(asset);
    expect(result.slots[0].error).toContain("declares 2x1 but image is 1x1");
    expect(result.orphaned).toEqual([]);
  });

  it("emits one slot for duplicate names and orphans the unused asset", () => {
    const duplicateAsset: TextureAsset = {
      ...asset,
      previewUrl: "blob:duplicate",
    };
    const first = {
      name: "grass",
      width: 1,
      height: 1,
      format: "RGBA16",
      line: 1,
    };
    const duplicate = { ...first, format: "IA8", line: 2 };
    const previous = [
      { declaration: first, asset },
      { declaration: duplicate, asset: duplicateAsset },
    ];

    const result = reconcileTextureSlots(previous, [first, duplicate]);

    expect(result.slots).toEqual([
      { declaration: first, asset, error: undefined },
    ]);
    expect(result.orphaned).toEqual([duplicateAsset]);
  });
});

describe("validateTextureLimits", () => {
  it("enforces eight declarations", () => {
    const declarations = Array.from({ length: 9 }, (_, index) => ({
      name: "tex" + index,
      width: 1,
      height: 1,
      format: "RGBA16",
      line: index + 1,
    }));

    expect(validateTextureLimits(declarations)).toContain("at most 8 textures");
  });
});
