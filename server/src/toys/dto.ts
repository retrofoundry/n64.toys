import { toyVisibility } from "../db/schema.js";

export type ToyVisibility = (typeof toyVisibility)[number];

export type ToyOwnerDto = { id: string; displayName: string };
export type ToyTextureDto = {
  name: string;
  width: number;
  height: number;
  format: string;
  url: string;
};
export type ToySummaryDto = {
  slug: string;
  title: string;
  description: string;
  visibility: ToyVisibility;
  microcode: string;
  owner: ToyOwnerDto;
  thumbnailUrl: string | null;
  forkOf: string | null;
  isOwner: boolean;
  createdAt: string;
};
export type ToyDetailDto = ToySummaryDto & {
  source: string;
  schemaVersion: 1;
  microcode: string;
  textures: ToyTextureDto[];
};
export type ToyListDto = {
  toys: ToySummaryDto[];
  page: number;
  pageCount: number;
};
export type UserToysDto = {
  owner: ToyOwnerDto;
  toys: ToySummaryDto[];
  page: number;
  pageCount: number;
};

export type SaveManifest = {
  title: string;
  description: string;
  source: string;
  visibility: ToyVisibility;
  schemaVersion: 1;
  microcode: string;
  forkOfSlug?: string;
  textures: { name: string; part: string }[];
  thumbnailPart?: string;
};

export type DecodedTexture = {
  name: string;
  bytes: Uint8Array;
  width: number;
  height: number;
  format: string;
  contentHash: string;
};
export type ThumbnailInput = {
  bytes: Uint8Array;
  width: number;
  height: number;
  contentHash: string;
};
export type SaveInput = {
  ownerId: string;
  manifest: SaveManifest;
  textures: DecodedTexture[];
  thumbnail?: ThumbnailInput;
  forkOfId: string | null;
};

export type ServiceErrorKind =
  | "not_found"
  | "forbidden"
  | "quota"
  | "conflict"
  | "storage"
  | "validation";
export type ServiceError = {
  kind: ServiceErrorKind;
  message: string;
};
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: ServiceError };

export interface SaveTransport {
  create(body: FormData): Promise<Result<{ slug: string }>>;
  update(
    slug: string,
    body: FormData,
  ): Promise<Result<{ slug: string }>>;
}

export function isToyVisibility(x: unknown): x is ToyVisibility {
  return toyVisibility.some((visibility) => visibility === x);
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(
  kind: ServiceErrorKind,
  message: string,
): Result<never> {
  return { ok: false, error: { kind, message } };
}
