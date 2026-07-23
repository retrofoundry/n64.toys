import { createHash } from "node:crypto";

import { Hono, type Context } from "hono";

import type { AppDependencies, AuthedUser } from "../app.js";
import { parseTextureDeclarations } from "./declarations.js";
import type {
  DecodedTexture,
  Result,
  SaveInput,
  SaveManifest,
  ThumbnailInput,
  ToyDetailDto,
  ToyListDto,
  ToySummaryDto,
} from "./dto.js";
import { ERROR_CODES, LIMITS } from "./limits.js";
import { parseManifest } from "./manifest.js";
import { decodePng, readPngHeader } from "./png.js";
import type { ToyRow, ToyWithAssetsRow } from "./service.js";

const NO_STORE = "private, no-store";

type ErrorStatus = 400 | 401 | 403 | 404 | 413 | 500;
type MultipartValue = {
  manifest: SaveManifest;
  textures: DecodedTexture[];
  thumbnail?: ThumbnailInput;
};
type MultipartResult =
  | { ok: true; value: MultipartValue }
  | { ok: false; message: string };

function errorResponse(
  context: Context,
  status: ErrorStatus,
  code: string,
  message: string,
): Response {
  return context.json({ error: { code, message } }, status);
}

function validationFailure(message: string): MultipartResult {
  return { ok: false, message };
}

function notFound(context: Context): Response {
  return errorResponse(context, 404, ERROR_CODES.not_found, "Not found");
}

function enforceOrigin(
  context: Context,
  dependencies: AppDependencies,
): Response | null {
  const origin = context.req.header("Origin");
  if (
    origin !== undefined &&
    (origin === "null" || !dependencies.trustedOrigins.includes(origin))
  ) {
    return errorResponse(context, 403, ERROR_CODES.forbidden, "Forbidden");
  }
  return null;
}

async function requireUser(
  context: Context,
  dependencies: AppDependencies,
): Promise<AuthedUser | Response> {
  const user = await dependencies.getSession(context.req.raw.headers);
  if (user === null) {
    return errorResponse(
      context,
      401,
      ERROR_CODES.unauthorized,
      "Unauthorized",
    );
  }
  return user;
}

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function toSummary(
  row: ToyRow,
  viewerId: string | null,
): ToySummaryDto {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    microcode: row.microcode,
    owner: {
      id: row.ownerId,
      displayName: row.ownerName ?? "",
    },
    thumbnailUrl: row.thumbnailExists
      ? `/api/toys/${row.slug}/thumbnail`
      : null,
    // Resolving parent slugs here could leak a private toy.
    forkOf: null,
    isOwner: viewerId !== null && row.ownerId === viewerId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDetail(
  row: ToyWithAssetsRow,
  viewerId: string | null,
): ToyDetailDto {
  return {
    ...toSummary(row, viewerId),
    source: row.source,
    schemaVersion: row.schemaVersion as 1,
    microcode: row.microcode,
    textures: row.textures.map((texture) => ({
      name: texture.name,
      width: texture.width,
      height: texture.height,
      format: texture.format,
      url: `/api/toys/${row.slug}/textures/${encodeURIComponent(texture.name)}`,
    })),
  };
}

async function bodyExceedsLimit(
  request: Request,
  maxBodyBytes: number,
): Promise<boolean> {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (Number.isFinite(parsed) && parsed > maxBodyBytes) {
      return true;
    }
  }

  const body = request.clone().body;
  if (body === null) {
    return false;
  }

  const reader = body.getReader();
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return false;
    }
    byteLength += value.byteLength;
    if (byteLength > maxBodyBytes) {
      void reader.cancel().catch(() => undefined);
      return true;
    }
  }
}

function isPngFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string" && value.type === "image/png";
}

async function readMultipart(
  context: Context,
  ignoreForkOfSlug: boolean,
): Promise<MultipartResult> {
  let form: FormData;
  try {
    form = await context.req.formData();
  } catch {
    return validationFailure("Invalid multipart form data.");
  }

  const manifestParts = form.getAll("manifest");
  if (manifestParts.length !== 1) {
    return validationFailure("Exactly one manifest part is required.");
  }

  const manifestPart = manifestParts[0];
  let rawManifest: unknown;
  try {
    const json =
      typeof manifestPart === "string"
        ? manifestPart
        : await manifestPart.text();
    rawManifest = JSON.parse(json);
  } catch {
    return validationFailure("Manifest must contain valid JSON.");
  }

  if (
    ignoreForkOfSlug &&
    typeof rawManifest === "object" &&
    rawManifest !== null &&
    !Array.isArray(rawManifest)
  ) {
    const { forkOfSlug: _ignored, ...rest } = rawManifest as Record<
      string,
      unknown
    >;
    rawManifest = rest;
  }

  const parsedManifest = parseManifest(rawManifest);
  if (!parsedManifest.ok) {
    return validationFailure(parsedManifest.error.message);
  }
  const manifest = parsedManifest.value;
  const declarations = parseTextureDeclarations(manifest.source);
  const declarationsByName = new Map(
    declarations.map((declaration) => [declaration.name, declaration]),
  );
  if (declarationsByName.size !== declarations.length) {
    return validationFailure("Texture declarations must have unique names.");
  }

  const manifestByName = new Map(
    manifest.textures.map((texture) => [texture.name, texture]),
  );
  if (
    declarations.some((declaration) => !manifestByName.has(declaration.name)) ||
    manifest.textures.some((texture) => !declarationsByName.has(texture.name))
  ) {
    return validationFailure(
      "Every texture declaration must have exactly one PNG part.",
    );
  }

  const texturePartNames = new Set(
    manifest.textures.map((texture) => texture.part),
  );
  if (
    manifest.thumbnailPart !== undefined &&
    texturePartNames.has(manifest.thumbnailPart)
  ) {
    return validationFailure("Multipart part names must be unique.");
  }

  const allowedParts = new Set(["manifest", ...texturePartNames]);
  if (manifest.thumbnailPart !== undefined) {
    allowedParts.add(manifest.thumbnailPart);
  }
  for (const name of form.keys()) {
    if (!allowedParts.has(name)) {
      return validationFailure(`Multipart part '${name}' is undeclared.`);
    }
  }

  const files: Array<{
    file: File;
    name: string;
    width: number;
    height: number;
    format: string;
  }> = [];
  for (const texture of manifest.textures) {
    const declaration = declarationsByName.get(texture.name);
    if (declaration === undefined) {
      return validationFailure(
        "Every texture declaration must have exactly one PNG part.",
      );
    }
    const parts = form.getAll(texture.part);
    if (parts.length !== 1 || !isPngFile(parts[0])) {
      return validationFailure(
        `Texture '${texture.name}' must have exactly one PNG part.`,
      );
    }
    files.push({
      file: parts[0],
      name: texture.name,
      width: declaration.width,
      height: declaration.height,
      format: declaration.format,
    });
  }

  const textureBytes: Array<{
    bytes: Uint8Array;
    name: string;
    width: number;
    height: number;
    format: string;
  }> = [];
  let totalPngBytes = 0;
  for (const file of files) {
    if (file.file.size > LIMITS.maxTexturePngBytes) {
      return validationFailure(
        `Texture '${file.name}' exceeds the encoded PNG byte limit.`,
      );
    }
    totalPngBytes += file.file.size;
    if (totalPngBytes > LIMITS.maxTotalPngBytes) {
      return validationFailure("Texture PNGs exceed the total byte limit.");
    }
    textureBytes.push({
      ...file,
      bytes: new Uint8Array(await file.file.arrayBuffer()),
    });
  }

  const textures: DecodedTexture[] = [];
  for (const texture of textureBytes) {
    const header = readPngHeader(texture.bytes);
    if (
      header === null ||
      header.width > LIMITS.maxTextureDimension ||
      header.height > LIMITS.maxTextureDimension
    ) {
      return validationFailure(
        `Texture '${texture.name}' has invalid PNG dimensions.`,
      );
    }

    const decoded = decodePng(texture.bytes);
    if ("error" in decoded) {
      return validationFailure(`Texture '${texture.name}' is not a valid PNG.`);
    }
    if (decoded.width !== texture.width || decoded.height !== texture.height) {
      return validationFailure(
        `Texture '${texture.name}' dimensions do not match its declaration.`,
      );
    }

    textures.push({
      name: texture.name,
      bytes: texture.bytes,
      width: decoded.width,
      height: decoded.height,
      format: texture.format,
      contentHash: hash(texture.bytes),
    });
  }

  let thumbnail: ThumbnailInput | undefined;
  if (manifest.thumbnailPart !== undefined) {
    const parts = form.getAll(manifest.thumbnailPart);
    if (parts.length !== 1 || !isPngFile(parts[0])) {
      return validationFailure("Thumbnail must have exactly one PNG part.");
    }
    const file = parts[0];
    if (file.size > LIMITS.maxThumbnailBytes) {
      return validationFailure("Thumbnail exceeds the encoded PNG byte limit.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = readPngHeader(bytes);
    if (
      header === null ||
      header.width !== LIMITS.thumbnailWidth ||
      header.height !== LIMITS.thumbnailHeight
    ) {
      return validationFailure("Thumbnail dimensions must be 512x384.");
    }
    const decoded = decodePng(bytes);
    if (
      "error" in decoded ||
      decoded.width !== LIMITS.thumbnailWidth ||
      decoded.height !== LIMITS.thumbnailHeight
    ) {
      return validationFailure("Thumbnail is not a valid 512x384 PNG.");
    }
    thumbnail = {
      bytes,
      width: decoded.width,
      height: decoded.height,
      contentHash: hash(bytes),
    };
  }

  return {
    ok: true,
    value: {
      manifest,
      textures,
      ...(thumbnail === undefined ? {} : { thumbnail }),
    },
  };
}

function publicPublishError(value: MultipartValue): string | null {
  if (value.manifest.visibility !== "public") {
    return null;
  }
  if (value.manifest.title.trim().length === 0) {
    return "A public toy must have a non-empty title.";
  }
  if (
    value.textures.length !==
    parseTextureDeclarations(value.manifest.source).length
  ) {
    return "A public toy must include every declared texture.";
  }
  if (value.thumbnail === undefined) {
    return "A public toy must include a valid thumbnail.";
  }
  return null;
}

function mapServiceResult(
  context: Context,
  result: Result<{ slug: string }>,
  successStatus: 200 | 201,
): Response {
  if (result.ok) {
    return context.json(result.value, successStatus);
  }

  switch (result.error.kind) {
    case "not_found":
    case "forbidden":
      return notFound(context);
    case "quota":
      return errorResponse(
        context,
        400,
        ERROR_CODES.quota_exceeded,
        "Toy quota exceeded",
      );
    case "validation":
    case "conflict":
      return errorResponse(
        context,
        400,
        ERROR_CODES.validation_error,
        "Invalid toy data",
      );
    case "storage":
      return errorResponse(
        context,
        500,
        ERROR_CODES.storage_error,
        "Unable to save toy",
      );
  }
}

export function createToysRouter(dependencies: AppDependencies): Hono {
  const app = new Hono();

  app.use("*", async (context, next) => {
    await next();
    context.res.headers.set("Cache-Control", NO_STORE);
  });

  app.get("/", async (context) => {
    const rawPage = Number.parseInt(context.req.query("page") ?? "1", 10);
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
    const result = await dependencies.toys.listPublic(page);
    return context.json({
      toys: result.toys.map((toy) => toSummary(toy, null)),
      page,
      pageCount: result.pageCount,
    });
  });

  app.get("/mine", async (context) => {
    const viewer = await dependencies.getSession(context.req.raw.headers);
    if (viewer === null) {
      return errorResponse(
        context,
        401,
        ERROR_CODES.unauthorized,
        "Unauthorized",
      );
    }

    const rawPage = Number.parseInt(context.req.query("page") ?? "1", 10);
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
    const result = await dependencies.toys.listByOwner(viewer.id, page);
    const response: ToyListDto = {
      toys: result.toys.map((toy) => toSummary(toy, viewer.id)),
      page,
      pageCount: result.pageCount,
    };
    return context.json(response);
  });

  app.get("/:slug", async (context) => {
    const viewer = await dependencies.getSession(context.req.raw.headers);
    const toy = await dependencies.toys.getAccessibleToy(
      context.req.param("slug"),
      viewer?.id ?? null,
    );
    return toy === null
      ? notFound(context)
      : context.json(toDetail(toy, viewer?.id ?? null));
  });

  app.get("/:slug/textures/:name", async (context) => {
    const viewer = await dependencies.getSession(context.req.raw.headers);
    const texture = await dependencies.toys.getAccessibleTexture(
      context.req.param("slug"),
      context.req.param("name"),
      viewer?.id ?? null,
    );
    if (texture === null) {
      return notFound(context);
    }
    return new Response(new Uint8Array(texture.bytes), {
      headers: { "Content-Type": "image/png" },
    });
  });

  app.get("/:slug/thumbnail", async (context) => {
    const viewer = await dependencies.getSession(context.req.raw.headers);
    const thumbnail = await dependencies.toys.getAccessibleThumbnail(
      context.req.param("slug"),
      viewer?.id ?? null,
    );
    if (thumbnail === null) {
      return notFound(context);
    }
    return new Response(new Uint8Array(thumbnail.bytes), {
      headers: { "Content-Type": "image/png" },
    });
  });

  async function save(
    context: Context,
    updateSlug?: string,
  ): Promise<Response> {
    if (await bodyExceedsLimit(context.req.raw, dependencies.maxBodyBytes)) {
      return errorResponse(
        context,
        413,
        ERROR_CODES.validation_error,
        "Payload too large",
      );
    }

    const originError = enforceOrigin(context, dependencies);
    if (originError !== null) return originError;

    const user = await requireUser(context, dependencies);
    if (user instanceof Response) return user;

    const multipart = await readMultipart(context, updateSlug !== undefined);
    if (!multipart.ok) {
      return errorResponse(
        context,
        400,
        ERROR_CODES.validation_error,
        multipart.message,
      );
    }

    let manifest = { ...multipart.value.manifest };
    let forkOfId: string | null = null;
    if (updateSlug === undefined && manifest.forkOfSlug !== undefined) {
      const parent = await dependencies.toys.resolveForkParent(
        manifest.forkOfSlug,
        user.id,
      );
      if (parent === null) {
        return errorResponse(
          context,
          400,
          ERROR_CODES.validation_error,
          "Fork parent is unavailable",
        );
      }
      forkOfId = parent.id;
      manifest = { ...manifest, visibility: "private" };
    }

    const publishError = publicPublishError({
      ...multipart.value,
      manifest,
    });
    if (publishError !== null) {
      return errorResponse(
        context,
        400,
        ERROR_CODES.validation_error,
        publishError,
      );
    }

    const input: SaveInput = {
      ownerId: user.id,
      manifest,
      textures: multipart.value.textures,
      ...(multipart.value.thumbnail === undefined
        ? {}
        : { thumbnail: multipart.value.thumbnail }),
      forkOfId,
    };
    if (updateSlug === undefined) {
      return mapServiceResult(
        context,
        await dependencies.toys.create(input),
        201,
      );
    }
    return mapServiceResult(
      context,
      await dependencies.toys.update(updateSlug, input),
      200,
    );
  }

  app.post("/", (context) => save(context));
  app.put("/:slug", (context) => save(context, context.req.param("slug")));
  app.delete("/:slug", async (context) => {
    const originError = enforceOrigin(context, dependencies);
    if (originError !== null) return originError;

    const user = await requireUser(context, dependencies);
    if (user instanceof Response) return user;

    return mapServiceResult(
      context,
      await dependencies.toys.deleteOwned(context.req.param("slug"), user.id),
      200,
    );
  });

  return app;
}
