import { describe, expect, it } from "vitest";

import type { Result, SaveManifest } from "./dto.js";
import { LIMITS } from "./limits.js";
import { parseManifest } from "./manifest.js";

function validManifest(): SaveManifest {
  return {
    title: "Spinning cube",
    description: "A small textured N64 toy.",
    source: "Gfx display_list[] = { gsSPEndDisplayList() };",
    visibility: "private",
    schemaVersion: 1,
    microcode: "F3DEX2",
    textures: [
      { name: "checker", part: "texture-checker" },
      { name: "noise", part: "texture-noise" },
    ],
  };
}

function expectValidation(result: Result<SaveManifest>): void {
  expect(result).toEqual({
    ok: false,
    error: {
      kind: "validation",
      message: expect.any(String),
    },
  });
}

describe("parseManifest", () => {
  it("accepts a well-formed manifest", () => {
    const manifest = validManifest();

    expect(parseManifest(manifest)).toEqual({ ok: true, value: manifest });
  });

  it("rejects a non-object manifest", () => {
    expectValidation(parseManifest(null));
  });

  it("rejects a non-string title", () => {
    expectValidation(parseManifest({ ...validManifest(), title: 42 }));
  });

  it("rejects a title over the Unicode code-point limit", () => {
    expectValidation(
      parseManifest({
        ...validManifest(),
        title: "😀".repeat(LIMITS.maxTitleCodePoints + 1),
      }),
    );
  });

  it("accepts astral characters up to the title code-point limit", () => {
    const manifest = {
      ...validManifest(),
      title: "😀".repeat(LIMITS.maxTitleCodePoints),
    };

    expect(parseManifest(manifest)).toEqual({ ok: true, value: manifest });
  });

  it("rejects a non-string description", () => {
    expectValidation(
      parseManifest({ ...validManifest(), description: false }),
    );
  });

  it("rejects a description over the Unicode code-point limit", () => {
    expectValidation(
      parseManifest({
        ...validManifest(),
        description: "😀".repeat(LIMITS.maxDescriptionCodePoints + 1),
      }),
    );
  });

  it("accepts astral characters up to the description code-point limit", () => {
    const manifest = {
      ...validManifest(),
      description: "😀".repeat(LIMITS.maxDescriptionCodePoints),
    };

    expect(parseManifest(manifest)).toEqual({ ok: true, value: manifest });
  });

  it("rejects a non-string source", () => {
    expectValidation(parseManifest({ ...validManifest(), source: [] }));
  });

  it("rejects source over the UTF-8 byte limit", () => {
    expectValidation(
      parseManifest({
        ...validManifest(),
        source: "😀".repeat(LIMITS.maxSourceBytes / 4 + 1),
      }),
    );
  });

  it("rejects visibility outside the toy visibility enum", () => {
    expectValidation(
      parseManifest({ ...validManifest(), visibility: "secret" }),
    );
  });

  it("rejects schema versions other than 1", () => {
    expectValidation(
      parseManifest({ ...validManifest(), schemaVersion: 2 }),
    );
  });

  it("rejects a non-string microcode", () => {
    expectValidation(
      parseManifest({ ...validManifest(), microcode: null }),
    );
  });

  it("rejects a non-array textures field", () => {
    expectValidation(
      parseManifest({ ...validManifest(), textures: "checker" }),
    );
  });

  it("rejects more than the maximum texture count", () => {
    const textures = Array.from(
      { length: LIMITS.maxTextures + 1 },
      (_, index) => ({ name: `texture${index}`, part: `part${index}` }),
    );

    expectValidation(parseManifest({ ...validManifest(), textures }));
  });

  it("rejects a non-object texture entry", () => {
    expectValidation(
      parseManifest({ ...validManifest(), textures: [null] }),
    );
  });

  it("rejects a texture with a non-string name", () => {
    expectValidation(
      parseManifest({
        ...validManifest(),
        textures: [{ name: 7, part: "texture-seven" }],
      }),
    );
  });

  it("rejects a texture with a non-string part", () => {
    expectValidation(
      parseManifest({
        ...validManifest(),
        textures: [{ name: "checker", part: 7 }],
      }),
    );
  });

  it("rejects duplicate texture names", () => {
    expectValidation(
      parseManifest({
        ...validManifest(),
        textures: [
          { name: "checker", part: "part-one" },
          { name: "checker", part: "part-two" },
        ],
      }),
    );
  });

  it("rejects duplicate texture parts", () => {
    expectValidation(
      parseManifest({
        ...validManifest(),
        textures: [
          { name: "checker", part: "shared-part" },
          { name: "noise", part: "shared-part" },
        ],
      }),
    );
  });

  it("accepts an optional string forkOfSlug", () => {
    const manifest = { ...validManifest(), forkOfSlug: "parent-slug" };

    expect(parseManifest(manifest)).toEqual({ ok: true, value: manifest });
  });

  it("rejects a non-string forkOfSlug", () => {
    expectValidation(
      parseManifest({ ...validManifest(), forkOfSlug: 123 }),
    );
  });

  it("accepts an optional string thumbnailPart", () => {
    const manifest = { ...validManifest(), thumbnailPart: "thumbnail" };

    expect(parseManifest(manifest)).toEqual({ ok: true, value: manifest });
  });

  it("rejects a non-string thumbnailPart", () => {
    expectValidation(
      parseManifest({ ...validManifest(), thumbnailPart: {} }),
    );
  });
});
