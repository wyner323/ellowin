CREATE TABLE "report" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporterId" text NOT NULL,
	"targetType" text NOT NULL,
	"targetProductId" integer,
	"targetUserId" text,
	"reason" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'aberta' NOT NULL,
	"moderatorId" text,
	"resolutionNote" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"resolvedAt" timestamp,
	CONSTRAINT "report_target_matches_type" CHECK (("report"."targetType" = 'anuncio' AND "report"."targetProductId" IS NOT NULL AND "report"."targetUserId" IS NULL)
          OR ("report"."targetType" = 'usuario' AND "report"."targetUserId" IS NOT NULL AND "report"."targetProductId" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporterId_user_id_fk" FOREIGN KEY ("reporterId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_targetProductId_product_id_fk" FOREIGN KEY ("targetProductId") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_targetUserId_user_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_moderatorId_user_id_fk" FOREIGN KEY ("moderatorId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_status_idx" ON "report" USING btree ("status");--> statement-breakpoint
CREATE INDEX "report_target_product_idx" ON "report" USING btree ("targetProductId");--> statement-breakpoint
CREATE INDEX "report_target_user_idx" ON "report" USING btree ("targetUserId");