-- Último instante de atividade do usuário — status online/offline e "último
-- acesso" no perfil público. Atualizado (com throttle) em getUserId().
-- Idempotente: seguro rodar de novo.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "lastActiveAt" timestamp;
