import { describe, expect, it, vi } from "vitest";

import { createApp, type AppDependencies } from "../app.js";
import { ok } from "./dto.js";
import type { ToyRow, ToyService } from "./service.js";

const NOW = new Date("2026-07-22T12:00:00.000Z");
const NO_STORE = "private, no-store";

function toyRow(): ToyRow {
  return {
    id: "toy-id",
    slug: "quiet-cube",
    title: "Quiet cube",
    description: "A small cube",
    visibility: "public",
    microcode: "F3DEX2",
    ownerId: "author123",
    ownerName: "Ada Hopper",
    thumbnailExists: true,
    forkOf: null,
    createdAt: NOW,
  };
}

function fakeToyService(overrides: Partial<ToyService> = {}): ToyService {
  return {
    listPublic: async () => ({ toys: [], pageCount: 0 }),
    listPublicByOwner: async () => ({ toys: [], pageCount: 0 }),
    listByOwner: async () => ({ toys: [], pageCount: 0 }),
    getOwnerName: async () => "Someone",
    getAccessibleToy: async () => null,
    getAccessibleTexture: async () => null,
    getAccessibleThumbnail: async () => null,
    resolveForkParent: async () => null,
    create: async () => ok({ slug: "created-toy" }),
    update: async (slug) => ok({ slug }),
    deleteOwned: async (slug) => ok({ slug }),
    ...overrides,
  };
}

function dependencies(toys: ToyService): AppDependencies {
  return {
    authHandler: async () => new Response(null),
    getSession: async () => null,
    toys,
    trustedOrigins: ["http://localhost:5173"],
    maxBodyBytes: 7 * 1024 * 1024,
    pingDatabase: async () => undefined,
    logError: () => undefined,
  };
}

describe("public user toy routes", () => {
  it("returns the standard no-store 404 for an unknown user", async () => {
    const app = createApp(
      dependencies(fakeToyService({ getOwnerName: async () => null })),
    );

    const response = await app.request("/api/users/missing/toys");

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE);
    await expect(response.json()).resolves.toEqual({
      error: { code: "not_found", message: "Not found" },
    });
  });

  it("returns a DTO-shaped page of the known user's public toys", async () => {
    const listPublicByOwner = vi.fn<ToyService["listPublicByOwner"]>(
      async () => ({ toys: [toyRow()], pageCount: 3 }),
    );
    const app = createApp(
      dependencies(
        fakeToyService({
          getOwnerName: async () => "Ada Hopper",
          listPublicByOwner,
        }),
      ),
    );

    const response = await app.request("/api/users/author123/toys?page=2");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE);
    const payload = await response.json();
    expect(payload).toEqual({
      owner: { id: "author123", displayName: "Ada Hopper" },
      toys: [
        {
          slug: "quiet-cube",
          title: "Quiet cube",
          description: "A small cube",
          visibility: "public",
          microcode: "F3DEX2",
          owner: { id: "author123", displayName: "Ada Hopper" },
          thumbnailUrl: "/api/toys/quiet-cube/thumbnail",
          forkOf: null,
          isOwner: false,
          createdAt: NOW.toISOString(),
        },
      ],
      page: 2,
      pageCount: 3,
    });
    expect(JSON.stringify(payload)).not.toMatch(/source|bytes|email/);
    expect(listPublicByOwner).toHaveBeenCalledWith("author123", 2);
  });

  it("clamps the requested page to one", async () => {
    const listPublicByOwner = vi.fn<ToyService["listPublicByOwner"]>(
      async () => ({ toys: [], pageCount: 0 }),
    );
    const app = createApp(
      dependencies(fakeToyService({ listPublicByOwner })),
    );

    const response = await app.request("/api/users/author123/toys?page=0");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ page: 1 });
    expect(listPublicByOwner).toHaveBeenCalledWith("author123", 1);
  });
});
