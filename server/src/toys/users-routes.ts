import { Hono } from "hono";

import type { AppDependencies } from "../app.js";
import type { UserToysDto } from "./dto.js";
import { ERROR_CODES } from "./limits.js";
import { toSummary } from "./routes.js";

const NO_STORE = "private, no-store";

export function createUsersRouter(dependencies: AppDependencies): Hono {
  const app = new Hono();

  app.use("*", async (context, next) => {
    await next();
    context.res.headers.set("Cache-Control", NO_STORE);
  });

  app.get("/:id/toys", async (context) => {
    const id = context.req.param("id");
    const rawPage = Number.parseInt(context.req.query("page") ?? "1", 10);
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
    const name = await dependencies.toys.getOwnerName(id);
    if (name === null) {
      return context.json(
        {
          error: {
            code: ERROR_CODES.not_found,
            message: "Not found",
          },
        },
        404,
      );
    }

    const result = await dependencies.toys.listPublicByOwner(id, page);
    const response: UserToysDto = {
      owner: { id, displayName: name },
      toys: result.toys.map((toy) => toSummary(toy, null)),
      page,
      pageCount: result.pageCount,
    };
    return context.json(response);
  });

  return app;
}
