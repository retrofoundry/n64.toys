import { describe, expect, it } from "vitest";

import { codePointLength, utf8ByteLength } from "./limits.js";

describe("text length helpers", () => {
  it("measures UTF-8 bytes rather than UTF-16 code units", () => {
    const astralCharacter = "😀";

    expect(utf8ByteLength(astralCharacter)).toBe(4);
    expect(utf8ByteLength(astralCharacter)).toBeGreaterThan(
      astralCharacter.length,
    );
  });

  it("counts Unicode code points", () => {
    expect(codePointLength("A😀B")).toBe(3);
  });
});
