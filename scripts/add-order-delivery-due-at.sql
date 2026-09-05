-- Prazo prometido de entrega, calculado em purchase() a partir de
-- product.deliveryTime no momento da compra (congelado ali pra não mudar
-- se o vendedor editar o anúncio depois — mesmo motivo de productTitle/
-- variantLabel logo acima na tabela). Null pra entrega automática (sem
-- janela fixa) e pra pedidos antigos, de antes desta coluna existir.
-- Alimenta getSellerDeliveryStats() em lib/marketplace.ts.
-- Idempotente: seguro rodar de novo.

ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "deliveryDueAt" timestamp;
