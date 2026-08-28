-- Chaves estrangeiras que faltavam no banco (o schema.ts já foi atualizado
-- para documentar essas relações, mas isso não cria as constraints de
-- verdade -- sem drizzle-kit configurado, isso precisa ser rodado manualmente
-- no SQL console do Neon/v0, assim como scripts/add-indexes.sql.
--
-- Cada bloco é idempotente (seguro rodar de novo). Se algum falhar com erro
-- de dado órfão (linha que referencia um id que não existe mais), rode esse
-- bloco isolado pra eu ajudar a localizar e limpar a linha problemática --
-- os outros blocos não são afetados.

DO $$ BEGIN
  ALTER TABLE "profile" ADD CONSTRAINT profile_user_fk
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "seller_application" ADD CONSTRAINT seller_application_user_fk
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "otp_code" ADD CONSTRAINT otp_code_user_fk
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "wallet" ADD CONSTRAINT wallet_user_fk
    FOREIGN KEY ("userId") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "wallet_transaction" ADD CONSTRAINT wallet_transaction_user_fk
    FOREIGN KEY ("userId") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "product" ADD CONSTRAINT product_seller_fk
    FOREIGN KEY ("sellerId") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "product_image" ADD CONSTRAINT product_image_product_fk
    FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "product_variant" ADD CONSTRAINT product_variant_product_fk
    FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "order" ADD CONSTRAINT order_buyer_fk
    FOREIGN KEY ("buyerId") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "order" ADD CONSTRAINT order_seller_fk
    FOREIGN KEY ("sellerId") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "order" ADD CONSTRAINT order_product_fk
    FOREIGN KEY ("productId") REFERENCES "product"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "order" ADD CONSTRAINT order_variant_fk
    FOREIGN KEY ("variantId") REFERENCES "product_variant"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "review" ADD CONSTRAINT review_order_fk
    FOREIGN KEY ("orderId") REFERENCES "order"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "review" ADD CONSTRAINT review_product_fk
    FOREIGN KEY ("productId") REFERENCES "product"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "review" ADD CONSTRAINT review_seller_fk
    FOREIGN KEY ("sellerId") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "review" ADD CONSTRAINT review_buyer_fk
    FOREIGN KEY ("buyerId") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dispute" ADD CONSTRAINT dispute_order_fk
    FOREIGN KEY ("orderId") REFERENCES "order"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dispute" ADD CONSTRAINT dispute_opened_by_fk
    FOREIGN KEY ("openedBy") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dispute" ADD CONSTRAINT dispute_moderator_fk
    FOREIGN KEY ("moderatorId") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dispute_message" ADD CONSTRAINT dispute_message_dispute_fk
    FOREIGN KEY ("disputeId") REFERENCES "dispute"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dispute_message" ADD CONSTRAINT dispute_message_author_fk
    FOREIGN KEY ("authorId") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
