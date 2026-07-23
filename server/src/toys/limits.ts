export const LIMITS = {
  maxTextures: 8,
  maxTextureDimension: 512,
  maxTexturePngBytes: 1 * 1024 * 1024,
  maxTotalPngBytes: 4 * 1024 * 1024,
  maxSourceBytes: 256 * 1024,
  maxTitleCodePoints: 80,
  maxDescriptionCodePoints: 500,
  thumbnailWidth: 512,
  thumbnailHeight: 384,
  maxThumbnailBytes: 512 * 1024,
  maxToysPerUser: 50,
  listPageSize: 12,
} as const;

export const ERROR_CODES = {
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  not_found: "not_found",
  validation_error: "validation_error",
  quota_exceeded: "quota_exceeded",
  storage_error: "storage_error",
} as const;

export const utf8ByteLength = (value: string): number =>
  new TextEncoder().encode(value).length;

export const codePointLength = (value: string): number =>
  [...value].length;
