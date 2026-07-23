import type { ToyRepository } from "../toys/repository";
import type { Toy } from "../toys/types";

export type Route =
  | { kind: "browse" }
  | { kind: "mine" }
  | { kind: "user"; id: string }
  | { kind: "new" }
  | { kind: "toy"; slug: string };
export type EditorRoute = { kind: "browse" } | { kind: "new" } | { kind: "toy"; toy: Toy };
type EditorRouteRequest = Exclude<Route, { kind: "mine" } | { kind: "user" }>;

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_USER_ID = /^[A-Za-z0-9]+$/;

export function routeFromHash(hash: string): Route {
  if (hash === "#mine") return { kind: "mine" };
  if (hash === "#new") return { kind: "new" };

  const userMatch = hash.match(/^#u=(.+)$/);
  if (userMatch && SAFE_USER_ID.test(userMatch[1])) {
    return { kind: "user", id: userMatch[1] };
  }

  const match = hash.match(/^#t=(.+)$/);
  if (match && SAFE_SLUG.test(match[1])) return { kind: "toy", slug: match[1] };

  return { kind: "browse" };
}

export async function resolveEditorRoute(
  route: EditorRouteRequest,
  repository: ToyRepository,
): Promise<EditorRoute> {
  if (route.kind !== "toy") return route;

  const toy = await repository.get(route.slug);
  return toy ? { kind: "toy", toy } : { kind: "browse" };
}
