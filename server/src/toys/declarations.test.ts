import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

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

  it("parses a hexadecimal texture width", () => {
    expect(
      parseTextureDeclarations("Texture grass = { 0x20, 16, RGBA16 }"),
    ).toEqual([{ name: "grass", width: 32, height: 16, format: "RGBA16" }]);
  });

  // Computed specifier: the glue lives in web-app, which the server Docker build never copies.
  const wasmDir = new URL("../../../web-app/src/wasm/", import.meta.url);
  let analyze: (source: string) => { textures: unknown[] };

  beforeAll(async () => {
    const glue = await import(fileURLToPath(new URL("n64_toys.js", wasmDir)));
    glue.initSync({
      module: readFileSync(new URL("n64_toys_bg.wasm", wasmDir)),
    });
    analyze = glue.analyze;
  });

  it.each([
    ["decimal", "Texture grass = { 32, 16, RGBA16 }"],
    ["lowercase hex prefix", "Texture grass = { 0x20, 0x10, RGBA16 }"],
    ["uppercase hex prefix", "Texture grass = { 0X20, 0X10, RGBA16 }"],
    ["mixed-case hex digits", "Texture grass = { 0xaB, 0XcD, RGBA16 }"],
    [
      "extra whitespace",
      "  Texture   grass  =  {   32  ,   16  ,   RGBA16   }  ",
    ],
    ["tabs", "Texture\tgrass = {\t32\t,\t16\t,\tRGBA16\t}"],
    ["trailing comment", "Texture grass = { 32, 16, RGBA16 } // grass texture"],
    ...["RGBA16", "RGBA32", "I4", "I8", "IA4", "IA8", "IA16", "CI4", "CI8"].map(
      (format) => [format, `Texture grass = { 32, 16, ${format} }`],
    ),
    [
      "duplicate name",
      "Texture grass = { 8, 8, I8 }\nTexture grass = { 16, 16, RGBA16 }",
    ],
  ])("matches wasm analysis for %s", (_name, source) => {
    const textures = analyze(source).textures as {
      name: string;
      width: number;
      height: number;
      format: string;
      line: number;
    }[];
    expect(parseTextureDeclarations(source)).toEqual(
      textures.map(({ name, width, height, format }) => ({
        name,
        width,
        height,
        format,
      })),
    );
    expect(textures.length).toBeGreaterThan(0);
  });
});
