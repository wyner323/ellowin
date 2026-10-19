CREATE TABLE "seller_goal" (
	"userId" text PRIMARY KEY NOT NULL,
	"monthlyGoalCents" integer NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seller_goal_positive" CHECK ("seller_goal"."monthlyGoalCents" > 0)
);
--> statement-breakpoint
ALTER TABLE "seller_goal" ADD CONSTRAINT "seller_goal_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;