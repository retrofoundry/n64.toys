import { ApiToyRepository } from "./api-repository";
import type { Toy, ToyList, UserToys } from "./types";

export interface ToyRepository {
  list(page?: number): Promise<ToyList>;
  listMine(page?: number): Promise<ToyList>;
  listUserPublic(userId: string, page?: number): Promise<UserToys>;
  get(slug: string): Promise<Toy | null>;
}

export class EmptyToyRepository implements ToyRepository {
  async list(page = 1): Promise<ToyList> {
    return { toys: [], page, pageCount: 0 };
  }
  async listMine(page = 1): Promise<ToyList> {
    return { toys: [], page, pageCount: 0 };
  }
  async listUserPublic(userId: string, page = 1): Promise<UserToys> {
    return {
      owner: { id: userId, displayName: "" },
      toys: [],
      page,
      pageCount: 0,
    };
  }
  async get(_slug: string): Promise<Toy | null> {
    return null;
  }
}

export const repository: ToyRepository = new ApiToyRepository();
