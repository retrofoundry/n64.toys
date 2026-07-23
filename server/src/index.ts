/// <reference types="node" />

import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { parseConfig } from "./config.js";
import { createDatabase } from "./db/client.js";
import { registerShutdown } from "./shutdown.js";
import { createToyService } from "./toys/service.js";

const config = parseConfig(process.env);
const { db, pool } = createDatabase(config.databaseUrl);
const auth = createAuth(config, db);

const app = createApp({
  authHandler: auth.handler,
  getSession: async (headers) => {
    const result = await auth.api.getSession({ headers });
    return result ? { id: result.user.id } : null;
  },
  toys: createToyService(db),
  trustedOrigins: config.trustedOrigins,
  maxBodyBytes: 7 * 1024 * 1024,
  pingDatabase: async () => {
    await pool.query("select 1");
  },
  logError: (error) => console.error(error),
});

const server = serve({ fetch: app.fetch, port: config.port });

registerShutdown({
  closeServer: (onClose) => server.close(onClose),
  closePool: () => pool.end(),
  onSignal: (signal, listener) => process.on(signal, listener),
  removeSignalListener: (signal, listener) =>
    process.removeListener(signal, listener),
  exit: (code) => process.exit(code),
  logError: (error) => console.error(error),
});
