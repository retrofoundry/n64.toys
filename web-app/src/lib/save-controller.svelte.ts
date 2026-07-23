import { get } from "svelte/store";

import type { Toy, ToyVisibility } from "../toys/types";
import {
  authActions,
  authSession,
  type AuthActions,
  type AuthViewState,
} from "./auth/auth-client";
import type { Playground } from "./playground.svelte";
import {
  HttpSaveTransport,
  type Result,
  type SaveTransport,
} from "./save-transport";
import {
  captureThumbnail,
  type ThumbnailCaptureResult,
} from "./thumbnail";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * sessionStorage is commonly limited to about 5 MiB. Base64 expands PNG data by
 * one third, so a 3.5 MiB raw-PNG cap leaves only a small, explicit metadata
 * allowance. The separately estimated serialized payload must also fit 4.75 MiB.
 */
export const SAFE_DRAFT_RAW_PNG_BYTES = Math.floor(3.5 * 1024 * 1024);
export const SAFE_DRAFT_BYTES = Math.floor(4.75 * 1024 * 1024);
export const PENDING_DRAFT_KEY = "n64-toys.pending-save.v1";
const PENDING_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

type SavePlayground = Pick<
  Playground,
  | "source"
  | "title"
  | "description"
  | "textureSlots"
  | "settings"
  | "renderForCapture"
  | "newDraft"
  | "reconcileTextureDeclarations"
  | "loadTexture"
  | "run"
>;

type StoredTexture = { name: string; png: string };
type PendingDraft = {
  version: 1;
  payload: {
    source: string;
    title: string;
    description: string;
    visibility: ToyVisibility;
    microcode: string;
    textures: StoredTexture[];
    forkSourceSlug?: string;
  };
  route: string;
  intent: "save";
  expiresAt: number;
};

type TextureSnapshot = {
  name: string;
  png: Blob;
};

type DraftSnapshot = {
  title: string;
  description: string;
  source: string;
  visibility: ToyVisibility;
  microcode: string;
  textures: TextureSnapshot[];
  fingerprint: string;
  forkSourceSlug?: string;
};

export type SaveControllerDependencies = {
  transport?: SaveTransport;
  authActions?: AuthActions;
  getAuthState?: () => AuthViewState;
  storage?: Storage;
  now?: () => number;
  currentRoute?: () => string;
  getCanvas?: () => HTMLCanvasElement | undefined;
  captureThumbnail?: (
    canvas: HTMLCanvasElement,
  ) => Promise<ThumbnailCaptureResult>;
  navigateToSlug?: (slug: string) => void | Promise<void>;
  navigateAfterDelete?: () => void | Promise<void>;
};

function defaultStorage(): Storage {
  return sessionStorage;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function base64Size(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBlob(value: string): Blob {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: "image/png" });
}

function isVisibility(value: unknown): value is ToyVisibility {
  return value === "private" || value === "unlisted" || value === "public";
}

function parsePendingDraft(raw: string, now: number): PendingDraft | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const pending = value as Partial<PendingDraft>;
    const payload = pending.payload;
    if (
      pending.version !== 1 ||
      pending.intent !== "save" ||
      typeof pending.route !== "string" ||
      typeof pending.expiresAt !== "number" ||
      pending.expiresAt <= now ||
      typeof payload !== "object" ||
      payload === null ||
      typeof payload.source !== "string" ||
      typeof payload.title !== "string" ||
      typeof payload.description !== "string" ||
      typeof payload.microcode !== "string" ||
      !isVisibility(payload.visibility) ||
      (payload.forkSourceSlug !== undefined &&
        typeof payload.forkSourceSlug !== "string") ||
      !Array.isArray(payload.textures) ||
      payload.textures.some(
        (texture) =>
          typeof texture !== "object" ||
          texture === null ||
          typeof (texture as StoredTexture).name !== "string" ||
          typeof (texture as StoredTexture).png !== "string",
      )
    ) {
      return null;
    }
    return pending as PendingDraft;
  } catch {
    return null;
  }
}

export class SaveController {
  visibility = $state<ToyVisibility>("private");
  ownedSlug = $state<string | undefined>();
  errorMessage = $state<string | undefined>();
  pendingDraft = $state(false);

  #phase = $state<Exclude<SaveStatus, "dirty">>("idle");
  #baseline = "";
  #forkSourceSlug: string | undefined;
  #blobIds = new WeakMap<Blob, number>();
  #nextBlobId = 1;
  #restoring = false;

  readonly #transport: SaveTransport;
  readonly #authActions: AuthActions;
  readonly #getAuthState: () => AuthViewState;
  readonly #storage: Storage;
  readonly #now: () => number;
  readonly #currentRoute: () => string;
  readonly #getCanvas: () => HTMLCanvasElement | undefined;
  readonly #captureThumbnail: (
    canvas: HTMLCanvasElement,
  ) => Promise<ThumbnailCaptureResult>;
  readonly #navigateToSlug: (slug: string) => void | Promise<void>;
  readonly #navigateAfterDelete: () => void | Promise<void>;

  constructor(
    private readonly pg: SavePlayground,
    dependencies: SaveControllerDependencies = {},
  ) {
    this.#transport = dependencies.transport ?? new HttpSaveTransport();
    this.#authActions = dependencies.authActions ?? authActions;
    this.#getAuthState = dependencies.getAuthState ?? (() => get(authSession));
    this.#storage = dependencies.storage ?? defaultStorage();
    this.#now = dependencies.now ?? Date.now;
    this.#currentRoute =
      dependencies.currentRoute ?? (() => window.location.hash);
    this.#getCanvas = dependencies.getCanvas ?? (() => undefined);
    this.#captureThumbnail = dependencies.captureThumbnail ?? captureThumbnail;
    this.#navigateToSlug =
      dependencies.navigateToSlug ??
      ((slug) => {
        window.location.hash = `t=${slug}`;
      });
    this.#navigateAfterDelete =
      dependencies.navigateAfterDelete ??
      (() => {
        window.location.hash = "mine";
      });
    this.#baseline = this.#fingerprint();
    try {
      this.pendingDraft = this.#storage.getItem(PENDING_DRAFT_KEY) !== null;
    } catch {
      this.pendingDraft = false;
    }
  }

  get isDirty(): boolean {
    return this.#fingerprint() !== this.#baseline;
  }

  get status(): SaveStatus {
    if (this.#phase === "saving" || this.#phase === "error") {
      return this.#phase;
    }
    return this.isDirty ? "dirty" : this.#phase;
  }

  setVisibility(visibility: ToyVisibility): void {
    this.visibility = visibility;
    if (this.#phase === "saved") this.#phase = "idle";
  }

  adoptLoadedToy(toy: Toy | null): void {
    if (toy?.isOwner) {
      this.ownedSlug = toy.slug;
      this.#forkSourceSlug = undefined;
      this.visibility = toy.visibility;
    } else if (toy) {
      this.ownedSlug = undefined;
      this.#forkSourceSlug = toy.slug;
      this.visibility = "private";
    } else {
      this.ownedSlug = undefined;
      this.#forkSourceSlug = undefined;
      this.visibility = "private";
    }
    this.errorMessage = undefined;
    this.#phase = "idle";
    this.#baseline = this.#fingerprint();
  }

  async save(): Promise<void> {
    if (this.#phase === "saving") return;
    this.errorMessage = undefined;

    const authState = this.#getAuthState();
    if (authState.isPending) {
      this.#fail("Please wait while your login status is checked.");
      return;
    }
    if (!authState.data?.user) {
      this.#phase = "saving";
      await this.#protectAnonymousDraft();
      return;
    }

    const snapshot = this.#snapshot();
    this.#phase = "saving";
    const effectiveVisibility = snapshot.forkSourceSlug
      ? "private"
      : snapshot.visibility;
    let thumbnail: Blob | undefined;
    if (effectiveVisibility === "public") {
      if (!snapshot.title.trim()) {
        this.#fail("A title is required before publishing.");
        return;
      }
      const invalidTexture = this.pg.textureSlots.find(
        (slot) => !slot.asset || slot.error || slot.uploadError,
      );
      if (invalidTexture) {
        this.#fail(
          `Texture '${invalidTexture.declaration.name}' must have a valid PNG before publishing.`,
        );
        return;
      }
      if (!this.pg.renderForCapture()) {
        this.#fail("Fix render diagnostics before publishing.");
        return;
      }
      const canvas = this.#getCanvas();
      if (!canvas) {
        this.#fail("The preview canvas is unavailable for publishing.");
        return;
      }
      let captured: ThumbnailCaptureResult;
      try {
        captured = await this.#captureThumbnail(canvas);
      } catch {
        this.#fail("Unable to capture a publish thumbnail.");
        return;
      }
      if (!captured.ok) {
        this.#fail(`Unable to capture a publish thumbnail: ${captured.reason}`);
        return;
      }
      thumbnail = captured.blob;
    }

    const body = this.#multipart(snapshot, effectiveVisibility, thumbnail);
    let result: Result<{ slug: string }>;
    try {
      result = this.ownedSlug
        ? await this.#transport.update(this.ownedSlug, body)
        : await this.#transport.create(body);
    } catch {
      this.#fail("Unable to save toy. Check your connection and try again.");
      return;
    }
    if (!result.ok) {
      this.#fail(result.error.message || "Unable to save toy.");
      return;
    }

    const created = !this.ownedSlug;
    this.ownedSlug = result.value.slug;
    this.#forkSourceSlug = undefined;
    this.#baseline = snapshot.fingerprint;
    this.#phase = "saved";
    this.errorMessage = undefined;
    if (this.#restoring) this.discardPendingDraft();
    if (created) await this.#navigateToSlug(result.value.slug);
  }

  async deleteToy(): Promise<void> {
    const slug = this.ownedSlug;
    if (!slug) return;

    this.errorMessage = undefined;
    this.#phase = "saving";
    let result: Result<{ slug: string }>;
    try {
      result = await this.#transport.delete(slug);
    } catch {
      this.#fail("Unable to delete toy. Check your connection and try again.");
      return;
    }
    if (!result.ok) {
      this.#fail(result.error.message || "Unable to delete toy.");
      return;
    }

    this.ownedSlug = undefined;
    this.#forkSourceSlug = undefined;
    this.#baseline = this.#fingerprint();
    this.#phase = "idle";
    this.errorMessage = undefined;
    await this.#navigateAfterDelete();
  }

  async restorePendingDraft(): Promise<boolean> {
    const raw = this.#storage.getItem(PENDING_DRAFT_KEY);
    if (raw === null) return false;
    const pending = parsePendingDraft(raw, this.#now());
    if (!pending) {
      this.discardPendingDraft();
      return false;
    }
    const authState = this.#getAuthState();
    if (authState.isPending || !authState.data?.user) return false;

    try {
      await this.pg.newDraft();
      this.adoptLoadedToy(null);
      this.pg.source = pending.payload.source;
      this.pg.title = pending.payload.title;
      this.pg.description = pending.payload.description;
      this.pg.settings.microcode = pending.payload.microcode;
      this.visibility = pending.payload.visibility;
      this.#forkSourceSlug = pending.payload.forkSourceSlug;
      this.pg.reconcileTextureDeclarations();
      for (const texture of pending.payload.textures) {
        const blob = base64ToBlob(texture.png);
        const file = new File([blob], `${texture.name}.png`, {
          type: "image/png",
        });
        await this.pg.loadTexture(texture.name, file, { run: false });
      }
      this.pg.run();
    } catch {
      this.discardPendingDraft();
      return false;
    }

    this.#restoring = true;
    try {
      await this.save();
    } finally {
      this.#restoring = false;
    }
    return true;
  }

  discardPendingDraft(): void {
    this.#storage.removeItem(PENDING_DRAFT_KEY);
    this.pendingDraft = false;
  }

  hasPendingDraft(): boolean {
    return this.pendingDraft;
  }

  #fail(message: string): void {
    this.errorMessage = message;
    this.#phase = "error";
  }

  #blobId(blob: Blob): number {
    let id = this.#blobIds.get(blob);
    if (id === undefined) {
      id = this.#nextBlobId++;
      this.#blobIds.set(blob, id);
    }
    return id;
  }

  #fingerprint(): string {
    return JSON.stringify({
      source: this.pg.source,
      title: this.pg.title,
      description: this.pg.description,
      visibility: this.visibility,
      microcode: this.pg.settings.microcode,
      textures: this.pg.textureSlots.map((slot) => ({
        name: slot.declaration.name,
        asset: slot.asset ? this.#blobId(slot.asset.png) : null,
        error: slot.error ?? slot.uploadError ?? null,
      })),
    });
  }

  #snapshot(): DraftSnapshot {
    return {
      title: this.pg.title,
      description: this.pg.description,
      source: this.pg.source,
      visibility: this.visibility,
      microcode: this.pg.settings.microcode,
      textures: this.pg.textureSlots.flatMap((slot) =>
        slot.asset
          ? [{ name: slot.declaration.name, png: slot.asset.png }]
          : [],
      ),
      fingerprint: this.#fingerprint(),
      forkSourceSlug: this.#forkSourceSlug,
    };
  }

  #multipart(
    snapshot: DraftSnapshot,
    visibility: ToyVisibility,
    thumbnail?: Blob,
  ): FormData {
    const body = new FormData();
    const textures = snapshot.textures.map((texture, index) => ({
      name: texture.name,
      part: `tex_${index}`,
    }));
    const manifest = {
      title: snapshot.title,
      description: snapshot.description,
      source: snapshot.source,
      visibility,
      schemaVersion: 1 as const,
      microcode: snapshot.microcode,
      textures,
      ...(snapshot.forkSourceSlug
        ? { forkOfSlug: snapshot.forkSourceSlug }
        : {}),
      ...(thumbnail ? { thumbnailPart: "thumb" } : {}),
    };
    body.append("manifest", JSON.stringify(manifest));
    snapshot.textures.forEach((texture, index) => {
      body.append(
        `tex_${index}`,
        new Blob([texture.png], { type: "image/png" }),
        `${texture.name}.png`,
      );
    });
    if (thumbnail) {
      body.append(
        "thumb",
        new Blob([thumbnail], { type: "image/png" }),
        "thumbnail.png",
      );
    }
    return body;
  }

  async #protectAnonymousDraft(): Promise<void> {
    const snapshot = this.#snapshot();
    const rawPngBytes = snapshot.textures.reduce(
      (total, texture) => total + texture.png.size,
      0,
    );
    const metadata = JSON.stringify({
      source: snapshot.source,
      title: snapshot.title,
      description: snapshot.description,
      visibility: snapshot.visibility,
      microcode: snapshot.microcode,
      textureNames: snapshot.textures.map((texture) => texture.name),
      forkSourceSlug: snapshot.forkSourceSlug,
    });
    const estimatedBytes =
      utf8Bytes(metadata) +
      snapshot.textures.reduce(
        (total, texture) => total + base64Size(texture.png.size),
        0,
      );
    if (
      rawPngBytes > SAFE_DRAFT_RAW_PNG_BYTES ||
      estimatedBytes > SAFE_DRAFT_BYTES
    ) {
      this.#fail(
        "This draft is too large to protect through login. Reduce its texture PNG size before saving.",
      );
      return;
    }

    let pending: PendingDraft;
    try {
      pending = {
        version: 1,
        payload: {
          source: snapshot.source,
          title: snapshot.title,
          description: snapshot.description,
          visibility: snapshot.visibility,
          microcode: snapshot.microcode,
          textures: await Promise.all(
            snapshot.textures.map(async (texture) => ({
              name: texture.name,
              png: await blobToBase64(texture.png),
            })),
          ),
          ...(snapshot.forkSourceSlug
            ? { forkSourceSlug: snapshot.forkSourceSlug }
            : {}),
        },
        route: this.#currentRoute(),
        intent: "save",
        expiresAt: this.#now() + PENDING_DRAFT_TTL_MS,
      };
    } catch {
      this.#fail("This draft could not be protected through login.");
      return;
    }
    const serialized = JSON.stringify(pending);
    if (utf8Bytes(serialized) > SAFE_DRAFT_BYTES) {
      this.#fail(
        "This draft is too large to protect through login. Reduce its texture PNG size before saving.",
      );
      return;
    }
    try {
      this.#storage.setItem(PENDING_DRAFT_KEY, serialized);
      this.pendingDraft = true;
    } catch {
      this.#fail(
        "This draft could not be protected through login because browser storage is full.",
      );
      return;
    }
    try {
      await this.#authActions.signInWithGitHub();
      this.#phase = "idle";
    } catch {
      this.#fail("Unable to start GitHub login. Please try again.");
    }
  }
}
