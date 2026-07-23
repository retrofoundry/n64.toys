import { describe, expect, it } from "vitest";

import { createApp, type AppDependencies } from "./app.js";
import type { ToyService } from "./toys/service.js";

const fakeToys: ToyService = {
  listPublic: async () => ({ toys: [], pageCount: 0 }),
  listPublicByOwner: async () => ({ toys: [], pageCount: 0 }),
  listByOwner: async () => ({ toys: [], pageCount: 0 }),
  getOwnerName: async () => "Someone",
  getAccessibleToy: async () => null,
  getAccessibleTexture: async () => null,
  getAccessibleThumbnail: async () => null,
  resolveForkParent: async () => null,
  create: async () => ({ ok: true, value: { slug: "new-toy" } }),
  update: async (slug) => ({ ok: true, value: { slug } }),
  deleteOwned: async (slug) => ({ ok: true, value: { slug } }),
};

function createDependencies(
  overrides: Partial<AppDependencies> = {},
): AppDependencies {
  return {
    authHandler: async () => new Response(null),
    getSession: async () => null,
    toys: fakeToys,
    trustedOrigins: ["http://localhost:5173"],
    maxBodyBytes: 7 * 1024 * 1024,
    pingDatabase: async () => undefined,
    logError: () => undefined,
    ...overrides,
  };
}

describe("createApp", () => {
  it("returns healthy only after PostgreSQL responds", async () => {
    let pinged = false;
    const app = createApp(
      createDependencies({
        pingDatabase: async () => {
          pinged = true;
        },
      }),
    );

    const response = await app.request("/api/health");

    expect(pinged).toBe(true);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns a stable 503 response when PostgreSQL is unavailable", async () => {
    const databaseError = new Error("password=database-secret");
    const logged: unknown[] = [];
    const app = createApp(
      createDependencies({
        pingDatabase: async () => {
          throw databaseError;
        },
        logError: (error) => logged.push(error),
      }),
    );

    const response = await app.request("/api/health");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "service_unavailable",
        message: "Service unavailable",
      },
    });
    expect(logged).toEqual([databaseError]);
  });

  it.each(["GET", "POST"])(
    "forwards the original %s request to Better Auth",
    async (method) => {
      let forwardedRequest: Request | undefined;
      const app = createApp(
        createDependencies({
          authHandler: async (request) => {
            forwardedRequest = request;
            return new Response(null, { status: 204 });
          },
        }),
      );
      const request = new Request(
        "http://localhost/api/auth/get-session?fresh=true",
        { method },
      );

      const response = await app.fetch(request);

      expect(forwardedRequest).toBe(request);
      expect(response.status).toBe(204);
    },
  );

  it("preserves a signed-out session response", async () => {
    const headers = new Headers({
      "Content-Type": "application/json",
      "X-Auth-Result": "signed-out",
    });
    headers.append("Set-Cookie", "session=; Max-Age=0; Path=/; HttpOnly");
    headers.append("Set-Cookie", "state=; Max-Age=0; Path=/; HttpOnly");
    const app = createApp(
      createDependencies({
        authHandler: async () =>
          new Response("null", {
            status: 200,
            headers,
          }),
      }),
    );

    const response = await app.request("/api/auth/get-session");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.getSetCookie()).toEqual([
      "session=; Max-Age=0; Path=/; HttpOnly",
      "state=; Max-Age=0; Path=/; HttpOnly",
    ]);
    expect(response.headers.get("X-Auth-Result")).toBe("signed-out");
    expect(await response.text()).toBe("null");
  });

  it.each([
    ["successful", 200, undefined],
    ["error", 401, undefined],
    ["redirect", 302, "https://github.com/login/oauth/authorize"],
  ])(
    "marks a returned %s auth response private and non-cacheable",
    async (_kind, status, location) => {
      const app = createApp(
        createDependencies({
          authHandler: async () =>
            new Response("auth response", {
              status,
              headers: location === undefined ? {} : { Location: location },
            }),
        }),
      );

      const response = await app.request("/api/auth/example");

      expect(response.status).toBe(status);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Location")).toBe(location ?? null);
      expect(await response.text()).toBe("auth response");
    },
  );

  it("logs unexpected route errors and returns a stable internal error", async () => {
    const routeError = new Error("provider-secret");
    const logged: unknown[] = [];
    const app = createApp(
      createDependencies({
        authHandler: async () => {
          throw routeError;
        },
        logError: (error) => logged.push(error),
      }),
    );

    const response = await app.request("/api/auth/get-session");

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "Internal server error",
      },
    });
    expect(logged).toEqual([routeError]);
  });

  it("marks a thrown error on the bare auth path private and non-cacheable", async () => {
    const app = createApp(
      createDependencies({
        authHandler: async () => {
          throw new Error("auth failure");
        },
      }),
    );

    const response = await app.request("/api/auth");

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns a stable JSON 404 for unknown API routes", async () => {
    const app = createApp(createDependencies());

    const response = await app.request("/api/does-not-exist");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "not_found", message: "Not found" },
    });
  });
});
