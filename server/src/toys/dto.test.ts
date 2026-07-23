import { describe, expect, it } from "vitest";

import { err, isToyVisibility, ok } from "./dto.js";

describe("toy DTO helpers", () => {
  it("recognizes toy visibility values", () => {
    expect(isToyVisibility("public")).toBe(true);
    expect(isToyVisibility("secret")).toBe(false);
    expect(isToyVisibility(3)).toBe(false);
  });

  it("creates successful results", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it("creates error results", () => {
    expect(err("quota", "too many")).toEqual({
      ok: false,
      error: { kind: "quota", message: "too many" },
    });
  });
});
