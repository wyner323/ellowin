CREATE TABLE "auth_attempt" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_attempt_key_created_idx" ON "auth_attempt" USING btree ("key","createdAt");