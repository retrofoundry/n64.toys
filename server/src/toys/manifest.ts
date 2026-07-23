import {
  err,
  isToyVisibility,
  ok,
  type Result,
  type SaveManifest,
} from "./dto.js";
import {
  codePointLength,
  LIMITS,
  utf8ByteLength,
} from "./limits.js";

function validationError(message: string): Result<never> {
  return err("validation", message);
}

export function parseManifest(raw: unknown): Result<SaveManifest> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return validationError("Manifest must be an object.");
  }

  const value = raw as Record<string, unknown>;

  if (typeof value.title !== "string") {
    return validationError("Title must be a string.");
  }
  if (codePointLength(value.title) > LIMITS.maxTitleCodePoints) {
    return validationError(
      `Title must be at most ${LIMITS.maxTitleCodePoints} Unicode code points.`,
    );
  }

  if (typeof value.description !== "string") {
    return validationError("Description must be a string.");
  }
  if (
    codePointLength(value.description) >
    LIMITS.maxDescriptionCodePoints
  ) {
    return validationError(
      `Description must be at most ${LIMITS.maxDescriptionCodePoints} Unicode code points.`,
    );
  }

  if (typeof value.source !== "string") {
    return validationError("Source must be a string.");
  }
  if (utf8ByteLength(value.source) > LIMITS.maxSourceBytes) {
    return validationError(
      `Source must be at most ${LIMITS.maxSourceBytes} UTF-8 bytes.`,
    );
  }

  if (!isToyVisibility(value.visibility)) {
    return validationError("Visibility must be private, unlisted, or public.");
  }

  if (value.schemaVersion !== 1) {
    return validationError("Schema version must be 1.");
  }

  if (typeof value.microcode !== "string") {
    return validationError("Microcode must be a string.");
  }

  if (!Array.isArray(value.textures)) {
    return validationError("Textures must be an array.");
  }
  if (value.textures.length > LIMITS.maxTextures) {
    return validationError(
      `A toy may contain at most ${LIMITS.maxTextures} textures.`,
    );
  }

  const textures: SaveManifest["textures"] = [];
  const names = new Set<string>();
  const parts = new Set<string>();

  for (const entry of value.textures) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      Array.isArray(entry)
    ) {
      return validationError("Each texture must be an object.");
    }

    const texture = entry as Record<string, unknown>;
    if (typeof texture.name !== "string") {
      return validationError("Each texture name must be a string.");
    }
    if (typeof texture.part !== "string") {
      return validationError("Each texture part must be a string.");
    }
    if (names.has(texture.name)) {
      return validationError(
        `Texture name '${texture.name}' must be unique.`,
      );
    }
    if (parts.has(texture.part)) {
      return validationError(
        `Texture part '${texture.part}' must be unique.`,
      );
    }

    names.add(texture.name);
    parts.add(texture.part);
    textures.push({ name: texture.name, part: texture.part });
  }

  if (
    value.forkOfSlug !== undefined &&
    typeof value.forkOfSlug !== "string"
  ) {
    return validationError("Fork slug must be a string when provided.");
  }

  if (
    value.thumbnailPart !== undefined &&
    typeof value.thumbnailPart !== "string"
  ) {
    return validationError(
      "Thumbnail part must be a string when provided.",
    );
  }

  const manifest: SaveManifest = {
    title: value.title,
    description: value.description,
    source: value.source,
    visibility: value.visibility,
    schemaVersion: value.schemaVersion,
    microcode: value.microcode,
    textures,
  };

  if (value.forkOfSlug !== undefined) {
    manifest.forkOfSlug = value.forkOfSlug;
  }
  if (value.thumbnailPart !== undefined) {
    manifest.thumbnailPart = value.thumbnailPart;
  }

  return ok(manifest);
}
