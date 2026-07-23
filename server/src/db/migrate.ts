import { fileURLToPath, pathToFileURL } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { parseConfig } from "../config.js";
import { createDatabase } from "./client.js";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

async function main(): Promise<void> {
  const config = parseConfig(process.env);
  const { db, pool } = createDatabase(config.databaseUrl);

  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Database migration failed",
    );
    process.exitCode = 1;
  });
}
