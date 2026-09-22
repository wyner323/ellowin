-- Registro de "conta recuperada" contra um vendedor -- base do Selo de
-- Certificação (verificador público em /verificador). Marcado manualmente
-- pelo moderador ao encerrar uma disputa a favor do comprador.
--
-- Idempotente: seguro rodar de novo.

CREATE TABLE IF NOT EXISTS "seller_account_flag" (
  "id" serial PRIMARY KEY,
  "sellerId" text NOT NULL,
  "disputeId" integer NOT NULL UNIQUE,
  "moderatorId" text NOT NULL,
  "note" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "seller_account_flag" ADD CONSTRAINT seller_account_flag_seller_fk
    FOREIGN KEY ("sellerId") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "seller_account_flag" ADD CONSTRAINT seller_account_flag_dispute_fk
    FOREIGN KEY ("disputeId") REFERENCES "dispute"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "seller_account_flag" ADD CONSTRAINT seller_account_flag_moderator_fk
    FOREIGN KEY ("moderatorId") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS seller_account_flag_seller_idx ON "seller_account_flag" ("sellerId");
