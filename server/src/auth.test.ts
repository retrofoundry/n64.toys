import { afterEach, describe, expect, it } from "vitest";

import type { AppConfig } from "./config.js";
import { createAuth } from "./auth.js";
import { createDatabase } from "./db/client.js";

const config: AppConfig = {
  nodeEnv: "test",
  port: 3001,
  databaseUrl: "postgresql://n64_toys:n64_toys@127.0.0.1:1/n64_toys",
  betterAuthUrl: "http://localhost:5173",
  betterAuthSecret: "0123456789abcdef0123456789abcdef",
  githubClientId: "fake-client-id",
  githubClientSecret: "fake-client-secret",
  trustedOrigins: ["http://localhost:5173"],
  trustProxy: false,
};

const pools: ReturnType<typeof createDatabase>["pool"][] = [];

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

describe("GitHub OAuth scope boundary", () => {
  it.each(["/sign-in/social", "/link-social"])(
    "rejects client scopes on %s before OAuth state or session database work",
    async (path) => {
      const { db, pool } = createDatabase(config.databaseUrl);
      pools.push(pool);
      const queries: string[] = [];
      pool.query = (async (query: string | { text: string }) => {
        queries.push(typeof query === "string" ? query : query.text);
        return {
          command: "SELECT",
          rowCount: 1,
          oid: 0,
          fields: [],
          rows: [
            {
              id: "rate-limit-id",
              key: `127.0.0.1|${path}`,
              count: 0,
              last_request: Date.now(),
            },
          ],
        };
      }) as typeof pool.query;
      const auth = createAuth(config, db);

      const response = await auth.handler(
        new Request(`${config.betterAuthUrl}/api/auth${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: config.betterAuthUrl,
          },
          body: JSON.stringify({ provider: "github", scopes: ["repo"] }),
        }),
      );

      expect(response.status).toBe(400);
      expect(pool.totalCount).toBe(0);
      expect(queries.length).toBeGreaterThan(0);
      expect(queries.every((query) => query.includes('"rate_limit"'))).toBe(
        true,
      );
    },
  );
});

describe("OAuth initiation origin boundary", () => {
  it.each(["/sign-in/social", "/link-social"])(
    "rejects a hostile cookieless origin on %s before OAuth or session database work",
    async (path) => {
      const { db, pool } = createDatabase(config.databaseUrl);
      pools.push(pool);
      const queries: string[] = [];
      pool.query = (async (query: string | { text: string }) => {
        queries.push(typeof query === "string" ? query : query.text);
        return {
          command: "SELECT",
          rowCount: 1,
          oid: 0,
          fields: [],
          rows: [
            {
              id: "rate-limit-id",
              key: `127.0.0.1|${path}`,
              count: 0,
              last_request: Date.now(),
            },
          ],
        };
      }) as typeof pool.query;
      const auth = createAuth(config, db);

      const response = await auth.handler(
        new Request(`${config.betterAuthUrl}/api/auth${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://attacker.invalid",
          },
          body: JSON.stringify({ provider: "github" }),
        }),
      );

      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain(config.trustedOrigins[0]);
      expect(pool.totalCount).toBe(0);
      expect(queries.every((query) => query.includes('"rate_limit"'))).toBe(
        true,
      );
    },
  );

  it("allows a trusted cookieless origin to initiate GitHub sign-in", async () => {
    const { db, pool } = createDatabase(config.databaseUrl);
    pools.push(pool);
    pool.query = (async () => ({
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
      rows: [],
    })) as typeof pool.query;
    const auth = createAuth(config, db);

    const response = await auth.handler(
      new Request(`${config.betterAuthUrl}/api/auth/sign-in/social`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: config.trustedOrigins[0],
        },
        body: JSON.stringify({ provider: "github" }),
      }),
    );

    expect(response.status).not.toBe(403);
  });
});
