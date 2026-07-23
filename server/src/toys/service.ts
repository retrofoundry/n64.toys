import { createHash } from "node:crypto";

import { and, count, desc, eq, ne, or, sql, type SQL } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { toy, toyTexture, toyThumbnail, user } from "../db/schema.js";
import { parseTextureDeclarations } from "./declarations.js";
import {
  err,
  ok,
  type Result,
  type SaveInput,
  type ToyVisibility,
} from "./dto.js";
import { LIMITS } from "./limits.js";
import { generateSlug } from "./slug.js";

export type ToyTextureRow = {
  name: string;
  width: number;
  height: number;
  format: string;
  mimeType: string;
};

export type ToyRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  visibility: ToyVisibility;
  microcode: string;
  ownerId: string;
  ownerName: string | null;
  thumbnailExists: boolean;
  forkOf: string | null;
  createdAt: Date;
};

export type ToyWithAssetsRow = ToyRow & {
  source: string;
  schemaVersion: number;
  microcode: string;
  textures: ToyTextureRow[];
};

export interface ToyService {
  listPublic(page: number): Promise<{ toys: ToyRow[]; pageCount: number }>;
  listPublicByOwner(
    ownerId: string,
    page: number,
  ): Promise<{ toys: ToyRow[]; pageCount: number }>;
  listByOwner(
    ownerId: string,
    page: number,
  ): Promise<{ toys: ToyRow[]; pageCount: number }>;
  getOwnerName(userId: string): Promise<string | null>;
  getAccessibleToy(
    slug: string,
    viewerId: string | null,
  ): Promise<ToyWithAssetsRow | null>;
  getAccessibleTexture(
    slug: string,
    name: string,
    viewerId: string | null,
  ): Promise<{ bytes: Buffer; mimeType: string } | null>;
  getAccessibleThumbnail(
    slug: string,
    viewerId: string | null,
  ): Promise<{ bytes: Buffer } | null>;
  resolveForkParent(
    slug: string,
    viewerId: string | null,
  ): Promise<{ id: string } | null>;
  create(input: SaveInput): Promise<Result<{ slug: string }>>;
  update(slug: string, input: SaveInput): Promise<Result<{ slug: string }>>;
  deleteOwned(
    slug: string,
    ownerId: string,
  ): Promise<Result<{ slug: string }>>;
}

class QuotaExceeded extends Error {}

function accessCondition(viewerId: string | null): SQL {
  if (viewerId === null) {
    return ne(toy.visibility, "private");
  }

  return or(ne(toy.visibility, "private"), eq(toy.userId, viewerId))!;
}

function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function hash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function isSlugConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { code?: unknown; constraint?: unknown };
  return (
    candidate.code === "23505" &&
    typeof candidate.constraint === "string" &&
    candidate.constraint.includes("slug")
  );
}

function textureValues(toyId: string, input: SaveInput) {
  return input.textures.map((texture) => {
    const data = toBuffer(texture.bytes);
    return {
      toyId,
      name: texture.name,
      data,
      mimeType: "image/png",
      width: texture.width,
      height: texture.height,
      byteLength: data.byteLength,
      contentHash: hash(data),
    };
  });
}

function thumbnailValues(toyId: string, input: SaveInput) {
  if (input.thumbnail === undefined) {
    return null;
  }

  const data = toBuffer(input.thumbnail.bytes);
  return {
    toyId,
    data,
    width: input.thumbnail.width,
    height: input.thumbnail.height,
    byteLength: data.byteLength,
    contentHash: hash(data),
  };
}

export function createToyService(db: Database): ToyService {
  return {
    async listPublic(page) {
      const [rows, totals] = await Promise.all([
        db
          .select({
            id: toy.id,
            slug: toy.slug,
            title: toy.title,
            description: toy.description,
            visibility: toy.visibility,
            microcode: toy.microcode,
            ownerId: toy.userId,
            ownerName: user.name,
            thumbnailExists: sql<boolean>`${toyThumbnail.toyId} is not null`,
            forkOf: toy.forkOf,
            createdAt: toy.createdAt,
          })
          .from(toy)
          .leftJoin(user, eq(toy.userId, user.id))
          .leftJoin(toyThumbnail, eq(toy.id, toyThumbnail.toyId))
          .where(eq(toy.visibility, "public"))
          .orderBy(desc(toy.createdAt))
          .limit(LIMITS.listPageSize)
          .offset((page - 1) * LIMITS.listPageSize),
        db
          .select({ total: count() })
          .from(toy)
          .where(eq(toy.visibility, "public")),
      ]);
      const total = Number(totals[0]?.total ?? 0);
      return {
        toys: rows,
        pageCount: Math.ceil(total / LIMITS.listPageSize),
      };
    },

    async listPublicByOwner(ownerId, page) {
      const ownerPublic = and(
        eq(toy.userId, ownerId),
        eq(toy.visibility, "public"),
      );
      const [rows, totals] = await Promise.all([
        db
          .select({
            id: toy.id,
            slug: toy.slug,
            title: toy.title,
            description: toy.description,
            visibility: toy.visibility,
            microcode: toy.microcode,
            ownerId: toy.userId,
            ownerName: user.name,
            thumbnailExists: sql<boolean>`${toyThumbnail.toyId} is not null`,
            forkOf: toy.forkOf,
            createdAt: toy.createdAt,
          })
          .from(toy)
          .leftJoin(user, eq(toy.userId, user.id))
          .leftJoin(toyThumbnail, eq(toy.id, toyThumbnail.toyId))
          .where(ownerPublic)
          .orderBy(desc(toy.createdAt))
          .limit(LIMITS.listPageSize)
          .offset((page - 1) * LIMITS.listPageSize),
        db.select({ total: count() }).from(toy).where(ownerPublic),
      ]);
      const total = Number(totals[0]?.total ?? 0);
      return {
        toys: rows,
        pageCount: Math.ceil(total / LIMITS.listPageSize),
      };
    },

    async listByOwner(ownerId, page) {
      const [rows, totals] = await Promise.all([
        db
          .select({
            id: toy.id,
            slug: toy.slug,
            title: toy.title,
            description: toy.description,
            visibility: toy.visibility,
            microcode: toy.microcode,
            ownerId: toy.userId,
            ownerName: user.name,
            thumbnailExists: sql<boolean>`${toyThumbnail.toyId} is not null`,
            forkOf: toy.forkOf,
            createdAt: toy.createdAt,
          })
          .from(toy)
          .leftJoin(user, eq(toy.userId, user.id))
          .leftJoin(toyThumbnail, eq(toy.id, toyThumbnail.toyId))
          .where(eq(toy.userId, ownerId))
          .orderBy(desc(toy.updatedAt))
          .limit(LIMITS.listPageSize)
          .offset((page - 1) * LIMITS.listPageSize),
        db.select({ total: count() }).from(toy).where(eq(toy.userId, ownerId)),
      ]);
      const total = Number(totals[0]?.total ?? 0);
      return {
        toys: rows,
        pageCount: Math.ceil(total / LIMITS.listPageSize),
      };
    },

    async getOwnerName(userId) {
      const [row] = await db
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
      return row?.name ?? null;
    },

    async getAccessibleToy(slug, viewerId) {
      const [row] = await db
        .select({
          id: toy.id,
          slug: toy.slug,
          title: toy.title,
          description: toy.description,
          visibility: toy.visibility,
          ownerId: toy.userId,
          ownerName: user.name,
          thumbnailExists: sql<boolean>`${toyThumbnail.toyId} is not null`,
          forkOf: toy.forkOf,
          createdAt: toy.createdAt,
          source: toy.source,
          schemaVersion: toy.schemaVersion,
          microcode: toy.microcode,
        })
        .from(toy)
        .leftJoin(user, eq(toy.userId, user.id))
        .leftJoin(toyThumbnail, eq(toy.id, toyThumbnail.toyId))
        .where(and(eq(toy.slug, slug), accessCondition(viewerId)))
        .limit(1);

      if (row === undefined) {
        return null;
      }

      const textures = await db
        .select({
          name: toyTexture.name,
          width: toyTexture.width,
          height: toyTexture.height,
          mimeType: toyTexture.mimeType,
        })
        .from(toyTexture)
        .where(eq(toyTexture.toyId, row.id));

      const formats = new Map(
        parseTextureDeclarations(row.source).map((texture) => [
          texture.name,
          texture.format,
        ]),
      );

      return {
        ...row,
        textures: textures.map((texture) => ({
          ...texture,
          format: formats.get(texture.name) ?? "",
        })),
      };
    },

    async getAccessibleTexture(slug, name, viewerId) {
      const [row] = await db
        .select({
          bytes: toyTexture.data,
          mimeType: toyTexture.mimeType,
        })
        .from(toy)
        .innerJoin(toyTexture, eq(toy.id, toyTexture.toyId))
        .where(
          and(
            eq(toy.slug, slug),
            eq(toyTexture.name, name),
            accessCondition(viewerId),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async getAccessibleThumbnail(slug, viewerId) {
      const [row] = await db
        .select({ bytes: toyThumbnail.data })
        .from(toy)
        .innerJoin(toyThumbnail, eq(toy.id, toyThumbnail.toyId))
        .where(and(eq(toy.slug, slug), accessCondition(viewerId)))
        .limit(1);
      return row ?? null;
    },

    async resolveForkParent(slug, viewerId) {
      const [row] = await db
        .select({ id: toy.id })
        .from(toy)
        .where(and(eq(toy.slug, slug), accessCondition(viewerId)))
        .limit(1);
      return row ?? null;
    },

    async create(input) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const slug = generateSlug();
        try {
          await db.transaction(async (tx) => {
            const [quota] = await tx
              .select({ total: count() })
              .from(toy)
              .where(eq(toy.userId, input.ownerId));
            if (Number(quota?.total ?? 0) >= LIMITS.maxToysPerUser) {
              throw new QuotaExceeded();
            }

            const [created] = await tx
              .insert(toy)
              .values({
                slug,
                userId: input.ownerId,
                title: input.manifest.title,
                description: input.manifest.description,
                source: input.manifest.source,
                visibility: input.manifest.visibility,
                microcode: input.manifest.microcode,
                schemaVersion: input.manifest.schemaVersion,
                forkOf: input.forkOfId,
              })
              .returning({ id: toy.id });

            if (created === undefined) {
              throw new Error("Toy insert returned no row");
            }

            for (const values of textureValues(created.id, input)) {
              await tx.insert(toyTexture).values(values);
            }

            const thumbnail = thumbnailValues(created.id, input);
            if (thumbnail !== null) {
              await tx.insert(toyThumbnail).values(thumbnail);
            }
          });
          return ok({ slug });
        } catch (error) {
          if (error instanceof QuotaExceeded) {
            return err("quota", "Toy quota exceeded");
          }
          if (isSlugConflict(error)) {
            continue;
          }
          return err("storage", "Unable to save toy");
        }
      }

      return err("storage", "Unable to allocate a unique toy slug");
    },

    async update(slug, input) {
      try {
        return await db.transaction(async (tx) => {
          const [existing] = await tx
            .select({
              id: toy.id,
              userId: toy.userId,
              forkOf: toy.forkOf,
            })
            .from(toy)
            .where(eq(toy.slug, slug))
            .for("update");

          if (existing === undefined) {
            return err("not_found", "Toy not found");
          }
          if (existing.userId !== input.ownerId) {
            return err("forbidden", "Toy is owned by another user");
          }

          await tx
            .update(toy)
            .set({
              title: input.manifest.title,
              description: input.manifest.description,
              source: input.manifest.source,
              visibility: input.manifest.visibility,
              microcode: input.manifest.microcode,
              updatedAt: new Date(),
            })
            .where(eq(toy.id, existing.id));

          await tx.delete(toyTexture).where(eq(toyTexture.toyId, existing.id));
          for (const values of textureValues(existing.id, input)) {
            await tx.insert(toyTexture).values(values);
          }

          const thumbnail = thumbnailValues(existing.id, input);
          if (thumbnail === null) {
            await tx
              .delete(toyThumbnail)
              .where(eq(toyThumbnail.toyId, existing.id));
          } else {
            await tx
              .insert(toyThumbnail)
              .values(thumbnail)
              .onConflictDoUpdate({
                target: toyThumbnail.toyId,
                set: {
                  data: thumbnail.data,
                  width: thumbnail.width,
                  height: thumbnail.height,
                  byteLength: thumbnail.byteLength,
                  contentHash: thumbnail.contentHash,
                  updatedAt: new Date(),
                },
              });
          }

          return ok({ slug });
        });
      } catch {
        return err("storage", "Unable to update toy");
      }
    },

    async deleteOwned(slug, ownerId) {
      try {
        return await db.transaction(async (tx) => {
          const [existing] = await tx
            .select({
              id: toy.id,
              userId: toy.userId,
            })
            .from(toy)
            .where(eq(toy.slug, slug))
            .for("update");

          if (existing === undefined) {
            return err("not_found", "Toy not found");
          }
          if (existing.userId !== ownerId) {
            return err("forbidden", "Toy is owned by another user");
          }

          await tx.delete(toy).where(eq(toy.id, existing.id));
          return ok({ slug });
        });
      } catch {
        return err("storage", "Unable to delete toy");
      }
    },
  };
}
