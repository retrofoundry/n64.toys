import { describe, expect, it } from "vitest";
import { ApiToyRepository } from "./api-repository";
import { repository } from "./repository";

describe("production toy repository", () => {
  it("uses the HTTP-backed repository", () => {
    expect(repository).toBeInstanceOf(ApiToyRepository);
  });
});
