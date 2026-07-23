import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

import type { AppConfig } from "./config.js";
import type { Database } from "./db/client.js";
import * as schema from "./db/schema.js";

export function createAuth(config: AppConfig, db: Database) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    baseURL: config.betterAuthUrl,
    secret: config.betterAuthSecret,
    trustedOrigins: config.trustedOrigins,
    hooks: {
      before: createAuthMiddleware(async (context) => {
        const isOAuthInitiation =
          context.path === "/sign-in/social" ||
          context.path === "/link-social";
        const requestOrigin = context.request?.headers.get("origin");
        if (
          isOAuthInitiation &&
          requestOrigin !== undefined &&
          requestOrigin !== null &&
          !config.trustedOrigins.includes(requestOrigin)
        ) {
          throw new APIError("FORBIDDEN", { message: "Forbidden" });
        }
        const hasClientScopes =
          context.body !== null &&
          typeof context.body === "object" &&
          "scopes" in context.body;

        if (isOAuthInitiation && hasClientScopes) {
          throw new APIError("BAD_REQUEST", {
            message: "Custom OAuth scopes are not allowed",
          });
        }
      }),
    },
    socialProviders: {
      github: {
        clientId: config.githubClientId,
        clientSecret: config.githubClientSecret,
      },
    },
    account: {
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
    },
    rateLimit: {
      enabled: true,
      storage: "database",
    },
    advanced: {
      useSecureCookies: config.nodeEnv === "production",
      trustedProxyHeaders: config.trustProxy,
    },
  });
}
