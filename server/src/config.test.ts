import { describe, expect, test } from "vitest";

import { parseConfig } from "./config.js";

function completeEnvironment(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    PORT: "3001",
    DATABASE_URL:
      "postgresql://n64_toys:database-password@localhost:5432/n64_toys",
    BETTER_AUTH_URL: "http://localhost:5173",
    BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    GITHUB_CLIENT_ID: "github-client-id",
    GITHUB_CLIENT_SECRET: "github-client-secret-value",
    TRUSTED_ORIGINS: "http://localhost:5173, https://example.com/",
    TRUST_PROXY: "false",
    ...overrides,
  };
}

describe("parseConfig", () => {
  test("parses a complete development environment into typed values", () => {
    expect(parseConfig(completeEnvironment())).toEqual({
      nodeEnv: "development",
      port: 3001,
      databaseUrl:
        "postgresql://n64_toys:database-password@localhost:5432/n64_toys",
      betterAuthUrl: "http://localhost:5173",
      betterAuthSecret: "0123456789abcdef0123456789abcdef",
      githubClientId: "github-client-id",
      githubClientSecret: "github-client-secret-value",
      trustedOrigins: ["http://localhost:5173", "https://example.com"],
      trustProxy: false,
    });
  });

  test.each(["0", "65536", "1.5", "not-a-number"])(
    "rejects PORT=%s because ports must be integers from 1 through 65535",
    (port) => {
      expect(() => parseConfig(completeEnvironment({ PORT: port }))).toThrow(
        /PORT/,
      );
    },
  );

  test.each([
    ["BETTER_AUTH_URL", { BETTER_AUTH_URL: "ftp://example.com" }],
    ["BETTER_AUTH_URL", { BETTER_AUTH_URL: "https://example.com/auth" }],
    ["BETTER_AUTH_URL", { BETTER_AUTH_URL: "https://*.vercel.app" }],
    ["TRUSTED_ORIGINS", { TRUSTED_ORIGINS: "https://example.com/path" }],
    ["TRUSTED_ORIGINS", { TRUSTED_ORIGINS: "relative.example.com" }],
    ["TRUSTED_ORIGINS", { TRUSTED_ORIGINS: "https://*.vercel.app" }],
  ])("rejects a non-origin value for %s", (variable, overrides) => {
    expect(() => parseConfig(completeEnvironment(overrides))).toThrow(
      new RegExp(variable),
    );
  });

  test("rejects BETTER_AUTH_SECRET values shorter than 32 characters", () => {
    expect(() =>
      parseConfig(completeEnvironment({ BETTER_AUTH_SECRET: "too-short" })),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  test.each(["TRUE", "1", "yes", ""])(
    "rejects TRUST_PROXY=%j because only true or false are accepted",
    (trustProxy) => {
      expect(() =>
        parseConfig(completeEnvironment({ TRUST_PROXY: trustProxy })),
      ).toThrow(/TRUST_PROXY/);
    },
  );

  test("reports every missing or invalid variable in one concise error", () => {
    const environment = completeEnvironment({
      PORT: "invalid",
      BETTER_AUTH_URL: undefined,
      GITHUB_CLIENT_ID: "",
      TRUST_PROXY: "yes",
    });

    expect(() => parseConfig(environment)).toThrowError(
      "Invalid configuration: PORT, BETTER_AUTH_URL, GITHUB_CLIENT_ID, TRUST_PROXY",
    );
  });

  test("never includes supplied secret values in an error", () => {
    const environment = completeEnvironment({ PORT: "invalid" });

    let message = "";
    try {
      parseConfig(environment);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("PORT");
    expect(message).not.toContain("database-password");
    expect(message).not.toContain(environment.DATABASE_URL);
    expect(message).not.toContain(environment.BETTER_AUTH_SECRET);
    expect(message).not.toContain(environment.GITHUB_CLIENT_SECRET);
  });
});
