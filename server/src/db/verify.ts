import { pathToFileURL } from "node:url";

import { getTableName, isTable } from "drizzle-orm";

import { parseConfig } from "../config.js";
import { createDatabase } from "./client.js";
import * as schema from "./schema.js";

export function findMissingTables(
  expectedTables: readonly string[],
  actualTables: readonly string[],
): string[] {
  const actual = new Set(actualTables);
  return expectedTables.filter((table) => !actual.has(table));
}

export function expectedTableNames(): string[] {
  return (Object.values(schema) as unknown[])
    .filter(isTable)
    .map(getTableName)
    .sort();
}

type TableNamePool = {
  query(query: string): Promise<{ rows: { table_name: string }[] }>;
};

export async function loadBaseTableNames(
  pool: TableNamePool,
): Promise<string[]> {
  const result = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  return result.rows.map((row) => row.table_name);
}

async function verifyDatabaseSchema(databaseUrl: string): Promise<void> {
  const { pool } = createDatabase(databaseUrl);

  try {
    const actualTables = await loadBaseTableNames(pool);
    const missingTables = findMissingTables(
      expectedTableNames(),
      actualTables,
    );

    console.log(`Database tables: ${actualTables.join(", ")}`);
    if (missingTables.length > 0) {
      throw new Error(`Missing database tables: ${missingTables.join(", ")}`);
    }
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const config = parseConfig(process.env);
  await verifyDatabaseSchema(config.databaseUrl);
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Database verification failed",
    );
    process.exitCode = 1;
  });
}
