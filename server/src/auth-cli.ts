import { createAuth } from "./auth.js";
import { composeCliAuth } from "./auth-cli-lifecycle.js";
import { parseConfig } from "./config.js";
import { createDatabase } from "./db/client.js";

const config = parseConfig(process.env);

export const auth = await composeCliAuth(config, {
  createDatabase,
  createAuth,
});
