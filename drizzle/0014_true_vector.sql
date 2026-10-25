-- Regras de valor que o código já respeita, agora também garantidas pelo banco (última linha de defesa contra um
-- bug futuro ou um UPDATE manual). NOT VALID: vale para toda linha nova ou alterada, sem reprovar a migração por
-- causa de dado antigo; depois de rodar, `ALTER TABLE ... VALIDATE CONSTRAINT <nome>` confere o histórico (PENDENCIAS.md).
ALTER TABLE "order" ADD CONSTRAINT "order_amount_positive" CHECK ("order"."amountCents" > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_split_nonneg" CHECK ("order"."feeCents" >= 0 and "order"."sellerNetCents" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "variant_price_positive" CHECK ("product_variant"."priceCents" > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "variant_stock_nonneg" CHECK ("product_variant"."stock" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_rating_range" CHECK ("review"."rating" between 1 and 5) NOT VALID;--> statement-breakpoint
ALTER TABLE "wallet_transaction" ADD CONSTRAINT "wallet_tx_balance_nonneg" CHECK ("wallet_transaction"."balanceAfterCents" >= 0) NOT VALID;
