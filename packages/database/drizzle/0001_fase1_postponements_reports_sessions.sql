CREATE TYPE "public"."postponement_event" AS ENUM('POSTPONED', 'RESCHEDULED');--> statement-breakpoint
CREATE TYPE "public"."postponement_reason" AS ENUM('PERSONAL', 'TECHNICAL', 'CONNECTION', 'SCHEDULE', 'UNAVAILABLE', 'ADMIN_DECISION', 'OTHER');--> statement-breakpoint
CREATE TABLE "match_result_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"home_crowns" integer NOT NULL,
	"away_crowns" integer NOT NULL,
	"evidence_url" text,
	"notes" text,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_result_reports_crowns_non_negative" CHECK ("match_result_reports"."home_crowns" >= 0 and "match_result_reports"."away_crowns" >= 0)
);
--> statement-breakpoint
CREATE TABLE "match_postponements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"event" "postponement_event" NOT NULL,
	"round_number" integer NOT NULL,
	"previous_scheduled_at" timestamp with time zone,
	"new_scheduled_at" timestamp with time zone,
	"reason" "postponement_reason" NOT NULL,
	"notes" text NOT NULL,
	"admin_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_postponements_notes_not_empty" CHECK (length(btrim("match_postponements"."notes")) > 0)
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	CONSTRAINT "admin_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "tournament_settings" ADD COLUMN "dispute_window_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_settings" ADD COLUMN "no_show_tolerance_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "original_scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "postponement_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_result_reports" ADD CONSTRAINT "match_result_reports_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_result_reports" ADD CONSTRAINT "match_result_reports_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_postponements" ADD CONSTRAINT "match_postponements_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_postponements" ADD CONSTRAINT "match_postponements_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_result_reports_match_player_key" ON "match_result_reports" USING btree ("match_id","player_id");--> statement-breakpoint
CREATE INDEX "match_postponements_match_idx" ON "match_postponements" USING btree ("match_id","occurred_at");--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_idx" ON "admin_sessions" USING btree ("admin_id","expires_at");