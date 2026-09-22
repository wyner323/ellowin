-- Procedência declarada de uma conta de jogo (só relevante pra
-- categorySlug = "contas") — ver lib/account-origin.ts pros valores
-- aceitos. Null pra anúncios de outras categorias e pra anúncios
-- criados antes desta coluna existir.
-- Idempotente: seguro rodar de novo.

ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "accountOrigin" text;
