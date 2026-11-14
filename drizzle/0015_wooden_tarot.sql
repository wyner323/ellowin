CREATE TABLE "order_buyer_info" (
	"orderId" integer PRIMARY KEY NOT NULL,
	"info" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_category_approval" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"categorySlug" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"statement" text DEFAULT '' NOT NULL,
	"decisionNote" text,
	"decidedBy" text,
	"decidedAt" timestamp,
	"stockReview" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seller_category_approval_status_valid" CHECK ("seller_category_approval"."status" in ('pendente', 'aprovado', 'recusado'))
);
--> statement-breakpoint
CREATE TABLE "stock_batch" (
	"id" serial PRIMARY KEY NOT NULL,
	"variantId" integer NOT NULL,
	"sellerId" text NOT NULL,
	"itemCount" integer NOT NULL,
	"status" text DEFAULT 'aprovado' NOT NULL,
	"statement" text,
	"reviewedBy" text,
	"reviewedAt" timestamp,
	"reviewNote" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stock_batch_status_valid" CHECK ("stock_batch"."status" in ('pendente', 'aprovado', 'recusado', 'quarentena')),
	CONSTRAINT "stock_batch_count_positive" CHECK ("stock_batch"."itemCount" > 0)
);
--> statement-breakpoint
ALTER TABLE "delivery_stock_item" ADD COLUMN "batchId" integer;--> statement-breakpoint
ALTER TABLE "order_buyer_info" ADD CONSTRAINT "order_buyer_info_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_category_approval" ADD CONSTRAINT "seller_category_approval_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_variantId_product_variant_id_fk" FOREIGN KEY ("variantId") REFERENCES "public"."product_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_sellerId_user_id_fk" FOREIGN KEY ("sellerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_reviewedBy_user_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seller_category_approval_user_category_idx" ON "seller_category_approval" USING btree ("userId","categorySlug");--> statement-breakpoint
CREATE INDEX "seller_category_approval_status_idx" ON "seller_category_approval" USING btree ("status","id");--> statement-breakpoint
CREATE INDEX "stock_batch_status_idx" ON "stock_batch" USING btree ("status","id");--> statement-breakpoint
CREATE INDEX "stock_batch_seller_idx" ON "stock_batch" USING btree ("sellerId");--> statement-breakpoint
ALTER TABLE "delivery_stock_item" ADD CONSTRAINT "delivery_stock_item_batchId_stock_batch_id_fk" FOREIGN KEY ("batchId") REFERENCES "public"."stock_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Quem já anunciava gift cards antes da análise de categoria existir continua vendendo (aprovação "migracao"). A análise do estoque
-- novo desses vendedores segue ligada (stockReview = true) e a moderação desliga caso a caso.
INSERT INTO "seller_category_approval" ("userId", "categorySlug", "status", "statement", "decidedBy", "decidedAt", "stockReview")
SELECT DISTINCT "sellerId", 'gift-cards', 'aprovado', 'Anúncios anteriores à análise de categoria.', 'migracao', now(), true
FROM "product" WHERE "categorySlug" = 'gift-cards'
ON CONFLICT ("userId", "categorySlug") DO NOTHING;
