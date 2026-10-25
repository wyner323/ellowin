CREATE TABLE "review_reply" (
	"reviewId" integer PRIMARY KEY NOT NULL,
	"sellerId" text NOT NULL,
	"body" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "review_reply_body_length" CHECK (char_length("review_reply"."body") between 3 and 500)
);
--> statement-breakpoint
ALTER TABLE "review_reply" ADD CONSTRAINT "review_reply_reviewId_review_id_fk" FOREIGN KEY ("reviewId") REFERENCES "public"."review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reply" ADD CONSTRAINT "review_reply_sellerId_user_id_fk" FOREIGN KEY ("sellerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_reply_seller_idx" ON "review_reply" USING btree ("sellerId");