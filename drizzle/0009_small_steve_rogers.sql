CREATE TABLE "product_view_daily" (
	"productId" integer NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_view_daily_productId_day_pk" PRIMARY KEY("productId","day")
);
--> statement-breakpoint
ALTER TABLE "product_view_daily" ADD CONSTRAINT "product_view_daily_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;