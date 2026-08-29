-- Apelido público do usuário, separado do nome legal (`user.name`).
-- Idempotente: seguro rodar de novo.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "displayName" text;
