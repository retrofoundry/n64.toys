import { describe, expect, it } from "vitest";

import { generateSlug } from "./slug.js";

describe("generateSlug", () => {
  it("generates safe 16-character slugs", () => {
    const slug = generateSlug();

    expect(slug).toHaveLength(16);
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("generates unique slugs across many draws", () => {
    const slugs = new Set(
      Array.from({ length: 2_000 }, () => generateSlug()),
    );

    expect(slugs.size).toBe(2_000);
  });
});
