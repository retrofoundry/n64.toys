import init, { Renderer, textureDeclarations } from "../wasm/n64_toys.js";
import type { Toy, ToyTexture } from "../toys/types";
import { parseBin } from "./texture-bin";
import { emaFps } from "./fps";
import {
  MAX_TEXTURE_DIMENSION,
  MAX_TEXTURE_PNG_BYTES,
  MAX_TEXTURE_TOTAL_PNG_BYTES,
  reconcileTextureSlots,
  validateTextureLimits,
  type TextureAsset,
  type TextureDeclaration,
  type TextureSlot,
} from "./texture-inputs";

export type Diagnostic = { line: number; msg: string };
export type Settings = {
  autoRun: boolean;
  microcode: string;
  colorFormat: string;
};

function sameDiags(a: Diagnostic[], b: Diagnostic[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].line !== b[i].line || a[i].msg !== b[i].msg) return false;
  }
  return true;
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type DecodedTexture = { rgba: Uint8Array; width: number; height: number };
type TextureLoadOptions = { run?: boolean; signal?: AbortSignal };
type TransitionOptions = { signal?: AbortSignal };
type PreparedAsset = { name: string; asset: TextureAsset };
type RenderResult = {
  diags: Diagnostic[];
  is_time_variant: boolean;
  error: string | null;
};
type RenderTextureSnapshot = Readonly<{
  name: string;
  rgba: Uint8Array;
  width: number;
  height: number;
}>;

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function isPngSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length === PNG_SIGNATURE.length &&
    bytes.every((byte, index) => byte === PNG_SIGNATURE[index])
  );
}

function dedupeDiags(diags: Diagnostic[]): Diagnostic[] {
  const unique: Diagnostic[] = [];
  for (const diag of diags) {
    if (
      !unique.some(
        (candidate) =>
          candidate.line === diag.line && candidate.msg === diag.msg,
      )
    ) {
      unique.push(diag);
    }
  }
  return unique;
}

function snapshotTextures(
  slots: TextureSlot[],
): readonly RenderTextureSnapshot[] {
  return Object.freeze(
    slots
      .filter(
        (slot): slot is TextureSlot & { asset: TextureAsset } =>
          Boolean(slot.asset) && !slot.error,
      )
      .map((slot) =>
        Object.freeze({
          name: slot.declaration.name,
          rgba: slot.asset.rgba.slice(),
          width: slot.asset.width,
          height: slot.asset.height,
        }),
      ),
  );
}

async function decodePng(
  png: Blob,
  signal?: AbortSignal,
): Promise<DecodedTexture> {
  signal?.throwIfAborted();
  const bitmap = await createImageBitmap(png);
  try {
    signal?.throwIfAborted();
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const rgba = new Uint8Array(
      imageData.data.buffer,
      imageData.data.byteOffset,
      imageData.data.byteLength,
    ).slice();
    return { rgba, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

async function prepareBundledAsset(
  texture: ToyTexture,
  signal?: AbortSignal,
): Promise<PreparedAsset> {
  signal?.throwIfAborted();
  const response = await fetch(texture.url, { signal });
  signal?.throwIfAborted();
  if (!response.ok) {
    const status = [response.status, response.statusText]
      .filter(Boolean)
      .join(" ");
    throw new Error(
      `failed to download texture ${texture.name}${status ? `: ${status}` : ""}`,
    );
  }
  let png: Blob;
  let decoded: DecodedTexture;
  if (texture.url.split("?")[0].endsWith(".bin")) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    signal?.throwIfAborted();
    const { rgba, w, h } = parseBin(bytes);
    png = new Blob([bytes], { type: "application/octet-stream" });
    decoded = { rgba: rgba.slice(), width: w, height: h };
  } else {
    png = await response.blob();
    signal?.throwIfAborted();
    decoded = await decodePng(png, signal);
  }
  signal?.throwIfAborted();
  return {
    name: texture.name,
    asset: {
      previewUrl: URL.createObjectURL(png),
      png,
      rgba: decoded.rgba,
      width: decoded.width,
      height: decoded.height,
    },
  };
}

export class Playground {
  source = $state("");
  diags = $state<Diagnostic[]>([]);
  status = $state("loading…");
  textureSlots = $state<TextureSlot[]>([]);
  declarationDiags = $state<Diagnostic[]>([]);
  textureLimitError = $state<string | undefined>();
  title = $state("");
  description = $state("");
  forkOf: string | undefined;
  settings = $state<Settings>({
    autoRun: false,
    microcode: "F3DEX2",
    colorFormat: "RGBA16",
  });

  // transport
  isAnimated = $state(false);
  playing = $state(false);
  errored = $state(false);
  time = $state(0); // seconds
  readonly scrubMax = 10; // seconds (default timeline window)
  fps = $state(0);

  #rafId: number | undefined;
  #startMs = 0; // performance.now() when the current play segment began
  #baseTime = 0; // accumulated play time before the current segment
  #fpsEma = 0;
  #lastFrameMs = 0;
  #lastFpsPushMs = 0;

  #renderer: Renderer | undefined;
  #initPromise: Promise<void> | undefined;
  #debounce: ReturnType<typeof setTimeout> | undefined;
  #renderDiags: Diagnostic[] = [];
  #renderTextures: readonly RenderTextureSnapshot[] = [];

  async init(canvas: HTMLCanvasElement): Promise<void> {
    if (!this.#initPromise) this.#initPromise = this.#initialize(canvas);
    await this.#initPromise;
  }

  async #initialize(canvas: HTMLCanvasElement): Promise<void> {
    await init({
      module_or_path: new URL("../wasm/n64_toys_bg.wasm", import.meta.url),
    });
    this.#renderer = await Renderer.init(canvas);
    this.status = "ready";
    if (this.source) {
      this.reconcileTextureDeclarations();
      this.run();
    }
  }

  #preflightDiags(): Diagnostic[] {
    return [
      ...this.declarationDiags,
      ...(this.textureLimitError
        ? [{ line: 0, msg: this.textureLimitError }]
        : []),
    ];
  }

  #setMergedDiags(renderDiags: Diagnostic[] = this.#renderDiags): Diagnostic[] {
    this.#renderDiags = renderDiags;
    const merged = dedupeDiags([...this.#preflightDiags(), ...renderDiags]);
    if (!sameDiags(this.diags, merged)) this.diags = merged;
    return merged;
  }

  #setTextureSlots(slots: TextureSlot[]): void {
    this.textureSlots = slots;
    this.#renderTextures = snapshotTextures(slots);
  }

  #revokeAssets(slots: TextureSlot[]): void {
    for (const slot of slots) {
      if (slot.asset) URL.revokeObjectURL(slot.asset.previewUrl);
    }
  }

  #renderCurrentSnapshot(t: number): RenderResult | null {
    if (!this.#renderer) return null;
    const snapshot = Object.freeze({
      source: this.source,
      textures: this.#renderTextures,
    });
    return this.#renderer.render(
      snapshot.source,
      t,
      snapshot.textures,
    ) as RenderResult | null;
  }

  #applyRenderResult(result: RenderResult | null): Diagnostic[] {
    const diags = this.#setMergedDiags(result?.diags ?? []);
    const errored = result?.error != null || diags.length > 0;
    this.isAnimated = result?.is_time_variant ?? this.isAnimated;
    // Push only on change to avoid 60fps reactivity + CodeMirror lint thrash.
    const status = result?.error
      ? `error: ${result.error}`
      : diags.length === 0
        ? "drew scene"
        : `${diags.length} diagnostic(s)`;
    if (this.status !== status) this.status = status;
    if (this.errored !== errored) this.errored = errored;
    return diags;
  }

  reconcileTextureDeclarations(): void {
    const parsed = textureDeclarations(this.source) as {
      declarations: TextureDeclaration[];
      diags: Diagnostic[];
    };
    const result = reconcileTextureSlots(
      this.textureSlots,
      parsed.declarations,
    );
    for (const asset of result.orphaned) URL.revokeObjectURL(asset.previewUrl);
    this.#setTextureSlots(result.slots);
    this.declarationDiags = parsed.diags;
    this.textureLimitError = validateTextureLimits(parsed.declarations);
    this.#renderDiags = [];
    this.#setMergedDiags([]);
  }

  async #prepareUserAsset(
    name: string,
    file: File,
    signal?: AbortSignal,
  ): Promise<TextureAsset> {
    const slot = this.textureSlots.find(
      (candidate) => candidate.declaration.name === name,
    );
    if (!slot) throw new Error(`unknown texture declaration: ${name}`);
    if (file.type !== "image/png")
      throw new Error("texture input must be a PNG file");
    if (file.size > MAX_TEXTURE_PNG_BYTES)
      throw new Error("texture PNG exceeds 1 MiB");
    signal?.throwIfAborted();
    const signature = new Uint8Array(
      await file.slice(0, PNG_SIGNATURE.length).arrayBuffer(),
    );
    signal?.throwIfAborted();
    if (!isPngSignature(signature))
      throw new Error("texture file has an invalid PNG signature");

    const decoded = await decodePng(file, signal);
    if (
      decoded.width > MAX_TEXTURE_DIMENSION ||
      decoded.height > MAX_TEXTURE_DIMENSION
    ) {
      throw new Error("texture dimensions exceed 512x512");
    }
    if (
      decoded.width !== slot.declaration.width ||
      decoded.height !== slot.declaration.height
    ) {
      throw new Error(
        `${name} declares ${slot.declaration.width}x${slot.declaration.height} but image is ${decoded.width}x${decoded.height}`,
      );
    }
    if (decoded.rgba.length !== decoded.width * decoded.height * 4) {
      throw new Error(`decoded PNG has ${decoded.rgba.length} RGBA bytes`);
    }
    const aggregate = this.textureSlots.reduce(
      (total, candidate) =>
        total +
        (candidate.declaration.name === name
          ? 0
          : (candidate.asset?.png.size ?? 0)),
      file.size,
    );
    if (aggregate > MAX_TEXTURE_TOTAL_PNG_BYTES) {
      throw new Error("texture PNGs exceed 4 MiB in total");
    }
    signal?.throwIfAborted();
    return {
      previewUrl: URL.createObjectURL(file),
      png: file,
      rgba: decoded.rgba,
      width: decoded.width,
      height: decoded.height,
    };
  }

  async loadTexture(
    name: string,
    file: File,
    { run = true, signal }: TextureLoadOptions = {},
  ): Promise<void> {
    let asset: TextureAsset | undefined;
    try {
      asset = await this.#prepareUserAsset(name, file, signal);
      signal?.throwIfAborted();
      const index = this.textureSlots.findIndex(
        (slot) => slot.declaration.name === name,
      );
      if (index < 0) throw new Error(`unknown texture declaration: ${name}`);
      const current = this.textureSlots[index];
      if (
        asset.width !== current.declaration.width ||
        asset.height !== current.declaration.height
      ) {
        throw new Error(
          `${name} declares ${current.declaration.width}x${current.declaration.height} but image is ${asset.width}x${asset.height}`,
        );
      }
      const aggregate = this.textureSlots.reduce(
        (total, candidate) =>
          total +
          (candidate.declaration.name === name
            ? 0
            : (candidate.asset?.png.size ?? 0)),
        asset.png.size,
      );
      if (aggregate > MAX_TEXTURE_TOTAL_PNG_BYTES) {
        throw new Error("texture PNGs exceed 4 MiB in total");
      }
      const previous = current.asset;
      this.#setTextureSlots(
        this.textureSlots.map((slot, slotIndex) =>
          slotIndex === index ? { declaration: slot.declaration, asset } : slot,
        ),
      );
      if (previous) URL.revokeObjectURL(previous.previewUrl);
    } catch (error) {
      if (asset) URL.revokeObjectURL(asset.previewUrl);
      if (!signal?.aborted) {
        const uploadError =
          error instanceof Error ? error.message : String(error);
        this.#setTextureSlots(
          this.textureSlots.map((slot) =>
            slot.declaration.name === name ? { ...slot, uploadError } : slot,
          ),
        );
      }
      throw error;
    }
    if (run) this.run();
  }

  removeTexture(name: string): void {
    const slot = this.textureSlots.find(
      (candidate) => candidate.declaration.name === name,
    );
    if (!slot?.asset) return;
    URL.revokeObjectURL(slot.asset.previewUrl);
    this.#setTextureSlots(
      this.textureSlots.map((candidate) =>
        candidate.declaration.name === name
          ? { declaration: candidate.declaration }
          : candidate,
      ),
    );
    this.run();
  }

  /** Render a single frame at `t` seconds. Reads the typed RenderOut from wasm. */
  renderFrame(t: number): void {
    if (!this.#renderer) return;
    if (this.textureLimitError) {
      const diags = this.#setMergedDiags([]);
      const status = `${diags.length} diagnostic(s)`;
      if (this.status !== status) this.status = status;
      if (!this.errored) this.errored = true;
      return;
    }
    this.#applyRenderResult(this.#renderCurrentSnapshot(t));
  }

  /** One-shot render at the current time (used by RUN button, autoRun debounce, init). Never auto-plays. */
  run(): void {
    this.renderFrame(this.time);
  }

  /** Synchronously render the exact current source, time, and immutable texture snapshot. */
  renderForCapture(): boolean {
    if (!this.#renderer) return false;
    if (this.textureLimitError) {
      this.renderFrame(this.time);
      return false;
    }
    const result = this.#renderCurrentSnapshot(this.time);
    const diags = this.#applyRenderResult(result);
    // serde-wasm-bindgen serializes Rust `None` to `undefined`, so use loose `!= null`.
    return (
      result !== null &&
      result.error == null &&
      result.diags.length === 0 &&
      diags.length === 0
    );
  }

  #loop = (): void => {
    if (!this.playing || !this.isAnimated) {
      this.pause();
      return;
    }
    // Skip render while hidden, and rebase the clock so no wall-time accrues.
    if (typeof document !== "undefined" && document.hidden) {
      this.#baseTime = this.time;
      this.#startMs = performance.now();
      this.#lastFrameMs = 0;
      this.#rafId = requestAnimationFrame(this.#loop);
      return;
    }
    // While errored, freeze the clock but keep re-rendering so a later clean assemble resumes.
    if (!this.errored) {
      this.time = this.#baseTime + (performance.now() - this.#startMs) / 1000;
      if (this.time > this.scrubMax) {
        this.#baseTime = 0;
        this.#startMs = performance.now();
        this.time = 0;
      }
    }
    const nowMs = performance.now();
    if (this.#lastFrameMs > 0) {
      this.#fpsEma = emaFps(this.#fpsEma, nowMs - this.#lastFrameMs);
      if (nowMs - this.#lastFpsPushMs >= 250) {
        this.fps = Math.round(this.#fpsEma);
        this.#lastFpsPushMs = nowMs;
      }
    }
    this.#lastFrameMs = nowMs;
    this.renderFrame(this.time); // sets this.errored; on error the wasm leaves the last good frame
    if (this.errored) {
      // rebase so playback continues from the frozen time (no jump) once it recovers
      this.#baseTime = this.time;
      this.#startMs = performance.now();
    }
    this.#rafId = requestAnimationFrame(this.#loop);
  };

  play(): void {
    if (this.playing || !this.isAnimated) return;
    this.playing = true;
    this.#baseTime = this.time;
    this.#startMs = performance.now();
    this.#rafId = requestAnimationFrame(this.#loop);
  }

  pause(): void {
    this.playing = false;
    if (this.#rafId != null) cancelAnimationFrame(this.#rafId);
    this.#rafId = undefined;
    this.fps = 0;
    this.#fpsEma = 0;
    this.#lastFrameMs = 0;
  }

  reset(): void {
    this.pause();
    this.time = 0;
    this.#baseTime = 0;
    this.renderFrame(0);
  }

  /** Seek to `t` seconds while paused (deterministic single-frame render). */
  seek(t: number): void {
    this.pause();
    this.time = t;
    this.renderFrame(t);
  }

  /** Cancel the loop + release the play head (call on editor exit). */
  teardown(): void {
    this.pause();
    this.#revokeAssets(this.textureSlots);
    this.#setTextureSlots([]);
  }

  /** Reset the editor to a blank, unrendered draft. */
  async newDraft({ signal }: TransitionOptions = {}): Promise<void> {
    signal?.throwIfAborted();
    this.pause();
    clearTimeout(this.#debounce);
    this.#debounce = undefined;
    this.#revokeAssets(this.textureSlots);
    this.source = "";
    this.title = "";
    this.description = "";
    this.forkOf = undefined;
    this.#setTextureSlots([]);
    this.declarationDiags = [];
    this.textureLimitError = undefined;
    this.#renderDiags = [];
    this.diags = [];
    this.status = "ready";
    this.isAnimated = false;
    this.errored = false;
    this.time = 0;
    this.#baseTime = 0;
  }

  /** Load a toy into the editor as a transient Draft (the editor never mutates the persisted Toy). */
  async loadToy(toy: Toy, { signal }: TransitionOptions = {}): Promise<void> {
    const parsed = textureDeclarations(toy.source) as {
      declarations: TextureDeclaration[];
      diags: Diagnostic[];
    };
    const declarations = reconcileTextureSlots(
      [],
      parsed.declarations,
    ).slots.map((slot) => slot.declaration);
    const limitError = validateTextureLimits(declarations);
    const settled = await Promise.allSettled(
      toy.textures.map((texture) => prepareBundledAsset(texture, signal)),
    );
    const prepared: PreparedAsset[] = [];
    const loadErrors = new Map<string, string>();
    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        prepared.push(result.value);
      } else {
        const reason =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        loadErrors.set(toy.textures[index].name, reason);
      }
    });
    const cleanupPrepared = () => {
      for (const entry of prepared) URL.revokeObjectURL(entry.asset.previewUrl);
    };

    let nextSlots: TextureSlot[];
    try {
      signal?.throwIfAborted();
      const byName = new Map<string, TextureAsset>();
      for (const entry of prepared) {
        if (byName.has(entry.name))
          throw new Error(`duplicate toy texture: ${entry.name}`);
        byName.set(entry.name, entry.asset);
      }
      const declarationsByName = new Map(
        declarations.map((declaration) => [declaration.name, declaration]),
      );
      for (const [name, asset] of byName) {
        const declaration = declarationsByName.get(name);
        if (!declaration) throw new Error(`toy texture is undeclared: ${name}`);
        if (
          asset.width !== declaration.width ||
          asset.height !== declaration.height
        ) {
          throw new Error(
            `${name} declares ${declaration.width}x${declaration.height} but image is ${asset.width}x${asset.height}`,
          );
        }
      }
      const aggregate = prepared.reduce(
        (total, entry) => total + entry.asset.png.size,
        0,
      );
      if (aggregate > MAX_TEXTURE_TOTAL_PNG_BYTES) {
        throw new Error("texture assets exceed 4 MiB in total");
      }
      nextSlots = declarations.map((declaration) => {
        const error = loadErrors.get(declaration.name);
        return {
          declaration,
          asset: byName.get(declaration.name),
          ...(error ? { error } : {}),
        };
      });
      signal?.throwIfAborted();
    } catch (error) {
      cleanupPrepared();
      throw error;
    }

    this.pause(); // cancel any in-flight rAF loop from the previous toy
    this.#revokeAssets(this.textureSlots);
    this.source = toy.source;
    this.title = toy.title;
    this.description = toy.description;
    this.forkOf = toy.slug;
    this.#setTextureSlots(nextSlots);
    this.declarationDiags = parsed.diags;
    this.textureLimitError = limitError;
    this.#renderDiags = [];
    this.#setMergedDiags([]);
    this.time = 0;
    this.#baseTime = 0;
    this.run(); // one-shot render at t=0; sets isAnimated from the typed result
    if (this.isAnimated && !prefersReducedMotion()) this.play();
  }

  scheduleAutoRun(): void {
    if (!this.settings.autoRun) return;
    clearTimeout(this.#debounce);
    this.#debounce = setTimeout(() => this.run(), 300);
  }
}
