CREATE TABLE "delivery_stock_item" (
	"id" serial PRIMARY KEY NOT NULL,
	"variantId" integer NOT NULL,
	"sellerId" text NOT NULL,
	"payload" text,
	"payloadHash" text NOT NULL,
	"mask" text NOT NULL,
	"orderId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"soldAt" timestamp,
	CONSTRAINT "delivery_stock_item_orderId_unique" UNIQUE("orderId"),
	CONSTRAINT "delivery_stock_payload_when_available" CHECK (("delivery_stock_item"."orderId" is null) = ("delivery_stock_item"."payload" is not null))
);
--> statement-breakpoint
ALTER TABLE "delivery_stock_item" ADD CONSTRAINT "delivery_stock_item_variantId_product_variant_id_fk" FOREIGN KEY ("variantId") REFERENCES "public"."product_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_stock_item" ADD CONSTRAINT "delivery_stock_item_sellerId_user_id_fk" FOREIGN KEY ("sellerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_stock_item" ADD CONSTRAINT "delivery_stock_item_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_stock_variant_hash_idx" ON "delivery_stock_item" USING btree ("variantId","payloadHash");--> statement-breakpoint
CREATE INDEX "delivery_stock_available_idx" ON "delivery_stock_item" USING btree ("variantId","id") WHERE "delivery_stock_item"."orderId" is null;--> statement-breakpoint
CREATE INDEX "delivery_stock_seller_idx" ON "delivery_stock_item" USING btree ("sellerId");--> statement-breakpoint
-- Anúncios "automáticos" criados antes de existir estoque de itens só tinham o rótulo: o vendedor entregava à mão e o pedido nascia sem prazo
-- (sem reembolso por atraso). Viram manuais com prazo de 24 h; o vendedor volta para "Automática" quando cadastrar itens (docs/entrega-automatica.md).
UPDATE "product" SET "deliveryType" = 'manual', "deliveryTime" = 'Até 24 horas' WHERE "deliveryType" = 'automatica';
