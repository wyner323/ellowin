-- Chat do pedido: comprador e vendedor combinam a entrega antes de qualquer
-- disputa. O schema.ts já foi atualizado para declarar essa tabela, mas isso
-- não cria a tabela de verdade -- sem drizzle-kit configurado, isso precisa
-- ser rodado manualmente no SQL console do Neon/v0, assim como os outros
-- scripts em scripts/.
--
-- Idempotente: seguro rodar de novo.

CREATE TABLE IF NOT EXISTS "order_message" (
  "id" serial PRIMARY KEY,
  "orderId" integer NOT NULL,
  "authorId" text,
  "authorRole" text NOT NULL,
  "body" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "order_message" ADD CONSTRAINT order_message_order_fk
    FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "order_message" ADD CONSTRAINT order_message_author_fk
    FOREIGN KEY ("authorId") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS order_message_order_idx ON "order_message" ("orderId");
