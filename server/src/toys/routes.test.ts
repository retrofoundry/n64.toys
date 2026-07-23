import { PNG } from "pngjs";
import { describe, expect, it, vi } from "vitest";

import { createApp, type AppDependencies } from "../app.js";
import { err, ok, type SaveManifest } from "./dto.js";
import { ERROR_CODES, LIMITS } from "./limits.js";
import type { ToyRow, ToyService, ToyWithAssetsRow } from "./service.js";

const NO_STORE = "private, no-store";
const NOW = new Date("2026-07-22T12:00:00.000Z");

function png(width: number, height: number): Uint8Array {
  const image = new PNG({ width, height });
  image.data.fill(255);
  return new Uint8Array(PNG.sync.write(image));
}

function padded(bytes: Uint8Array, byteLength: number): Uint8Array {
  const result = new Uint8Array(byteLength);
  result.set(bytes);
  return result;
}

function manifest(overrides: Partial<SaveManifest> = {}): SaveManifest {
  return {
    title: "Triangle",
    description: "A textured triangle",
    source: "Texture brick = { 1, 1, RGBA16 }",
    visibility: "private",
    schemaVersion: 1,
    microcode: "F3DEX2",
    textures: [{ name: "brick", part: "texture-brick" }],
    ...overrides,
  };
}

function multipart(
  value: SaveManifest,
  parts: Array<[string, Uint8Array]> = [["texture-brick", png(1, 1)]],
): FormData {
  const body = new FormData();
  body.append("manifest", JSON.stringify(value));
  for (const [name, bytes] of parts) {
    body.append(
      name,
      new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      `${name}.png`,
    );
  }
  return body;
}

function toyRow(overrides: Partial<ToyRow> = {}): ToyRow {
  return {
    id: "toy-id",
    slug: "triangle",
    title: "Triangle",
    description: "A textured triangle",
    visibility: "public",
    microcode: "F3DEX2",
    ownerId: "owner-id",
    ownerName: "Niko",
    thumbnailExists: true,
    forkOf: null,
    createdAt: NOW,
    ...overrides,
  };
}

function toyDetail(
  overrides: Partial<ToyWithAssetsRow> = {},
): ToyWithAssetsRow {
  return {
    ...toyRow(),
    source: "Texture brick = { 1, 1, RGBA16 }",
    schemaVersion: 1,
    microcode: "F3DEX2",
    textures: [
      {
        name: "brick wall",
        width: 1,
        height: 1,
        format: "RGBA16",
        mimeType: "image/png",
      },
    ],
    ...overrides,
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

function createDependencies(
  overrides: Partial<AppDependencies> = {},
): AppDependencies {
  return {
    authHandler: async () => new Response(null),
    getSession: async () => null,
    toys: fakeToyService(),
    trustedOrigins: ["http://localhost:5173"],
    maxBodyBytes: 7 * 1024 * 1024,
    pingDatabase: async () => undefined,
    logError: () => undefined,
    ...overrides,
  };
}

async function expectError(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe(NO_STORE);
  await expect(response.json()).resolves.toMatchObject({
    error: { code, message: expect.any(String) },
  });
}

function authed(overrides: Partial<AppDependencies> = {}) {
  return createDependencies({
    getSession: async () => ({ id: "owner-id" }),
    ...overrides,
  });
}

describe("toy read routes", () => {
  it("lists DTO-shaped public toys without source, bytes, or email", async () => {
    const listPublic = vi.fn(async () => ({
      toys: [
        {
          ...toyRow(),
          source: "must not leak",
          email: "owner@example.test",
          bytes: Buffer.from("must not leak"),
        } as ToyRow,
      ],
      pageCount: 4,
    }));
    const app = createApp(
      createDependencies({ toys: fakeToyService({ listPublic }) }),
    );

    const response = await app.request("/api/toys?page=2");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(listPublic).toHaveBeenCalledWith(2);
    const body = await response.json();
    expect(body).toEqual({
      toys: [
        {
          slug: "triangle",
          title: "Triangle",
          description: "A textured triangle",
          visibility: "public",
          microcode: "F3DEX2",
          owner: { id: "owner-id", displayName: "Niko" },
          thumbnailUrl: "/api/toys/triangle/thumbnail",
          forkOf: null,
          isOwner: false,
          createdAt: NOW.toISOString(),
        },
      ],
      page: 2,
      pageCount: 4,
    });
    expect(JSON.stringify(body)).not.toContain("source");
    expect(JSON.stringify(body)).not.toContain("email");
    expect(JSON.stringify(body)).not.toContain("bytes");
  });

  it.each([
    ["/api/toys", 1],
    ["/api/toys?page=0", 1],
    ["/api/toys?page=-4", 1],
    ["/api/toys?page=wat", 1],
  ])("clamps the list page for %s", async (path, page) => {
    const listPublic = vi.fn(async () => ({ toys: [], pageCount: 0 }));
    const app = createApp(
      createDependencies({ toys: fakeToyService({ listPublic }) }),
    );

    const response = await app.request(path);

    expect(response.status).toBe(200);
    expect(listPublic).toHaveBeenCalledWith(page);
  });

  it("rejects a signed-out request to the owner's toy list", async () => {
    const listByOwner = vi.fn(async () => ({ toys: [], pageCount: 0 }));
    const app = createApp(
      createDependencies({ toys: fakeToyService({ listByOwner }) }),
    );

    const response = await app.request("/api/toys/mine");

    await expectError(response, 401, ERROR_CODES.unauthorized);
    expect(listByOwner).not.toHaveBeenCalled();
  });

  it("lists the signed-in user's toys through the mine route", async () => {
    const listByOwner = vi.fn(async () => ({
      toys: [toyRow({ visibility: "private" })],
      pageCount: 3,
    }));
    const getAccessibleToy = vi.fn(async () => toyDetail());
    const app = createApp(
      authed({
        toys: fakeToyService({ listByOwner, getAccessibleToy }),
      }),
    );

    const response = await app.request("/api/toys/mine?page=2");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(listByOwner).toHaveBeenCalledWith("owner-id", 2);
    expect(getAccessibleToy).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      toys: [
        {
          slug: "triangle",
          title: "Triangle",
          description: "A textured triangle",
          visibility: "private",
          microcode: "F3DEX2",
          owner: { id: "owner-id", displayName: "Niko" },
          thumbnailUrl: "/api/toys/triangle/thumbnail",
          forkOf: null,
          isOwner: true,
          createdAt: NOW.toISOString(),
        },
      ],
      page: 2,
      pageCount: 3,
    });
  });

  it.each([
    ["/api/toys/mine", 1],
    ["/api/toys/mine?page=0", 1],
    ["/api/toys/mine?page=-4", 1],
    ["/api/toys/mine?page=wat", 1],
  ])("clamps the owner's list page for %s", async (path, page) => {
    const listByOwner = vi.fn(async () => ({ toys: [], pageCount: 0 }));
    const app = createApp(authed({ toys: fakeToyService({ listByOwner }) }));

    const response = await app.request(path);

    expect(response.status).toBe(200);
    expect(listByOwner).toHaveBeenCalledWith("owner-id", page);
  });

  it("returns a public detail DTO with encoded asset URLs", async () => {
    const getAccessibleToy = vi.fn(async () => toyDetail());
    const app = createApp(
      createDependencies({
        toys: fakeToyService({ getAccessibleToy }),
      }),
    );

    const response = await app.request("/api/toys/triangle");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(getAccessibleToy).toHaveBeenCalledWith("triangle", null);
    await expect(response.json()).resolves.toEqual({
      slug: "triangle",
      title: "Triangle",
      description: "A textured triangle",
      visibility: "public",
      owner: { id: "owner-id", displayName: "Niko" },
      thumbnailUrl: "/api/toys/triangle/thumbnail",
      forkOf: null,
      isOwner: false,
      createdAt: NOW.toISOString(),
      source: "Texture brick = { 1, 1, RGBA16 }",
      schemaVersion: 1,
      microcode: "F3DEX2",
      textures: [
        {
          name: "brick wall",
          width: 1,
          height: 1,
          format: "RGBA16",
          url: "/api/toys/triangle/textures/brick%20wall",
        },
      ],
    });
  });

  it("returns the same 404 for a missing or inaccessible private toy", async () => {
    const getAccessibleToy = vi.fn(async () => null);
    const app = createApp(
      createDependencies({
        getSession: async () => ({ id: "other-user" }),
        toys: fakeToyService({ getAccessibleToy }),
      }),
    );

    const response = await app.request("/api/toys/private-toy");

    await expectError(response, 404, ERROR_CODES.not_found);
    expect(getAccessibleToy).toHaveBeenCalledWith("private-toy", "other-user");
  });

  it("returns a private toy to its owner", async () => {
    const getAccessibleToy = vi.fn(async (_slug, viewerId) =>
      viewerId === "owner-id" ? toyDetail({ visibility: "private" }) : null,
    );
    const app = createApp(
      authed({ toys: fakeToyService({ getAccessibleToy }) }),
    );

    const response = await app.request("/api/toys/triangle");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      visibility: "private",
      isOwner: true,
    });
  });
});

describe("toy write request guards", () => {
  it("rejects an oversized Content-Length before origin, session, or parse", async () => {
    const getSession = vi.fn(async () => ({ id: "owner-id" }));
    const app = createApp(createDependencies({ getSession, maxBodyBytes: 10 }));
    const request = new Request("http://localhost/api/toys", {
      method: "POST",
      headers: {
        "Content-Length": "11",
        Origin: "https://hostile.example",
      },
      body: "not multipart",
    });

    const response = await app.fetch(request);

    await expectError(response, 413, ERROR_CODES.validation_error);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("rejects an oversized body without Content-Length", async () => {
    const getSession = vi.fn(async () => ({ id: "owner-id" }));
    const app = createApp(createDependencies({ getSession, maxBodyBytes: 10 }));
    const request = new Request("http://localhost/api/toys", {
      method: "POST",
      body: new Uint8Array(11),
    });
    expect(request.headers.has("Content-Length")).toBe(false);

    const response = await app.fetch(request);

    await expectError(response, 413, ERROR_CODES.validation_error);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("rejects a hostile Origin before session or multipart parsing", async () => {
    const getSession = vi.fn(async () => ({ id: "owner-id" }));
    const app = createApp(createDependencies({ getSession }));

    const response = await app.request("/api/toys", {
      method: "POST",
      headers: { Origin: "https://hostile.example" },
      body: "not multipart",
    });

    await expectError(response, 403, ERROR_CODES.forbidden);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("rejects a literal null Origin before session or parsing", async () => {
    const getSession = vi.fn(async () => ({ id: "owner-id" }));
    const app = createApp(
      createDependencies({ getSession, trustedOrigins: ["null"] }),
    );

    const response = await app.request("/api/toys", {
      method: "POST",
      headers: { Origin: "null" },
      body: "not multipart",
    });

    await expectError(response, 403, ERROR_CODES.forbidden);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("rejects a signed-out request before multipart parsing", async () => {
    const app = createApp(createDependencies());

    const response = await app.request("/api/toys", {
      method: "POST",
      body: "not multipart",
    });

    await expectError(response, 401, ERROR_CODES.unauthorized);
  });

  it("allows an absent Origin when SameSite=Lax supplies a session", async () => {
    const create = vi.fn<ToyService["create"]>(async () =>
      ok({ slug: "created-toy" }),
    );
    const app = createApp(authed({ toys: fakeToyService({ create }) }));

    const response = await app.request("/api/toys", {
      method: "POST",
      body: multipart(manifest()),
    });

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledOnce();
  });
});

describe("toy multipart creation", () => {
  it("creates a toy with validated decoded textures and the session owner", async () => {
    const create = vi.fn<ToyService["create"]>(async () =>
      ok({ slug: "saved-triangle" }),
    );
    const app = createApp(authed({ toys: fakeToyService({ create }) }));

    const response = await app.request("/api/toys", {
      method: "POST",
      headers: { Origin: "http://localhost:5173" },
      body: multipart(manifest()),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE);
    await expect(response.json()).resolves.toEqual({
      slug: "saved-triangle",
    });
    expect(create).toHaveBeenCalledOnce();
    const input = create.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      ownerId: "owner-id",
      forkOfId: null,
      manifest: { visibility: "private" },
      textures: [
        {
          name: "brick",
          width: 1,
          height: 1,
          format: "RGBA16",
          contentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      ],
    });
    expect(input?.textures[0]?.bytes).toBeInstanceOf(Uint8Array);
  });

  it("rejects a decoded texture whose dimensions differ from source", async () => {
    const app = createApp(authed());

    const response = await app.request("/api/toys", {
      method: "POST",
      body: multipart(manifest(), [["texture-brick", png(2, 1)]]),
    });

    await expectError(response, 400, ERROR_CODES.validation_error);
  });

  it("rejects a texture over the per-file byte limit", async () => {
    const app = createApp(authed());
    const oversized = padded(png(1, 1), LIMITS.maxTexturePngBytes + 1);

    const response = await app.request("/api/toys", {
      method: "POST",
      body: multipart(manifest(), [["texture-brick", oversized]]),
    });

    await expectError(response, 400, ERROR_CODES.validation_error);
  });

  it("rejects texture parts over the aggregate byte limit", async () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      name: `tex${index}`,
      part: `part${index}`,
    }));
    const source = entries
      .map(({ name }) => `Texture ${name} = { 1, 1, RGBA16 }`)
      .join("\n");
    const nearLimit = LIMITS.maxTexturePngBytes - 1;
    const parts: Array<[string, Uint8Array]> = entries.map(({ part }) => [
      part,
      padded(png(1, 1), nearLimit),
    ]);
    const app = createApp(authed());

    const response = await app.request("/api/toys", {
      method: "POST",
      body: multipart(manifest({ source, textures: entries }), parts),
    });

    await expectError(response, 400, ERROR_CODES.validation_error);
  });

  it.each([
    ["source", { source: "x".repeat(LIMITS.maxSourceBytes + 1) }],
    ["title", { title: "x".repeat(LIMITS.maxTitleCodePoints + 1) }],
    [
      "description",
      {
        description: "x".repeat(LIMITS.maxDescriptionCodePoints + 1),
      },
    ],
  ])("rejects a %s limit violation", async (_field, override) => {
    const app = createApp(authed());

    const response = await app.request("/api/toys", {
      method: "POST",
      body: multipart(manifest(override)),
    });

    await expectError(response, 400, ERROR_CODES.validation_error);
  });

  it("rejects a thumbnail with dimensions other than 512x384", async () => {
    const app = createApp(authed());
    const value = manifest({ thumbnailPart: "thumbnail" });

    const response = await app.request("/api/toys", {
      method: "POST",
      body: multipart(value, [
        ["texture-brick", png(1, 1)],
        ["thumbnail", png(1, 1)],
      ]),
    });

    await expectError(response, 400, ERROR_CODES.validation_error);
  });

  it("rejects a thumbnail over its encoded byte limit", async () => {
    const app = createApp(authed());
    const value = manifest({ thumbnailPart: "thumbnail" });

    const response = await app.request("/api/toys", {
      method: "POST",
      body: multipart(value, [
        ["texture-brick", png(1, 1)],
        ["thumbnail", padded(png(512, 384), LIMITS.maxThumbnailBytes + 1)],
      ]),
    });

    await expectError(response, 400, ERROR_CODES.validation_error);
  });

  it("rejects a missing declared multipart part", async () => {
    const app = createApp(authed());

    const response = await app.request("/api/toys", {
      method: "POST",
      body: multipart(manifest(), []),
    });

    await expectError(response, 400, ERROR_CODES.validation_error);
  });

  it("rejects an undeclared multipart part", async () => {
    const app = createApp(authed());

    const response = await app.request("/api/toys", {
      method: "POST",
      body: multipart(manifest(), [
        ["texture-brick", png(1, 1)],
        ["surprise", png(1, 1)],
      ]),
    });

    await expectError(response, 400, ERROR_CODES.validation_error);
  });

  it("rejects duplicate multipart part names", async () => {
    const app = createApp(authed());

    const response = await app.request("/api/toys", {
      method: "POST",
      body: multipart(manifest(), [
        ["texture-brick", png(1, 1)],
        ["texture-brick", png(1, 1)],
      ]),
    });

    await expectError(response, 400, ERROR_CODES.validation_error);
  });

  it("rejects a source declaration with no manifest part", async () => {
    const app = createApp(authed());
    const value = manifest({ textures: [] });

    const response = await app.request("/api/toys", {
      method: "POST",
      body: multipart(value, []),
    });

    await expectError(response, 400, ERROR_CODES.validation_error);
  });
});

describe("public publishing and forks", () => {
  it.each([
    ["an empty title", { title: "" }, true, true],
    ["a missing declared texture", { textures: [] }, false, true],
    ["no thumbnail", {}, true, false],
  ])(
    "rejects a public toy with %s",
    async (_case, override, includeTexture, includeThumbnail) => {
      const app = createApp(authed());
      const value = manifest({
        visibility: "public",
        thumbnailPart: includeThumbnail ? "thumbnail" : undefined,
        ...override,
      });
      const parts: Array<[string, Uint8Array]> = [];
      if (includeTexture) {
        parts.push(["texture-brick", png(1, 1)]);
      }
      if (includeThumbnail) {
        parts.push(["thumbnail", png(512, 384)]);
      }

      const response = await app.request("/api/toys", {
        method: "POST",
        body: multipart(value, parts),
      });

      await expectError(response, 400, ERROR_CODES.validation_error);
    },
  );

  it("resolves a fork parent and forces the created toy private", async () => {
    const resolveForkParent = vi.fn<ToyService["resolveForkParent"]>(
      async () => ({ id: "parent-id" }),
    );
    const create = vi.fn<ToyService["create"]>(async () =>
      ok({ slug: "forked-toy" }),
    );
    const app = createApp(
      authed({
        toys: fakeToyService({ resolveForkParent, create }),
      }),
    );

    const response = await app.request("/api/toys", {
      method: "POST",
      body: multipart(manifest({ visibility: "public", forkOfSlug: "parent" })),
    });

    expect(response.status).toBe(201);
    expect(resolveForkParent).toHaveBeenCalledWith("parent", "owner-id");
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      forkOfId: "parent-id",
      manifest: { visibility: "private" },
    });
  });

  it("rejects an inaccessible fork parent without calling create", async () => {
    const create = vi.fn<ToyService["create"]>(async () =>
      ok({ slug: "must-not-create" }),
    );
    const app = createApp(authed({ toys: fakeToyService({ create }) }));

    const response = await app.request("/api/toys", {
      method: "POST",
      body: multipart(manifest({ forkOfSlug: "private-parent" })),
    });

    await expectError(response, 400, ERROR_CODES.validation_error);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("toy updates", () => {
  it.each([
    ["not_found", 404, ERROR_CODES.not_found],
    ["forbidden", 404, ERROR_CODES.not_found],
    ["quota", 400, ERROR_CODES.quota_exceeded],
    ["validation", 400, ERROR_CODES.validation_error],
    ["storage", 500, ERROR_CODES.storage_error],
  ] as const)(
    "maps %s service errors without leaking details",
    async (kind, status, code) => {
      const update = vi.fn<ToyService["update"]>(async () =>
        err(kind, "constraint toys_owner_private_key origin=secret"),
      );
      const app = createApp(authed({ toys: fakeToyService({ update }) }));

      const response = await app.request("/api/toys/triangle", {
        method: "PUT",
        body: multipart(manifest()),
      });

      const bodyCopy = response.clone();
      await expectError(response, status, code);
      const responseText = await bodyCopy.text();
      expect(responseText).not.toContain("constraint");
      expect(responseText).not.toContain("origin=secret");
    },
  );

  it("ignores forkOfSlug on update", async () => {
    const resolveForkParent = vi.fn<ToyService["resolveForkParent"]>(
      async () => ({ id: "parent-id" }),
    );
    const update = vi.fn<ToyService["update"]>(async () =>
      ok({ slug: "triangle" }),
    );
    const app = createApp(
      authed({
        toys: fakeToyService({ resolveForkParent, update }),
      }),
    );

    const response = await app.request("/api/toys/triangle", {
      method: "PUT",
      body: multipart({
        ...manifest(),
        forkOfSlug: 42,
      } as unknown as SaveManifest),
    });

    expect(response.status).toBe(200);
    expect(resolveForkParent).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0]?.[1]).toMatchObject({ forkOfId: null });
    expect(update.mock.calls[0]?.[1]?.manifest.forkOfSlug).toBeUndefined();
  });
});

describe("toy deletion", () => {
  it("rejects a signed-out delete without touching the service", async () => {
    const deleteOwned = vi.fn(async (slug: string) => ok({ slug }));
    const app = createApp(
      createDependencies({ toys: fakeToyService({ deleteOwned }) }),
    );

    const response = await app.request("/api/toys/triangle", {
      method: "DELETE",
    });

    await expectError(response, 401, ERROR_CODES.unauthorized);
    expect(deleteOwned).not.toHaveBeenCalled();
  });

  it.each(["https://hostile.example", "null"])(
    "rejects Origin %s before session or service access",
    async (origin) => {
      const getSession = vi.fn(async () => ({ id: "owner-id" }));
      const deleteOwned = vi.fn(async (slug: string) => ok({ slug }));
      const app = createApp(
        createDependencies({
          getSession,
          toys: fakeToyService({ deleteOwned }),
          trustedOrigins: origin === "null" ? ["null"] : [],
        }),
      );

      const response = await app.request("/api/toys/triangle", {
        method: "DELETE",
        headers: { Origin: origin },
      });

      await expectError(response, 403, ERROR_CODES.forbidden);
      expect(getSession).not.toHaveBeenCalled();
      expect(deleteOwned).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["forbidden", 404, ERROR_CODES.not_found],
    ["not_found", 404, ERROR_CODES.not_found],
    ["storage", 500, ERROR_CODES.storage_error],
  ] as const)(
    "maps %s without leaking delete details",
    async (kind, status, code) => {
      const deleteOwned = vi.fn(async () =>
        err(kind, "constraint toys_owner_private_key origin=secret"),
      );
      const app = createApp(
        authed({ toys: fakeToyService({ deleteOwned }) }),
      );

      const response = await app.request("/api/toys/triangle", {
        method: "DELETE",
      });

      const bodyCopy = response.clone();
      await expectError(response, status, code);
      const responseText = await bodyCopy.text();
      expect(responseText).not.toContain("constraint");
      expect(responseText).not.toContain("origin=secret");
      expect(deleteOwned).toHaveBeenCalledWith("triangle", "owner-id");
    },
  );

  it("deletes an owned toy for the session user", async () => {
    const deleteOwned = vi.fn(async (slug: string) => ok({ slug }));
    const app = createApp(
      authed({ toys: fakeToyService({ deleteOwned }) }),
    );

    const response = await app.request("/api/toys/triangle", {
      method: "DELETE",
      headers: { Origin: "http://localhost:5173" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE);
    await expect(response.json()).resolves.toEqual({ slug: "triangle" });
    expect(deleteOwned).toHaveBeenCalledWith("triangle", "owner-id");
  });
});

describe("toy asset routes", () => {
  it("returns accessible texture bytes as non-cacheable PNG", async () => {
    const bytes = png(1, 1);
    const getAccessibleTexture = vi.fn(async () => ({
      bytes: Buffer.from(bytes),
      mimeType: "image/png",
    }));
    const app = createApp(
      createDependencies({
        toys: fakeToyService({ getAccessibleTexture }),
      }),
    );

    const response = await app.request(
      "/api/toys/triangle/textures/brick%20wall",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(getAccessibleTexture).toHaveBeenCalledWith(
      "triangle",
      "brick wall",
      null,
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("returns 404 for an inaccessible private texture", async () => {
    const app = createApp(
      createDependencies({
        getSession: async () => ({ id: "other-user" }),
      }),
    );

    const response = await app.request("/api/toys/private-toy/textures/brick");

    await expectError(response, 404, ERROR_CODES.not_found);
  });

  it("returns accessible thumbnail bytes as non-cacheable PNG", async () => {
    const bytes = png(1, 1);
    const getAccessibleThumbnail = vi.fn(async () => ({
      bytes: Buffer.from(bytes),
    }));
    const app = createApp(
      authed({
        toys: fakeToyService({ getAccessibleThumbnail }),
      }),
    );

    const response = await app.request("/api/toys/private-toy/thumbnail");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(getAccessibleThumbnail).toHaveBeenCalledWith(
      "private-toy",
      "owner-id",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("returns 404 for an inaccessible private thumbnail", async () => {
    const app = createApp(createDependencies());

    const response = await app.request("/api/toys/private-toy/thumbnail");

    await expectError(response, 404, ERROR_CODES.not_found);
  });
});
