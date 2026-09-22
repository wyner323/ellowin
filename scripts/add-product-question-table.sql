-- Pergunta pública no anúncio, respondida só pelo vendedor dono do produto.
-- O schema.ts já foi atualizado para declarar essa tabela, mas isso não cria
-- a tabela de verdade -- sem drizzle-kit configurado, isso precisa ser
-- rodado manualmente, assim como os outros scripts em scripts/.
--
-- Idempotente: seguro rodar de novo.

CREATE TABLE IF NOT EXISTS "product_question" (
  "id" serial PRIMARY KEY,
  "productId" integer NOT NULL,
  "askerId" text NOT NULL,
  "question" text NOT NULL,
  "answer" text,
  "answeredAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "product_question" ADD CONSTRAINT product_question_product_fk
    FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "product_question" ADD CONSTRAINT product_question_asker_fk
    FOREIGN KEY ("askerId") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS product_question_product_idx ON "product_question" ("productId");
