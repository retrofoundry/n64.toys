import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

import { toy, toyTexture, toyThumbnail } from "./schema.js";

describe("toy persistence schema", () => {
  it("defines the toy identity, ownership, visibility, and fork columns", () => {
    const config = getTableConfig(toy);
    const columns = Object.fromEntries(
      config.columns.map((column) => [column.name, column]),
    );

    expect(columns.id?.primary).toBe(true);
    expect(columns.slug?.isUnique).toBe(true);
    expect(columns.user_id?.notNull).toBe(true);
    expect(columns.fork_of?.notNull).toBe(false);
    expect(columns.visibility?.notNull).toBe(true);
  });

  it("stores uniquely named bytea textures per toy", () => {
    const config = getTableConfig(toyTexture);
    const data = config.columns.find((column) => column.name === "data");
    const identityIndex = config.indexes.find(
      (index) => index.config.name === "toy_texture_toy_name_uidx",
    );

    expect(identityIndex?.config.unique).toBe(true);
    expect(
      identityIndex?.config.columns.map((column) =>
        "name" in column ? column.name : undefined,
      ),
    ).toEqual(["toy_id", "name"]);
    expect(data?.getSQLType()).toBe("bytea");
  });

  it("stores one bytea thumbnail per toy", () => {
    const config = getTableConfig(toyThumbnail);
    const toyId = config.columns.find(
      (column) => column.name === "toy_id",
    );
    const data = config.columns.find((column) => column.name === "data");

    expect(toyId?.primary).toBe(true);
    expect(data?.getSQLType()).toBe("bytea");
  });
});
