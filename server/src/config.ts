/// <reference types="node" />

import { z } from "zod";

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  betterAuthUrl: string;
  betterAuthSecret: string;
  githubClientId: string;
  githubClientSecret: string;
  trustedOrigins: string[];
  trustProxy: boolean;
};

const origin = z
  .string()
  .trim()
  .transform((value) => value.replace(/\/$/, ""))
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        !url.hostname.includes("*") &&
        url.origin === value
      );
    } catch {
      return false;
    }
  });

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_URL: origin,
  BETTER_AUTH_SECRET: z.string().min(32),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  TRUSTED_ORIGINS: z
    .string()
    .transform((value) => value.split(","))
    .pipe(z.array(origin).min(1)),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .transform((value) => value === "true"),
});

export function parseConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const variables = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ];
    throw new Error(`Invalid configuration: ${variables.join(", ")}`);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    databaseUrl: result.data.DATABASE_URL,
    betterAuthUrl: result.data.BETTER_AUTH_URL,
    betterAuthSecret: result.data.BETTER_AUTH_SECRET,
    githubClientId: result.data.GITHUB_CLIENT_ID,
    githubClientSecret: result.data.GITHUB_CLIENT_SECRET,
    trustedOrigins: result.data.TRUSTED_ORIGINS,
    trustProxy: result.data.TRUST_PROXY,
  };
}
