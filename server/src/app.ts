import { Hono } from "hono";

import { createToysRouter } from "./toys/routes.js";
import type { ToyService } from "./toys/service.js";
import { createUsersRouter } from "./toys/users-routes.js";

export type AuthedUser = { id: string };

export type AppDependencies = {
  authHandler: (request: Request) => Promise<Response>;
  getSession: (headers: Headers) => Promise<AuthedUser | null>;
  toys: ToyService;
  trustedOrigins: string[];
  maxBodyBytes: number;
  pingDatabase: () => Promise<void>;
  logError: (error: unknown) => void;
};

const internalError = {
  error: {
    code: "internal_error",
    message: "Internal server error",
  },
};

export function createApp(dependencies: AppDependencies): Hono {
  const app = new Hono();

  app.get("/api/health", async (context) => {
    try {
      await dependencies.pingDatabase();
      return context.json({ status: "ok" });
    } catch (error) {
      dependencies.logError(error);
      return context.json(
        {
          error: {
            code: "service_unavailable",
            message: "Service unavailable",
          },
        },
        503,
      );
    }
  });

  app.on(["POST", "GET"], "/api/auth/*", async (context) => {
    const response = await dependencies.authHandler(context.req.raw);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "private, no-store");
    return new Response(response.body, { status: response.status, headers });
  });

  app.route("/api/toys", createToysRouter(dependencies));
  app.route("/api/users", createUsersRouter(dependencies));

  app.onError((error, context) => {
    dependencies.logError(error);
    const response = context.json(internalError, 500);
    if (isPrivateApiPath(context.req.path)) {
      response.headers.set("Cache-Control", "private, no-store");
    }
    return response;
  });

  app.notFound((context) => {
    const response = context.json(
      { error: { code: "not_found", message: "Not found" } },
      404,
    );
    if (isPrivateApiPath(context.req.path)) {
      response.headers.set("Cache-Control", "private, no-store");
    }
    return response;
  });

  return app;
}

function isPrivateApiPath(path: string): boolean {
  return (
    path === "/api/auth" ||
    path.startsWith("/api/auth/") ||
    path === "/api/toys" ||
    path.startsWith("/api/toys/")
  );
}
