// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthViewState } from "./auth/auth-client";
import {
  PENDING_DRAFT_KEY,
  SAFE_DRAFT_RAW_PNG_BYTES,
  SaveController,
} from "./save-controller.svelte";
import type { Result, SaveTransport } from "./save-transport";
import type { Toy } from "../toys/types";

const signedIn: AuthViewState = {
  data: { user: { name: "Ada", email: "ada@example.com" } },
  isPending: false,
  error: null,
};
const signedOut: AuthViewState = {
  data: null,
  isPending: false,
  error: null,
};

function png(size = 8): Blob {
  return new Blob([new Uint8Array(size)], { type: "image/png" });
}

function slot(name: string, asset: Blob | null = png()) {
  return {
    declaration: { name, width: 1, height: 1, format: "RGBA16", line: 1 },
    ...(asset
      ? {
          asset: {
            previewUrl: "blob:test",
            png: asset,
            rgba: new Uint8Array(4),
            width: 1,
            height: 1,
          },
        }
      : {}),
  };
}

function playground() {
  const pg = {
    source: "gsSPEndDisplayList(),",
    title: "A toy",
    description: "description",
    textureSlots: [] as ReturnType<typeof slot>[],
    settings: { microcode: "F3DEX2" },
    renderForCapture: vi.fn(() => true),
    newDraft: vi.fn(async () => {
      pg.source = "";
      pg.title = "";
      pg.description = "";
      pg.textureSlots = [];
    }),
    reconcileTextureDeclarations: vi.fn(() => {
      if (pg.source.includes("Texture albedo")) {
        pg.textureSlots = [slot("albedo", null)];
      }
    }),
    loadTexture: vi.fn(async (name: string, file: File) => {
      pg.textureSlots = [slot(name, file)];
    }),
    run: vi.fn(),
  };
  return pg;
}

function transport(
  result: Result<{ slug: string }> = { ok: true, value: { slug: "new-slug" } },
) {
  return {
    create: vi.fn(async () => result),
    update: vi.fn(async () => result),
    delete: vi.fn(async () => result),
  } satisfies SaveTransport;
}

function controller(
  pg = playground(),
  overrides: ConstructorParameters<typeof SaveController>[1] = {},
) {
  const saveTransport = overrides.transport ?? transport();
  const navigateToSlug = overrides.navigateToSlug ?? vi.fn();
  const navigateAfterDelete = overrides.navigateAfterDelete ?? vi.fn();
  return {
    pg,
    transport: saveTransport,
    navigateToSlug,
    navigateAfterDelete,
    controller: new SaveController(pg as never, {
      transport: saveTransport,
      getAuthState: () => signedIn,
      getCanvas: () => document.createElement("canvas"),
      captureThumbnail: async () => ({ ok: true, blob: png() }),
      navigateToSlug,
      navigateAfterDelete,
      ...overrides,
    }),
  };
}

function toy(isOwner: boolean): Toy {
  return {
    slug: isOwner ? "mine" : "theirs",
    title: "Loaded",
    description: "",
    visibility: "unlisted",
    owner: { id: "owner", displayName: "Owner" },
    thumbnailUrl: null,
    forkOf: null,
    isOwner,
    createdAt: new Date(0).toISOString(),
    source: "",
    schemaVersion: 1,
    microcode: "F3DEX2",
    textures: [],
  };
}

async function manifest(body: FormData): Promise<Record<string, unknown>> {
  const value = body.get("manifest");
  expect(value).not.toBeNull();
  return JSON.parse(
    typeof value === "string" ? value : await (value as File).text(),
  );
}

describe("SaveController", () => {
  beforeEach(() => sessionStorage.clear());

  it("tracks dirty fields and keeps edits made during an in-flight save dirty", async () => {
    let finish!: (result: Result<{ slug: string }>) => void;
    const pendingTransport: SaveTransport = {
      create: vi.fn(
        () =>
          new Promise<Result<{ slug: string }>>(
            (resolve) => (finish = resolve),
          ),
      ),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const { pg, controller: saves } = controller(playground(), {
      transport: pendingTransport,
    });
    expect(saves.status).toBe("idle");
    pg.source = "first edit";
    expect(saves.status).toBe("dirty");

    const request = saves.save();
    expect(saves.status).toBe("saving");
    pg.description = "edited while saving";
    finish({ ok: true, value: { slug: "created" } });
    await request;

    expect(saves.status).toBe("dirty");
  });

  it("tracks title, description, and texture slot changes", () => {
    const value = controller();
    value.pg.title = "renamed";
    expect(value.controller.status).toBe("dirty");
    value.controller.adoptLoadedToy(null);

    value.pg.description = "rewritten";
    expect(value.controller.status).toBe("dirty");
    value.controller.adoptLoadedToy(null);

    value.pg.textureSlots = [slot("new-texture")];
    expect(value.controller.status).toBe("dirty");
  });

  it("creates new drafts, updates owned toys, and forks other users' toys", async () => {
    const created = controller();
    await created.controller.save();
    expect(created.transport.create).toHaveBeenCalledOnce();
    expect(created.transport.update).not.toHaveBeenCalled();
    expect(created.controller.ownedSlug).toBe("new-slug");
    expect(created.navigateToSlug).toHaveBeenCalledWith("new-slug");

    const updated = controller();
    updated.controller.adoptLoadedToy(toy(true));
    updated.pg.title = "owner edit";
    await updated.controller.save();
    expect(updated.transport.update).toHaveBeenCalledWith(
      "mine",
      expect.any(FormData),
    );
    expect(updated.transport.create).not.toHaveBeenCalled();

    const forked = controller();
    forked.controller.adoptLoadedToy(toy(false));
    forked.controller.setVisibility("public");
    await forked.controller.save();
    expect(forked.transport.create).toHaveBeenCalledOnce();
    const forkBody = vi.mocked(forked.transport.create).mock.calls[0][0];
    expect(await manifest(forkBody)).toMatchObject({
      forkOfSlug: "theirs",
      visibility: "private",
    });
  });

  it("deletes an owned toy, clears ownership, and navigates to My toys", async () => {
    const value = controller();
    value.controller.adoptLoadedToy(toy(true));
    value.pg.title = "dirty before delete";

    await value.controller.deleteToy();

    expect(value.transport.delete).toHaveBeenCalledWith("mine");
    expect(value.controller.ownedSlug).toBeUndefined();
    expect(value.controller.status).toBe("idle");
    expect(value.navigateAfterDelete).toHaveBeenCalledOnce();
  });

  it("reports a delete transport error", async () => {
    const value = controller(playground(), {
      transport: transport({
        ok: false,
        error: { kind: "storage", message: "Delete failed" },
      }),
    });
    value.controller.adoptLoadedToy(toy(true));

    await value.controller.deleteToy();

    expect(value.controller.status).toBe("error");
    expect(value.controller.errorMessage).toBe("Delete failed");
    expect(value.navigateAfterDelete).not.toHaveBeenCalled();
  });

  it("does nothing when deleting a draft without an owned slug", async () => {
    const value = controller();

    await value.controller.deleteToy();

    expect(value.transport.delete).not.toHaveBeenCalled();
    expect(value.navigateAfterDelete).not.toHaveBeenCalled();
  });

  it("refuses public saves without a title", async () => {
    const value = controller();
    value.pg.title = "   ";
    value.controller.setVisibility("public");
    await value.controller.save();
    expect(value.controller.status).toBe("error");
    expect(value.controller.errorMessage).toMatch(/title/i);
    expect(value.transport.create).not.toHaveBeenCalled();
  });

  it("refuses public saves when rendering fails", async () => {
    const value = controller();
    value.pg.renderForCapture.mockReturnValue(false);
    value.controller.setVisibility("public");
    await value.controller.save();
    expect(value.controller.errorMessage).toMatch(/render/i);
    expect(value.transport.create).not.toHaveBeenCalled();
  });

  it("refuses public saves with a missing declared texture", async () => {
    const pg = playground();
    pg.textureSlots = [slot("albedo", null)];
    const value = controller(pg);
    value.controller.setVisibility("public");
    await value.controller.save();
    expect(value.controller.errorMessage).toMatch(/texture.*albedo/i);
    expect(value.transport.create).not.toHaveBeenCalled();
  });

  it("refuses public saves when thumbnail capture fails", async () => {
    const value = controller(playground(), {
      captureThumbnail: async () => ({ ok: false, reason: "canvas failed" }),
    });
    value.controller.setVisibility("public");
    await value.controller.save();
    expect(value.controller.errorMessage).toMatch(/canvas failed/i);
    expect(value.transport.create).not.toHaveBeenCalled();
  });

  it("assembles a manifest, image/png texture parts, and a fresh public thumbnail", async () => {
    const pg = playground();
    pg.textureSlots = [slot("albedo")];
    const value = controller(pg);
    value.controller.setVisibility("public");

    await value.controller.save();

    const body = vi.mocked(value.transport.create).mock.calls[0][0];
    expect(await manifest(body)).toMatchObject({
      title: "A toy",
      source: "gsSPEndDisplayList(),",
      visibility: "public",
      schemaVersion: 1,
      microcode: "F3DEX2",
      textures: [{ name: "albedo", part: "tex_0" }],
      thumbnailPart: "thumb",
    });
    expect(body.get("tex_0")).toBeInstanceOf(File);
    expect((body.get("tex_0") as File).type).toBe("image/png");
    expect((body.get("thumb") as File).type).toBe("image/png");
  });

  it("protects an anonymous draft and starts login under the ceiling", async () => {
    const signInWithGitHub = vi.fn(async () => undefined);
    const value = controller(playground(), {
      getAuthState: () => signedOut,
      authActions: { signInWithGitHub, signOut: vi.fn() },
      currentRoute: () => "#new",
    });

    await value.controller.save();

    expect(signInWithGitHub).toHaveBeenCalledOnce();
    expect(JSON.parse(sessionStorage.getItem(PENDING_DRAFT_KEY)!)).toMatchObject(
      { route: "#new", intent: "save" },
    );
    expect(value.transport.create).not.toHaveBeenCalled();
  });

  it("refuses an anonymous draft over the raw PNG ceiling without starting login", async () => {
    const pg = playground();
    pg.textureSlots = [slot("large", png(SAFE_DRAFT_RAW_PNG_BYTES + 1))];
    const signInWithGitHub = vi.fn(async () => undefined);
    const value = controller(pg, {
      getAuthState: () => signedOut,
      authActions: { signInWithGitHub, signOut: vi.fn() },
    });

    await value.controller.save();

    expect(value.controller.errorMessage).toMatch(/too large/i);
    expect(signInWithGitHub).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_DRAFT_KEY)).toBeNull();
  });

  it("rehydrates and resumes a protected save, then clears it on success", async () => {
    const pg = playground();
    pg.source = "Texture albedo = { 1, 1, RGBA16 }";
    pg.textureSlots = [slot("albedo")];
    const anonymous = controller(pg, { getAuthState: () => signedOut });
    await anonymous.controller.save();
    expect(sessionStorage.getItem(PENDING_DRAFT_KEY)).not.toBeNull();

    const restoredPg = playground();
    const restored = controller(restoredPg);
    expect(await restored.controller.restorePendingDraft()).toBe(true);

    expect(restoredPg.source).toContain("Texture albedo");
    expect(restoredPg.loadTexture).toHaveBeenCalledWith(
      "albedo",
      expect.any(File),
      { run: false },
    );
    expect(restored.transport.create).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(PENDING_DRAFT_KEY)).toBeNull();
  });

  it("silently drops expired and corrupt pending drafts", async () => {
    sessionStorage.setItem(PENDING_DRAFT_KEY, "not json");
    const corrupt = controller();
    expect(await corrupt.controller.restorePendingDraft()).toBe(false);
    expect(sessionStorage.getItem(PENDING_DRAFT_KEY)).toBeNull();

    sessionStorage.setItem(
      PENDING_DRAFT_KEY,
      JSON.stringify({
        version: 1,
        payload: {
          source: "",
          title: "",
          description: "",
          visibility: "private",
          microcode: "F3DEX2",
          textures: [],
        },
        route: "#new",
        intent: "save",
        expiresAt: 1,
      }),
    );
    const expired = controller(playground(), { now: () => 2 });
    expect(await expired.controller.restorePendingDraft()).toBe(false);
    expect(sessionStorage.getItem(PENDING_DRAFT_KEY)).toBeNull();
  });
});
