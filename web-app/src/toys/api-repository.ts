import type { ToyRepository } from "./repository";
import type { Toy, ToyList, ToySummary, UserToys } from "./types";

function mapSummary(toy: ToySummary): ToySummary {
  return {
    slug: toy.slug,
    title: toy.title,
    description: toy.description,
    visibility: toy.visibility,
    microcode: toy.microcode,
    owner: {
      id: toy.owner.id,
      displayName: toy.owner.displayName,
    },
    thumbnailUrl: toy.thumbnailUrl,
    forkOf: toy.forkOf,
    isOwner: toy.isOwner,
    createdAt: toy.createdAt,
  };
}

function mapToy(toy: Toy): Toy {
  return {
    ...mapSummary(toy),
    source: toy.source,
    schemaVersion: toy.schemaVersion,
    microcode: toy.microcode,
    textures: toy.textures.map((texture) => ({
      name: texture.name,
      url: texture.url,
      width: texture.width,
      height: texture.height,
      format: texture.format,
    })),
  };
}

async function requireOk(response: Response): Promise<Response> {
  if (!response.ok) {
    throw new Error(`Toy request failed with status ${response.status}`);
  }
  return response;
}

export class ApiToyRepository implements ToyRepository {
  async list(page = 1): Promise<ToyList> {
    const response = await requireOk(
      await fetch(`/api/toys?page=${page}`, { credentials: "include" }),
    );
    const result = (await response.json()) as ToyList;
    return {
      toys: result.toys.map(mapSummary),
      page: result.page,
      pageCount: result.pageCount,
    };
  }

  async listMine(page = 1): Promise<ToyList> {
    const response = await requireOk(
      await fetch(`/api/toys/mine?page=${page}`, { credentials: "include" }),
    );
    const result = (await response.json()) as ToyList;
    return {
      toys: result.toys.map(mapSummary),
      page: result.page,
      pageCount: result.pageCount,
    };
  }

  async listUserPublic(userId: string, page = 1): Promise<UserToys> {
    const response = await requireOk(
      await fetch(
        `/api/users/${encodeURIComponent(userId)}/toys?page=${page}`,
        { credentials: "include" },
      ),
    );
    const result = (await response.json()) as UserToys;
    return {
      owner: result.owner,
      toys: result.toys.map(mapSummary),
      page: result.page,
      pageCount: result.pageCount,
    };
  }

  async get(slug: string): Promise<Toy | null> {
    const response = await fetch(`/api/toys/${encodeURIComponent(slug)}`, {
      credentials: "include",
    });
    if (response.status === 404) return null;
    await requireOk(response);
    return mapToy((await response.json()) as Toy);
  }
}
