import { describe, expect, it } from "vitest";

import { parseTextureDeclarations } from "./declarations.js";

describe("parseTextureDeclarations", () => {
  it("extracts multiple declarations in source order", () => {
    const source = [
      "Texture grass = { 32, 16, RGBA16 }",
      "Texture sky_2={128,64,I8}",
    ].join("\n");

    expect(parseTextureDeclarations(source)).toEqual([
      { name: "grass", width: 32, height: 16, format: "RGBA16" },
      { name: "sky_2", width: 128, height: 64, format: "I8" },
    ]);
  });

  it("ignores invalid and unrelated lines interleaved with declarations", () => {
    const source = [
      "Gfx display_list[] = {",
      "Texture valid = { 8, 4, IA8 }",
      "Texture 2invalid = { 8, 4, IA8 }",
      "Texture negative = { -8, 4, IA8 }",
      "Texture bad_format = { 8, 4, IA_8 }",
      "  gsDPPipeSync(),",
      "Texture alsoValid = { 1, 2, RGBA32 } // trailing text is tolerated",
      "};",
    ].join("\n");

    expect(parseTextureDeclarations(source)).toEqual([
      { name: "valid", width: 8, height: 4, format: "IA8" },
      {
        name: "alsoValid",
        width: 1,
        height: 2,
        format: "RGBA32",
      },
    ]);
  });

  it("returns duplicate names for the caller to reject", () => {
    const source = [
      "Texture repeated = { 8, 8, I8 }",
      "Texture repeated = { 16, 16, RGBA16 }",
    ].join("\n");

    expect(parseTextureDeclarations(source)).toEqual([
      { name: "repeated", width: 8, height: 8, format: "I8" },
      {
        name: "repeated",
        width: 16,
        height: 16,
        format: "RGBA16",
      },
    ]);
  });

  it("stays aligned with wasm textureDeclarations for representative toy source", () => {
    const representativeToySource = `
Texture checker = { 32, 32, RGBA16 }
Texture intensity_map = { 64, 16, I8 }

Gfx display_list[] = {
  gsDPSetTextureImage(G_IM_FMT_RGBA, G_IM_SIZ_16b, 32, checker),
  gsDPLoadTextureBlock(intensity_map, G_IM_FMT_I, G_IM_SIZ_8b, 64, 16, 0,
    G_TX_WRAP, G_TX_WRAP, 6, 4, G_TX_NOLOD, G_TX_NOLOD),
  gsSPEndDisplayList(),
};`;

    // This hard-coded set must match the Rust/wasm textureDeclarations output
    // for the exact source above; update both sides together if the grammar moves.
    expect(parseTextureDeclarations(representativeToySource)).toEqual([
      {
        name: "checker",
        width: 32,
        height: 32,
        format: "RGBA16",
      },
      {
        name: "intensity_map",
        width: 64,
        height: 16,
        format: "I8",
      },
    ]);
  });
});
