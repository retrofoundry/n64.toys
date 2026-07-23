import { describe, expect, it, vi } from "vitest";
import type { ToyRepository } from "../toys/repository";
import type { Toy } from "../toys/types";
import { resolveEditorRoute, routeFromHash } from "./route";

const toy: Toy = {
  slug: "future-toy",
  title: "Future toy",
  description: "A published toy",
  visibility: "public",
  owner: { id: "author", displayName: "Ada Author" },
  thumbnailUrl: null,
  forkOf: null,
  isOwner: false,
  createdAt: "2026-07-22T12:00:00.000Z",
  schemaVersion: 1,
  microcode: "F3DEX2",
  source: "gsSPEndDisplayList(),",
  textures: [],
};

function repositoryReturning(record: Toy | null) {
  return {
    list: vi.fn(async (page = 1) => ({ toys: [], page, pageCount: 0 })),
    listMine: vi.fn(async (page = 1) => ({ toys: [], page, pageCount: 0 })),
    listUserPublic: vi.fn(async (userId, page = 1) => ({
      owner: { id: userId, displayName: "" },
      toys: [],
      page,
      pageCount: 0,
    })),
    get: vi.fn(async () => record),
  } satisfies ToyRepository;
}

describe("routeFromHash", () => {
  it.each(["", "#", "#unknown", "#new/extra"])(
    "treats %j as browse",
    (hash) => {
      expect(routeFromHash(hash)).toEqual({ kind: "browse" });
    },
  );

  it("recognizes the blank editor route", () => {
    expect(routeFromHash("#new")).toEqual({ kind: "new" });
  });

  it("recognizes the current user's toys route", () => {
    expect(routeFromHash("#mine")).toEqual({ kind: "mine" });
  });

  it.each(["#u=author123", "#u=ABC987"])(
    "recognizes a safe public user route in %j",
    (hash) => {
      expect(routeFromHash(hash)).toEqual({ kind: "user", id: hash.slice(3) });
    },
  );

  it.each([
    "#u=",
    "#u=user-name",
    "#u=user_name",
    "#u=../user",
    "#u=user%20name",
  ])("rejects an unsafe or empty public user id in %j", (hash) => {
    expect(routeFromHash(hash)).toEqual({ kind: "browse" });
  });

  it.each(["#t=future-toy", "#t=toy64"])(
    "recognizes a safe toy slug in %j",
    (hash) => {
      expect(routeFromHash(hash)).toEqual({ kind: "toy", slug: hash.slice(3) });
    },
  );

  it.each([
    "#t=",
    "#t=UPPER",
    "#t=-leading",
    "#t=trailing-",
    "#t=two--hyphens",
    "#t=../toy",
    "#t=toy%20name",
  ])("rejects an unsafe or empty toy slug in %j", (hash) => {
    expect(routeFromHash(hash)).toEqual({ kind: "browse" });
  });
});

describe("resolveEditorRoute", () => {
  it("resolves new to a blank draft without consulting the repository", async () => {
    const repository = repositoryReturning(toy);

    await expect(
      resolveEditorRoute({ kind: "new" }, repository),
    ).resolves.toEqual({ kind: "new" });
    expect(repository.get).not.toHaveBeenCalled();
  });

  it("looks up a future toy route exactly once", async () => {
    const repository = repositoryReturning(toy);

    await expect(
      resolveEditorRoute({ kind: "toy", slug: toy.slug }, repository),
    ).resolves.toEqual({
      kind: "toy",
      toy,
    });
    expect(repository.get).toHaveBeenCalledOnce();
    expect(repository.get).toHaveBeenCalledWith(toy.slug);
  });

  it("returns to browse when a future toy does not exist", async () => {
    const repository = repositoryReturning(null);

    await expect(
      resolveEditorRoute({ kind: "toy", slug: "missing" }, repository),
    ).resolves.toEqual({ kind: "browse" });
    expect(repository.get).toHaveBeenCalledOnce();
  });
});
