CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dispute_status_response_due_idx" ON "dispute" USING btree ("status","sellerResponseDueAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dispute_message_dispute_idx" ON "dispute_message" USING btree ("disputeId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_buyer_idx" ON "order" USING btree ("buyerId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_seller_idx" ON "order" USING btree ("sellerId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_status_auto_release_idx" ON "order" USING btree ("status","autoReleaseAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_status_delivery_due_idx" ON "order" USING btree ("status","deliveryDueAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_message_order_idx" ON "order_message" USING btree ("orderId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "otp_code_lookup_idx" ON "otp_code" USING btree ("userId","channel","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_seller_idx" ON "product" USING btree ("sellerId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_category_idx" ON "product" USING btree ("categorySlug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_image_product_idx" ON "product_image" USING btree ("productId","sortOrder");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_question_product_idx" ON "product_question" USING btree ("productId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "variant_product_idx" ON "product_variant" USING btree ("productId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_product_idx" ON "review" USING btree ("productId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_seller_idx" ON "review" USING btree ("sellerId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seller_account_flag_seller_idx" ON "seller_account_flag" USING btree ("sellerId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seller_application_store_slug_unique_idx" ON "seller_application" USING btree (lower("storeSlug")) WHERE "storeSlug" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_display_name_unique_idx" ON "user" USING btree (lower("displayName")) WHERE "displayName" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_tx_user_created_idx" ON "wallet_transaction" USING btree ("userId","createdAt");--> statement-breakpoint
-- Substituído por wallet_tx_user_created_idx (userId, createdAt), que cobre a mesma busca.
DROP INDEX IF EXISTS "wallet_tx_user_idx";
