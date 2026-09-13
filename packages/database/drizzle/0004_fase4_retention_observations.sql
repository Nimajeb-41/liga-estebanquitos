CREATE TABLE "battle_retention_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'CLASH_ROYALE' NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"player_tag" text NOT NULL,
	"battle_fingerprint" text NOT NULL,
	"battle_time" timestamp with time zone NOT NULL,
	"age_hours" numeric(8, 1) NOT NULL,
	"still_present" boolean NOT NULL,
	"request_status" text NOT NULL,
	"notes" text,
	CONSTRAINT "battle_retention_age_positive" CHECK ("battle_retention_observations"."age_hours" >= 0)
);
--> statement-breakpoint
CREATE INDEX "battle_retention_fingerprint_idx" ON "battle_retention_observations" USING btree ("battle_fingerprint","observed_at");--> statement-breakpoint
CREATE INDEX "battle_retention_tag_idx" ON "battle_retention_observations" USING btree ("player_tag","observed_at");