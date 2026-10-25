CREATE TABLE "favorite" (
	"userId" text NOT NULL,
	"productId" integer NOT NULL,
	"baselineCents" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_userId_productId_pk" PRIMARY KEY("userId","productId"),
	CONSTRAINT "favorite_baseline_positive" CHECK ("favorite"."baselineCents" is null or "favorite"."baselineCents" > 0)
);
--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favorite_product_idx" ON "favorite" USING btree ("productId");