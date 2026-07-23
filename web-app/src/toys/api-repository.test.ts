import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiToyRepository } from "./api-repository";
import type { Toy, ToyList, ToySummary, UserToys } from "./types";

const summary: ToySummary = {
  slug: "quiet-cube",
  title: "Quiet cube",
  description: "A small cube",
  visibility: "public",
  microcode: "F3DEX2",
  owner: { id: "user-1", displayName: "Ada Hopper" },
  thumbnailUrl: "https://n64.toys/api/toys/quiet-cube/thumbnail",
  forkOf: null,
  isOwner: false,
  createdAt: "2026-07-22T12:00:00.000Z",
};

const detail: Toy = {
  ...summary,
  source: "gsSPEndDisplayList(),",
  schemaVersion: 1,
  microcode: "F3DEX2",
  textures: [
    {
      name: "brick",
      width: 32,
      height: 32,
      format: "RGBA16",
      url: "https://n64.toys/api/toys/quiet-cube/textures/brick",
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("ApiToyRepository", () => {
  it("lists the requested public-toy page with credentials", async () => {
    const payload: ToyList = { toys: [summary], page: 2, pageCount: 4 };
    const fetch = vi.fn(async () => Response.json(payload));
    vi.stubGlobal("fetch", fetch);

    await expect(new ApiToyRepository().list(2)).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith("/api/toys?page=2", {
      credentials: "include",
    });
  });

  it("lists the requested current-user toy page with credentials", async () => {
    const mine = { ...summary, visibility: "private", isOwner: true } as const;
    const payload: ToyList = { toys: [mine], page: 3, pageCount: 5 };
    const fetch = vi.fn(async () => Response.json(payload));
    vi.stubGlobal("fetch", fetch);

    await expect(new ApiToyRepository().listMine(3)).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith("/api/toys/mine?page=3", {
      credentials: "include",
    });
  });

  it("lists a user's requested public-toy page with credentials", async () => {
    const payload: UserToys = {
      owner: summary.owner,
      toys: [summary],
      page: 2,
      pageCount: 4,
    };
    const fetch = vi.fn(async () => Response.json(payload));
    vi.stubGlobal("fetch", fetch);

    await expect(
      new ApiToyRepository().listUserPublic("author/id", 2),
    ).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith(
      "/api/users/author%2Fid/toys?page=2",
      { credentials: "include" },
    );
  });

  it("rejects a missing public user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    await expect(
      new ApiToyRepository().listUserPublic("missing"),
    ).rejects.toThrow("status 404");
  });

  it("gets a toy detail with its asset URLs", async () => {
    const fetch = vi.fn(async () => Response.json(detail));
    vi.stubGlobal("fetch", fetch);

    await expect(new ApiToyRepository().get("quiet-cube")).resolves.toEqual(
      detail,
    );
    expect(fetch).toHaveBeenCalledWith("/api/toys/quiet-cube", {
      credentials: "include",
    });
  });

  it("returns null for a missing or inaccessible toy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    await expect(new ApiToyRepository().get("missing")).resolves.toBeNull();
  });
});
