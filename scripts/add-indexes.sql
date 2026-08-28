-- Índices para as colunas mais consultadas (checagens de dono, dashboards,
-- listagens). Rode isso direto no SQL console do Neon/v0 — não há
-- drizzle-kit configurado neste projeto, então os índices não entram
-- automaticamente no deploy.

CREATE INDEX IF NOT EXISTS idx_order_buyer_id ON "order" ("buyerId");
CREATE INDEX IF NOT EXISTS idx_order_seller_id ON "order" ("sellerId");
CREATE INDEX IF NOT EXISTS idx_order_product_id ON "order" ("productId");
CREATE INDEX IF NOT EXISTS idx_order_variant_id ON "order" ("variantId");

CREATE INDEX IF NOT EXISTS idx_product_seller_id ON "product" ("sellerId");
CREATE INDEX IF NOT EXISTS idx_product_variant_product_id ON "product_variant" ("productId");
CREATE INDEX IF NOT EXISTS idx_product_image_product_id ON "product_image" ("productId");

CREATE INDEX IF NOT EXISTS idx_review_seller_id ON "review" ("sellerId");
CREATE INDEX IF NOT EXISTS idx_review_product_id ON "review" ("productId");

CREATE INDEX IF NOT EXISTS idx_dispute_order_id ON "dispute" ("orderId");
CREATE INDEX IF NOT EXISTS idx_dispute_message_dispute_id ON "dispute_message" ("disputeId");

CREATE INDEX IF NOT EXISTS idx_wallet_transaction_user_id ON "wallet_transaction" ("userId");
CREATE INDEX IF NOT EXISTS idx_otp_code_user_channel ON "otp_code" ("userId", "channel");
