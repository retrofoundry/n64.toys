import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

import { account } from "./schema.js";
import {
  expectedTableNames,
  findMissingTables,
  loadBaseTableNames,
} from "./verify.js";

describe("findMissingTables", () => {
  it("returns expected tables that are absent from the database", () => {
    expect(
      findMissingTables(
        ["user", "session", "account", "verification", "rateLimit"],
        ["verification", "account", "user"],
      ),
    ).toEqual(["session", "rateLimit"]);
  });

  it("derives all required Better Auth table names from the Drizzle schema", () => {
    expect(expectedTableNames()).toEqual(
      expect.arrayContaining([
        "user",
        "session",
        "account",
        "verification",
        "rate_limit",
      ]),
    );
  });
});

describe("loadBaseTableNames", () => {
  it("loads names using an information_schema BASE TABLE query", async () => {
    const queries: string[] = [];
    const pool = {
      async query(query: string) {
        queries.push(query);
        return {
          rows: [{ table_name: "session" }, { table_name: "user" }],
        };
      },
    };

    await expect(loadBaseTableNames(pool)).resolves.toEqual([
      "session",
      "user",
    ]);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/table_type\s*=\s*'BASE TABLE'/);
  });
});

describe("Better Auth schema invariants", () => {
  it("uniquely identifies accounts by provider and provider account ID", () => {
    const accountConfig = getTableConfig(account);
    const identityIndex = accountConfig.indexes.find(
      (index) => index.config.name === "account_provider_account_id_uidx",
    );

    expect(identityIndex?.config.unique).toBe(true);
    expect(
      identityIndex?.config.columns.map((column) =>
        "name" in column ? column.name : undefined,
      ),
    ).toEqual(["provider_id", "account_id"]);
  });
});
