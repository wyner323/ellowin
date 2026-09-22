CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispute" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"openedBy" text NOT NULL,
	"reason" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'aberta' NOT NULL,
	"firstContactDueAt" timestamp NOT NULL,
	"sellerResponseDueAt" timestamp NOT NULL,
	"resolutionDueAt" timestamp NOT NULL,
	"sellerFirstResponseAt" timestamp,
	"moderatorId" text,
	"resolution" text,
	"resolvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dispute_orderId_unique" UNIQUE("orderId")
);
--> statement-breakpoint
CREATE TABLE "dispute_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"disputeId" integer NOT NULL,
	"authorId" text,
	"authorRole" text NOT NULL,
	"body" text NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" serial PRIMARY KEY NOT NULL,
	"buyerId" text NOT NULL,
	"sellerId" text NOT NULL,
	"productId" integer NOT NULL,
	"variantId" integer NOT NULL,
	"productTitle" text NOT NULL,
	"variantLabel" text NOT NULL,
	"amountCents" integer NOT NULL,
	"feeCents" integer DEFAULT 0 NOT NULL,
	"sellerNetCents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'aguardando_entrega' NOT NULL,
	"deliveryPayload" text,
	"deliveredAt" timestamp,
	"deliveryDueAt" timestamp,
	"autoReleaseAt" timestamp,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"authorId" text,
	"authorRole" text NOT NULL,
	"body" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_code" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"channel" text NOT NULL,
	"destination" text NOT NULL,
	"code" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumedAt" timestamp,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" serial PRIMARY KEY NOT NULL,
	"sellerId" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"categorySlug" text NOT NULL,
	"game" text,
	"description" text DEFAULT '' NOT NULL,
	"deliveryType" text DEFAULT 'manual' NOT NULL,
	"deliveryTime" text DEFAULT 'ate 24h' NOT NULL,
	"accountOrigin" text,
	"status" text DEFAULT 'ativo' NOT NULL,
	"ratingSum" integer DEFAULT 0 NOT NULL,
	"ratingCount" integer DEFAULT 0 NOT NULL,
	"salesCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_image" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer NOT NULL,
	"url" text NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_question" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer NOT NULL,
	"askerId" text NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"answeredAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variant" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer NOT NULL,
	"label" text NOT NULL,
	"priceCents" integer NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"deliveryNote" text,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"fullName" text NOT NULL,
	"phone" text,
	"cpf" text,
	"birthDate" text,
	"phoneVerified" boolean DEFAULT false NOT NULL,
	"cpfVerified" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "profile_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"productId" integer NOT NULL,
	"sellerId" text NOT NULL,
	"buyerId" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "review_orderId_unique" UNIQUE("orderId")
);
--> statement-breakpoint
CREATE TABLE "seller_account_flag" (
	"id" serial PRIMARY KEY NOT NULL,
	"sellerId" text NOT NULL,
	"disputeId" integer NOT NULL,
	"moderatorId" text NOT NULL,
	"note" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seller_account_flag_disputeId_unique" UNIQUE("disputeId")
);
--> statement-breakpoint
CREATE TABLE "seller_application" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"storeName" text,
	"storeSlug" text,
	"category" text,
	"description" text,
	"documentType" text,
	"documentNumber" text,
	"documentFrontName" text,
	"selfieName" text,
	"pixKeyType" text,
	"pixKey" text,
	"bankHolder" text,
	"acceptedTerms" boolean DEFAULT false NOT NULL,
	"currentStep" integer DEFAULT 1 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'em_andamento' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seller_application_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"displayName" text,
	"bio" text,
	"bannerUrl" text,
	"accentColor" text,
	"role" text DEFAULT 'user' NOT NULL,
	"lastActiveAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"availableCents" integer DEFAULT 0 NOT NULL,
	"heldCents" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "wallet_transaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"orderId" integer,
	"kind" text NOT NULL,
	"amountCents" integer NOT NULL,
	"balanceAfterCents" integer NOT NULL,
	"description" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_openedBy_user_id_fk" FOREIGN KEY ("openedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_moderatorId_user_id_fk" FOREIGN KEY ("moderatorId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_message" ADD CONSTRAINT "dispute_message_disputeId_dispute_id_fk" FOREIGN KEY ("disputeId") REFERENCES "public"."dispute"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_message" ADD CONSTRAINT "dispute_message_authorId_user_id_fk" FOREIGN KEY ("authorId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_buyerId_user_id_fk" FOREIGN KEY ("buyerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_sellerId_user_id_fk" FOREIGN KEY ("sellerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_variantId_product_variant_id_fk" FOREIGN KEY ("variantId") REFERENCES "public"."product_variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_message" ADD CONSTRAINT "order_message_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_message" ADD CONSTRAINT "order_message_authorId_user_id_fk" FOREIGN KEY ("authorId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_code" ADD CONSTRAINT "otp_code_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_sellerId_user_id_fk" FOREIGN KEY ("sellerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_image" ADD CONSTRAINT "product_image_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_question" ADD CONSTRAINT "product_question_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_question" ADD CONSTRAINT "product_question_askerId_user_id_fk" FOREIGN KEY ("askerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_sellerId_user_id_fk" FOREIGN KEY ("sellerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_buyerId_user_id_fk" FOREIGN KEY ("buyerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_account_flag" ADD CONSTRAINT "seller_account_flag_sellerId_user_id_fk" FOREIGN KEY ("sellerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_account_flag" ADD CONSTRAINT "seller_account_flag_disputeId_dispute_id_fk" FOREIGN KEY ("disputeId") REFERENCES "public"."dispute"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_account_flag" ADD CONSTRAINT "seller_account_flag_moderatorId_user_id_fk" FOREIGN KEY ("moderatorId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_application" ADD CONSTRAINT "seller_application_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transaction" ADD CONSTRAINT "wallet_transaction_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;