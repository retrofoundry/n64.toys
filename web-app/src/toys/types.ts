export type ToyVisibility = "private" | "unlisted" | "public";

export type ToyOwner = {
  id: string;
  displayName: string;
};

export type ToyTexture = {
  name: string;
  url: string;
};

export type ToySummary = {
  slug: string;
  title: string;
  description: string;
  visibility: ToyVisibility;
  microcode: string;
  owner: ToyOwner;
  thumbnailUrl: string | null;
  forkOf: string | null;
  isOwner: boolean;
  createdAt: string;
};

export type Toy = ToySummary & {
  source: string;
  schemaVersion: 1;
  microcode: string;
  textures: (ToyTexture & {
    width?: number;
    height?: number;
    format?: string;
  })[];
};

export type ToyList = {
  toys: ToySummary[];
  page: number;
  pageCount: number;
};

export type UserToys = {
  owner: ToyOwner;
  toys: ToySummary[];
  page: number;
  pageCount: number;
};

export type Draft = {
  source: string;
  title: string;
  description: string;
  forkOf?: string;
};
