import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { Database } from "../db/client.js";
import { toy, toyTexture, toyThumbnail, user } from "../db/schema.js";
import type { SaveInput, ToyVisibility } from "./dto.js";
import { LIMITS } from "./limits.js";
import { createToyService, type ToyRow } from "./service.js";

type RecordedOperation = {
  kind: "insert" | "update" | "delete";
  table: unknown;
  values?: unknown;
};

type RecordedSelect = {
  fields?: Record<string, unknown>;
  from?: unknown;
  leftJoins: unknown[];
  where?: unknown;
  orderBy: unknown[];
  limit?: number;
  offset?: number;
};

type FakeOptions = {
  selectResults?: unknown[][];
  totalCount?: number;
  toyInsertErrors?: unknown[];
  toyOwnerIds?: string[];
};

function makeFakeDatabase(options: FakeOptions = {}) {
  const selectResults = [...(options.selectResults ?? [])];
  const toyInsertErrors = [...(options.toyInsertErrors ?? [])];
  const toyOwnerIds = [...(options.toyOwnerIds ?? [])];
  const operations: RecordedOperation[] = [];
  const attemptedSlugs: string[] = [];
  const locks: string[] = [];
  const selects: RecordedSelect[] = [];
  let transactionCount = 0;

  const mutation = (resolveValue: unknown = undefined) => {
    const promise = () => Promise.resolve(resolveValue);
    return {
      where() {
        return this;
      },
      onConflictDoUpdate() {
        return this;
      },
      returning: async () => resolveValue,
      then<TResult1 = unknown, TResult2 = never>(
        onfulfilled?:
          | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?:
          | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
          | null,
      ) {
        return promise().then(onfulfilled, onrejected);
      },
    };
  };

  const fake = {
    select(fields?: Record<string, unknown>) {
      const result =
        fields !== undefined && "total" in fields
          ? [{ total: options.totalCount ?? toyOwnerIds.length }]
          : (selectResults.shift() ?? []);
      const selected: RecordedSelect = {
        fields,
        leftJoins: [],
        orderBy: [],
      };
      selects.push(selected);
      const builder = {
        from(table: unknown) {
          selected.from = table;
          return this;
        },
        leftJoin(table: unknown) {
          selected.leftJoins.push(table);
          return this;
        },
        where(condition: unknown) {
          selected.where = condition;
          return this;
        },
        orderBy(...clauses: unknown[]) {
          selected.orderBy.push(...clauses);
          return this;
        },
        limit(value: number) {
          selected.limit = value;
          return this;
        },
        offset(value: number) {
          selected.offset = value;
          return this;
        },
        for(lock: string) {
          locks.push(lock);
          return this;
        },
        then<TResult1 = unknown[], TResult2 = never>(
          onfulfilled?:
            | ((value: unknown[]) => TResult1 | PromiseLike<TResult1>)
            | null,
          onrejected?:
            | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
            | null,
        ) {
          return Promise.resolve(result).then(onfulfilled, onrejected);
        },
      };
      return builder;
    },
    insert(table: unknown) {
      return {
        values(values: unknown) {
          operations.push({ kind: "insert", table, values });
          if (table === toy) {
            const row = values as { slug: string; userId: string };
            attemptedSlugs.push(row.slug);
            const failure = toyInsertErrors.shift();
            if (failure !== undefined) {
              return {
                returning: async () => Promise.reject(failure),
              };
            }
            return {
              returning: async () => {
                toyOwnerIds.push(row.userId);
                return [{ id: "toy-id" }];
              },
            };
          }
          return mutation();
        },
      };
    },
    update(table: unknown) {
      return {
        set(values: unknown) {
          operations.push({ kind: "update", table, values });
          return mutation();
        },
      };
    },
    delete(table: unknown) {
      operations.push({ kind: "delete", table });
      return mutation();
    },
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      transactionCount += 1;
      const operationCount = operations.length;
      const ownerCount = toyOwnerIds.length;
      try {
        return await fn(fake);
      } catch (error) {
        operations.splice(operationCount);
        toyOwnerIds.splice(ownerCount);
        throw error;
      }
    },
  };

  return {
    db: fake as unknown as Database,
    operations,
    attemptedSlugs,
    locks,
    selects,
    get transactionCount() {
      return transactionCount;
    },
  };
}

function containsSqlChunk(value: unknown, expected: unknown): boolean {
  if (value === expected) {
    return true;
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const chunks = (value as { queryChunks?: unknown[] }).queryChunks;
  return chunks?.some((chunk) => containsSqlChunk(chunk, expected)) ?? false;
}

function sqlParameterValues(value: unknown): unknown[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  if (value.constructor.name === "Param") {
    return [(value as { value: unknown }).value];
  }
  const chunks = (value as { queryChunks?: unknown[] }).queryChunks;
  return chunks?.flatMap(sqlParameterValues) ?? [];
}

function toyRow(visibility: ToyVisibility): ToyRow {
  return {
    id: `${visibility}-id`,
    slug: `${visibility}-toy`,
    title: `${visibility} toy`,
    description: "Description",
    visibility,
    microcode: "F3DEX2",
    ownerId: "owner-1",
    ownerName: "Owner",
    thumbnailExists: false,
    forkOf: null,
    createdAt: new Date("2026-07-22T12:00:00.000Z"),
  };
}

function saveInput(overrides: Partial<SaveInput> = {}): SaveInput {
  const textureBacking = Uint8Array.from([99, 1, 2, 3, 88]);
  return {
    ownerId: "owner-1",
    manifest: {
      title: "A toy",
      description: "Description",
      source: "gsSPEndDisplayList(),",
      visibility: "public",
      schemaVersion: 1,
      microcode: "F3DEX2",
      textures: [{ name: "brick", part: "texture-brick" }],
    },
    textures: [
      {
        name: "brick",
        bytes: textureBacking.subarray(1, 4),
        width: 2,
        height: 3,
        format: "rgba16",
        contentHash: "ignored-client-hash",
      },
    ],
    thumbnail: {
      bytes: Uint8Array.from([4, 5, 6]),
      width: 512,
      height: 384,
      contentHash: "ignored-client-thumbnail-hash",
    },
    forkOfId: "00000000-0000-0000-0000-000000000001",
    ...overrides,
  };
}

describe("createToyService", () => {
  it("lists only public toys for one owner with paginated totals", async () => {
    const rows = [toyRow("public")];
    const fake = makeFakeDatabase({
      selectResults: [rows],
      totalCount: LIMITS.listPageSize + 1,
    });

    const result = await createToyService(fake.db).listPublicByOwner(
      "owner-1",
      2,
    );

    expect(result).toEqual({ toys: rows, pageCount: 2 });
    expect(fake.selects).toHaveLength(2);
    const [listSelect, countSelect] = fake.selects;
    expect(listSelect?.from).toBe(toy);
    expect(listSelect?.leftJoins).toEqual([user, toyThumbnail]);
    expect(containsSqlChunk(listSelect?.where, toy.userId)).toBe(true);
    expect(containsSqlChunk(listSelect?.where, toy.visibility)).toBe(true);
    expect(sqlParameterValues(listSelect?.where)).toEqual([
      "owner-1",
      "public",
    ]);
    expect(containsSqlChunk(listSelect?.orderBy[0], toy.createdAt)).toBe(true);
    expect(listSelect?.limit).toBe(LIMITS.listPageSize);
    expect(listSelect?.offset).toBe(LIMITS.listPageSize);
    expect(countSelect?.from).toBe(toy);
    expect(containsSqlChunk(countSelect?.where, toy.userId)).toBe(true);
    expect(containsSqlChunk(countSelect?.where, toy.visibility)).toBe(true);
    expect(sqlParameterValues(countSelect?.where)).toEqual([
      "owner-1",
      "public",
    ]);
  });

  it("returns an owner's display name when the user exists", async () => {
    const fake = makeFakeDatabase({
      selectResults: [[{ name: "Ada Hopper" }]],
    });

    await expect(
      createToyService(fake.db).getOwnerName("owner-1"),
    ).resolves.toBe("Ada Hopper");

    expect(fake.selects).toHaveLength(1);
    expect(fake.selects[0]?.from).toBe(user);
    expect(Object.keys(fake.selects[0]?.fields ?? {})).toEqual(["name"]);
    expect(containsSqlChunk(fake.selects[0]?.where, user.id)).toBe(true);
    expect(sqlParameterValues(fake.selects[0]?.where)).toEqual(["owner-1"]);
    expect(fake.selects[0]?.limit).toBe(1);
  });

  it("returns null when an owner does not exist", async () => {
    const fake = makeFakeDatabase({ selectResults: [[]] });

    await expect(
      createToyService(fake.db).getOwnerName("missing-owner"),
    ).resolves.toBeNull();
  });

  it("lists every visibility for an owner with paginated totals", async () => {
    const rows = [toyRow("private"), toyRow("unlisted"), toyRow("public")];
    const fake = makeFakeDatabase({
      selectResults: [rows],
      totalCount: LIMITS.listPageSize + 1,
    });

    const result = await createToyService(fake.db).listByOwner("owner-1", 2);

    expect(result).toEqual({ toys: rows, pageCount: 2 });
    expect(fake.selects).toHaveLength(2);
    const [listSelect, countSelect] = fake.selects;
    expect(listSelect?.from).toBe(toy);
    expect(listSelect?.leftJoins).toEqual([user, toyThumbnail]);
    expect(Object.keys(listSelect?.fields ?? {})).toEqual([
      "id",
      "slug",
      "title",
      "description",
      "visibility",
      "microcode",
      "ownerId",
      "ownerName",
      "thumbnailExists",
      "forkOf",
      "createdAt",
    ]);
    expect(containsSqlChunk(listSelect?.where, toy.userId)).toBe(true);
    expect(containsSqlChunk(listSelect?.where, toy.visibility)).toBe(false);
    expect(sqlParameterValues(listSelect?.where)).toEqual(["owner-1"]);
    expect(containsSqlChunk(listSelect?.orderBy[0], toy.updatedAt)).toBe(true);
    expect(listSelect?.limit).toBe(LIMITS.listPageSize);
    expect(listSelect?.offset).toBe(LIMITS.listPageSize);
    expect(countSelect?.from).toBe(toy);
    expect(containsSqlChunk(countSelect?.where, toy.userId)).toBe(true);
    expect(containsSqlChunk(countSelect?.where, toy.visibility)).toBe(false);
    expect(sqlParameterValues(countSelect?.where)).toEqual(["owner-1"]);
  });

  it("creates a toy and its binary assets in one transaction", async () => {
    const fake = makeFakeDatabase();
    const input = saveInput({
      textures: [
        ...saveInput().textures,
        {
          name: "grass",
          bytes: Uint8Array.from([7, 8]),
          width: 4,
          height: 5,
          format: "ia8",
          contentHash: "also-ignored",
        },
      ],
    });

    const result = await createToyService(fake.db).create(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(fake.transactionCount).toBe(1);

    const toyInsert = fake.operations.find(
      (operation) => operation.kind === "insert" && operation.table === toy,
    );
    expect(toyInsert?.values).toMatchObject({
      slug: result.value.slug,
      userId: input.ownerId,
      visibility: input.manifest.visibility,
      forkOf: input.forkOfId,
    });

    const textureInserts = fake.operations.filter(
      (operation) =>
        operation.kind === "insert" && operation.table === toyTexture,
    );
    expect(textureInserts).toHaveLength(2);
    for (const operation of textureInserts) {
      const values = operation.values as {
        data: Buffer;
        contentHash: string;
        byteLength: number;
      };
      expect(Buffer.isBuffer(values.data)).toBe(true);
      expect(values.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(values.byteLength).toBe(values.data.byteLength);
      expect(values.contentHash).toBe(
        createHash("sha256").update(values.data).digest("hex"),
      );
    }

    const thumbnailInsert = fake.operations.find(
      (operation) =>
        operation.kind === "insert" && operation.table === toyThumbnail,
    );
    const thumbnailValues = thumbnailInsert?.values as {
      data: Buffer;
      contentHash: string;
      byteLength: number;
    };
    expect(Buffer.isBuffer(thumbnailValues.data)).toBe(true);
    expect(thumbnailValues.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(thumbnailValues.byteLength).toBe(thumbnailValues.data.byteLength);
  });

  it("rejects create at the owner quota without inserting", async () => {
    const fake = makeFakeDatabase({
      toyOwnerIds: Array.from({ length: 50 }, () => "owner-1"),
    });

    const result = await createToyService(fake.db).create(saveInput());

    expect(result).toMatchObject({ ok: false, error: { kind: "quota" } });
    expect(fake.transactionCount).toBe(1);
    expect(fake.operations).toEqual([]);
  });

  it("retries the whole transaction with a fresh slug on slug conflict", async () => {
    const fake = makeFakeDatabase({
      toyInsertErrors: [{ code: "23505", constraint: "toy_slug_unique" }],
    });

    const result = await createToyService(fake.db).create(saveInput());

    expect(result.ok).toBe(true);
    expect(fake.transactionCount).toBe(2);
    expect(fake.attemptedSlugs).toHaveLength(2);
    expect(fake.attemptedSlugs[0]).not.toBe(fake.attemptedSlugs[1]);
  });

  it("maps non-slug database failures to storage errors", async () => {
    const fake = makeFakeDatabase({
      toyInsertErrors: [new Error("database unavailable")],
    });

    const result = await createToyService(fake.db).create(saveInput());

    expect(result).toMatchObject({ ok: false, error: { kind: "storage" } });
    expect(fake.transactionCount).toBe(1);
  });

  it("returns not_found when an update target is missing", async () => {
    const fake = makeFakeDatabase({ selectResults: [[]] });

    const result = await createToyService(fake.db).update(
      "missing",
      saveInput(),
    );

    expect(result).toMatchObject({ ok: false, error: { kind: "not_found" } });
    expect(fake.operations).toEqual([]);
    expect(fake.locks).toEqual(["update"]);
  });

  it("returns forbidden before mutating another owner's toy", async () => {
    const fake = makeFakeDatabase({
      selectResults: [[{ id: "toy-id", userId: "someone-else", forkOf: null }]],
    });

    const result = await createToyService(fake.db).update(
      "private-toy",
      saveInput(),
    );

    expect(result).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(fake.operations).toEqual([]);
    expect(fake.locks).toEqual(["update"]);
  });

  it("fully replaces owned toy assets, preserves ancestry, and locks first", async () => {
    const forkOf = "00000000-0000-0000-0000-000000000009";
    const fake = makeFakeDatabase({
      selectResults: [[{ id: "toy-id", userId: "owner-1", forkOf }]],
    });
    const input = saveInput({
      thumbnail: undefined,
      forkOfId: "00000000-0000-0000-0000-000000000099",
    });

    const result = await createToyService(fake.db).update("owned", input);

    expect(result).toEqual({ ok: true, value: { slug: "owned" } });
    expect(fake.locks).toEqual(["update"]);
    const toyUpdate = fake.operations.find(
      (operation) => operation.kind === "update" && operation.table === toy,
    );
    expect(toyUpdate?.values).not.toHaveProperty("forkOf");

    const textureDeleteIndex = fake.operations.findIndex(
      (operation) =>
        operation.kind === "delete" && operation.table === toyTexture,
    );
    const textureInsertIndex = fake.operations.findIndex(
      (operation) =>
        operation.kind === "insert" && operation.table === toyTexture,
    );
    expect(textureDeleteIndex).toBeGreaterThan(-1);
    expect(textureInsertIndex).toBeGreaterThan(textureDeleteIndex);
    expect(
      fake.operations.filter(
        (operation) =>
          operation.kind === "insert" && operation.table === toyTexture,
      ),
    ).toHaveLength(input.textures.length);
    expect(fake.operations).toContainEqual({
      kind: "delete",
      table: toyThumbnail,
    });
  });

  it("returns not_found when a delete target is missing", async () => {
    const fake = makeFakeDatabase({ selectResults: [[]] });

    const result = await createToyService(fake.db).deleteOwned(
      "missing",
      "owner-1",
    );

    expect(result).toMatchObject({ ok: false, error: { kind: "not_found" } });
    expect(fake.operations).toEqual([]);
    expect(fake.locks).toEqual(["update"]);
  });

  it("returns forbidden without deleting another owner's toy", async () => {
    const fake = makeFakeDatabase({
      selectResults: [[{ id: "toy-id", userId: "someone-else" }]],
    });

    const result = await createToyService(fake.db).deleteOwned(
      "private-toy",
      "owner-1",
    );

    expect(result).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(fake.operations).toEqual([]);
    expect(fake.locks).toEqual(["update"]);
  });

  it("locks and deletes an owned toy in one transaction", async () => {
    const fake = makeFakeDatabase({
      selectResults: [[{ id: "toy-id", userId: "owner-1" }]],
    });

    const result = await createToyService(fake.db).deleteOwned(
      "owned",
      "owner-1",
    );

    expect(result).toEqual({ ok: true, value: { slug: "owned" } });
    expect(fake.transactionCount).toBe(1);
    expect(fake.locks).toEqual(["update"]);
    expect(fake.selects).toHaveLength(1);
    expect(fake.selects[0]?.from).toBe(toy);
    expect(Object.keys(fake.selects[0]?.fields ?? {})).toEqual([
      "id",
      "userId",
    ]);
    expect(containsSqlChunk(fake.selects[0]?.where, toy.slug)).toBe(true);
    expect(sqlParameterValues(fake.selects[0]?.where)).toEqual(["owned"]);
    expect(fake.operations).toEqual([{ kind: "delete", table: toy }]);
  });

  it.each([
    ["private toy for another viewer", null, null],
    [
      "private toy for its owner",
      "owner-1",
      {
        id: "toy-id",
        slug: "private-toy",
        userId: "owner-1",
        visibility: "private",
        source: "",
      },
    ],
    [
      "public toy for an anonymous viewer",
      null,
      {
        id: "toy-id",
        slug: "public-toy",
        userId: "owner-1",
        visibility: "public",
        source: "",
      },
    ],
  ])("gets accessible toy: %s", async (_label, viewerId, selectedToy) => {
    const fake = makeFakeDatabase({
      selectResults: selectedToy === null ? [[]] : [[selectedToy], []],
    });

    const result = await createToyService(fake.db).getAccessibleToy(
      selectedToy?.slug ?? "private-toy",
      viewerId,
    );

    if (selectedToy === null) {
      expect(result).toBeNull();
    } else {
      expect(result).toMatchObject(selectedToy);
      expect(result?.textures).toEqual([]);
    }
  });

  it("hides an inaccessible fork parent", async () => {
    const fake = makeFakeDatabase({ selectResults: [[]] });

    await expect(
      createToyService(fake.db).resolveForkParent("private-parent", "other"),
    ).resolves.toBeNull();
  });

  it("resolves an accessible fork parent", async () => {
    const fake = makeFakeDatabase({ selectResults: [[{ id: "parent-id" }]] });

    await expect(
      createToyService(fake.db).resolveForkParent("public-parent", null),
    ).resolves.toEqual({ id: "parent-id" });
  });
});
