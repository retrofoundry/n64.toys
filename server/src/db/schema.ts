import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  bigint,
  timestamp,
  boolean,
  uuid,
  integer,
  index,
  uniqueIndex,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const toyVisibility = ["private", "unlisted", "public"] as const;
export type ToyVisibility = (typeof toyVisibility)[number];

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("account_userId_idx").on(table.userId),
    uniqueIndex("account_provider_account_id_uidx").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const toy = pgTable(
  "toy",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    source: text("source").notNull().default(""),
    visibility: text("visibility", { enum: toyVisibility })
      .notNull()
      .default("private"),
    microcode: text("microcode").notNull().default("F3DEX2"),
    schemaVersion: integer("schema_version").notNull().default(1),
    forkOf: uuid("fork_of").references((): AnyPgColumn => toy.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("toy_user_id_idx").on(table.userId),
    index("toy_visibility_created_idx").on(
      table.visibility,
      table.createdAt,
    ),
  ],
);

export const toyTexture = pgTable(
  "toy_texture",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toyId: uuid("toy_id")
      .notNull()
      .references(() => toy.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    data: bytea("data").notNull(),
    mimeType: text("mime_type").notNull().default("image/png"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    byteLength: integer("byte_length").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("toy_texture_toy_name_uidx").on(
      table.toyId,
      table.name,
    ),
  ],
);

export const toyThumbnail = pgTable("toy_thumbnail", {
  toyId: uuid("toy_id")
    .primaryKey()
    .references(() => toy.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  byteLength: integer("byte_length").notNull(),
  contentHash: text("content_hash").notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const toyRelations = relations(toy, ({ one, many }) => ({
  owner: one(user, {
    fields: [toy.userId],
    references: [user.id],
  }),
  textures: many(toyTexture),
  thumbnail: one(toyThumbnail),
  forkedFrom: one(toy, {
    fields: [toy.forkOf],
    references: [toy.id],
    relationName: "fork",
  }),
}));

export const toyTextureRelations = relations(toyTexture, ({ one }) => ({
  toy: one(toy, {
    fields: [toyTexture.toyId],
    references: [toy.id],
  }),
}));

export const toyThumbnailRelations = relations(
  toyThumbnail,
  ({ one }) => ({
    toy: one(toy, {
      fields: [toyThumbnail.toyId],
      references: [toy.id],
    }),
  }),
);
