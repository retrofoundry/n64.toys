CREATE TABLE "toy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"microcode" text DEFAULT 'F3DEX2' NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"fork_of" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "toy_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "toy_texture" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"toy_id" uuid NOT NULL,
	"name" text NOT NULL,
	"data" "bytea" NOT NULL,
	"mime_type" text DEFAULT 'image/png' NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_length" integer NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "toy_thumbnail" (
	"toy_id" uuid PRIMARY KEY NOT NULL,
	"data" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_length" integer NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "toy" ADD CONSTRAINT "toy_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toy" ADD CONSTRAINT "toy_fork_of_toy_id_fk" FOREIGN KEY ("fork_of") REFERENCES "public"."toy"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toy_texture" ADD CONSTRAINT "toy_texture_toy_id_toy_id_fk" FOREIGN KEY ("toy_id") REFERENCES "public"."toy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toy_thumbnail" ADD CONSTRAINT "toy_thumbnail_toy_id_toy_id_fk" FOREIGN KEY ("toy_id") REFERENCES "public"."toy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "toy_user_id_idx" ON "toy" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "toy_visibility_created_idx" ON "toy" USING btree ("visibility","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "toy_texture_toy_name_uidx" ON "toy_texture" USING btree ("toy_id","name");