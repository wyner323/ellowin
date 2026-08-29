-- Personalização de perfil: bio, banner de loja, cor de destaque, e apelido
-- único (case-insensitive) para evitar dois usuários com o mesmo nick.
-- Idempotente: seguro rodar de novo.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "bio" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "bannerUrl" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "accentColor" text;

CREATE UNIQUE INDEX IF NOT EXISTS user_display_name_unique_idx
  ON "user" (lower("displayName"))
  WHERE "displayName" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS seller_application_store_slug_unique_idx
  ON "seller_application" (lower("storeSlug"))
  WHERE "storeSlug" IS NOT NULL;
