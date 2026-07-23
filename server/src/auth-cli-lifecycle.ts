type CliConfig = { databaseUrl: string };
type CliPool = { end(): Promise<void> };

type CliAuthDependencies<Config extends CliConfig, Database, Auth> = {
  createDatabase(databaseUrl: string): { db: Database; pool: CliPool };
  createAuth(config: Config, database: Database): Auth;
};

export async function composeCliAuth<
  Config extends CliConfig,
  Database,
  Auth,
>(
  config: Config,
  dependencies: CliAuthDependencies<Config, Database, Auth>,
): Promise<Auth> {
  const { db, pool } = dependencies.createDatabase(config.databaseUrl);

  try {
    return dependencies.createAuth(config, db);
  } finally {
    await pool.end();
  }
}
