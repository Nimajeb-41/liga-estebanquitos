CREATE TYPE "public"."admin_role" AS ENUM('OWNER', 'ADMIN', 'REFEREE', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."deck_source" AS ENUM('MANUAL', 'CLASH_API');--> statement-breakpoint
CREATE TYPE "public"."match_resolution" AS ENUM('PLAYED', 'WALKOVER', 'ADMIN_DECISION');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('SCHEDULED', 'LIVE', 'COMPLETED', 'POSTPONED', 'CANCELLED', 'DISPUTED');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('REGISTERED', 'CONFIRMED', 'WITHDRAWN', 'REPLACED');--> statement-breakpoint
CREATE TYPE "public"."sanction_status" AS ENUM('ACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."sanction_type" AS ENUM('BM', 'NO_SHOW', 'RULE_BREACH', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."tournament_status" AS ENUM('DRAFT', 'REGISTRATION', 'READY', 'SCHEDULED', 'LIVE', 'FINISHED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "tournament_settings" (
	"tournament_id" uuid PRIMARY KEY NOT NULL,
	"points_win" integer DEFAULT 3 NOT NULL,
	"points_win_max_crowns" integer DEFAULT 4 NOT NULL,
	"points_loss" integer DEFAULT 0 NOT NULL,
	"points_draw" integer,
	"points_walkover_win" integer,
	"max_crowns_per_match" integer DEFAULT 3 NOT NULL,
	"sanction_default_points" integer DEFAULT -2 NOT NULL,
	"sanction_min_points" integer DEFAULT -20 NOT NULL,
	"tiebreakers" text[] DEFAULT '{POINTS,CROWN_DIFF,WINS,HEAD_TO_HEAD,MAX_CROWN_WINS}'::text[] NOT NULL,
	"rules_version" text DEFAULT '2026-1.draft' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_sanction_not_positive" CHECK ("tournament_settings"."sanction_default_points" <= 0),
	CONSTRAINT "settings_max_crowns_positive" CHECK ("tournament_settings"."max_crowns_per_match" >= 1)
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"season" text NOT NULL,
	"status" "tournament_status" DEFAULT 'DRAFT' NOT NULL,
	"roster_size" integer DEFAULT 10 NOT NULL,
	"legs" integer DEFAULT 2 NOT NULL,
	"fixture_seed" text,
	"fixture_generated_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournaments_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tournaments_roster_size_even" CHECK ("tournaments"."roster_size" % 2 = 0),
	CONSTRAINT "tournaments_roster_size_min" CHECK ("tournaments"."roster_size" >= 4),
	CONSTRAINT "tournaments_legs_range" CHECK ("tournaments"."legs" between 1 and 2)
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"slug" text NOT NULL,
	"clash_tag" text,
	"clash_tag_verified_at" timestamp with time zone,
	"status" "participant_status" DEFAULT 'REGISTERED' NOT NULL,
	"slot" integer,
	"avatar_url" text,
	"notes" text,
	"replaced_by_player_id" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_slot_positive" CHECK ("players"."slot" is null or "players"."slot" >= 1),
	CONSTRAINT "players_slot_requires_confirmed" CHECK ("players"."slot" is null or "players"."status" = 'CONFIRMED')
);
--> statement-breakpoint
CREATE TABLE "fixture_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"algorithm" text DEFAULT 'CIRCLE_METHOD' NOT NULL,
	"seed" text NOT NULL,
	"legs" integer NOT NULL,
	"player_order" jsonb NOT NULL,
	"generated_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"order_in_round" integer NOT NULL,
	"home_player_id" uuid NOT NULL,
	"away_player_id" uuid NOT NULL,
	"status" "match_status" DEFAULT 'SCHEDULED' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"played_at" timestamp with time zone,
	"stream_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_distinct_players" CHECK ("matches"."home_player_id" <> "matches"."away_player_id"),
	CONSTRAINT "matches_order_positive" CHECK ("matches"."order_in_round" >= 1)
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"leg" integer NOT NULL,
	"label" text,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rounds_number_positive" CHECK ("rounds"."number" >= 1),
	CONSTRAINT "rounds_leg_range" CHECK ("rounds"."leg" between 1 and 2)
);
--> statement-breakpoint
CREATE TABLE "match_result_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"previous_value" jsonb,
	"new_value" jsonb NOT NULL,
	"reason" text NOT NULL,
	"changed_by_admin_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"home_crowns" integer NOT NULL,
	"away_crowns" integer NOT NULL,
	"resolution" "match_resolution" DEFAULT 'PLAYED' NOT NULL,
	"reported_by_player_id" uuid,
	"reported_at" timestamp with time zone,
	"verified_by_admin_id" uuid,
	"verified_at" timestamp with time zone,
	"evidence_url" text,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_results_match_id_unique" UNIQUE("match_id"),
	CONSTRAINT "results_crowns_non_negative" CHECK ("match_results"."home_crowns" >= 0 and "match_results"."away_crowns" >= 0),
	CONSTRAINT "results_crowns_sane" CHECK ("match_results"."home_crowns" <= 20 and "match_results"."away_crowns" <= 20)
);
--> statement-breakpoint
CREATE TABLE "sanctions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"match_id" uuid,
	"round_id" uuid,
	"type" "sanction_type" NOT NULL,
	"points" integer DEFAULT -2 NOT NULL,
	"reason" text NOT NULL,
	"evidence_url" text,
	"notes" text,
	"issued_by_admin_id" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "sanction_status" DEFAULT 'ACTIVE' NOT NULL,
	"revoked_by_admin_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sanctions_points_not_positive" CHECK ("sanctions"."points" <= 0),
	CONSTRAINT "sanctions_reason_not_empty" CHECK (length(btrim("sanctions"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"elixir_cost" integer,
	"rarity" text,
	"icon_url" text,
	"max_level" integer,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deck_cards" (
	"deck_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"card_id" integer NOT NULL,
	"level" integer,
	CONSTRAINT "deck_cards_deck_id_slot_pk" PRIMARY KEY("deck_id","slot"),
	CONSTRAINT "deck_cards_slot_range" CHECK ("deck_cards"."slot" between 1 and 8)
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"match_id" uuid,
	"game_number" integer DEFAULT 1 NOT NULL,
	"source" "deck_source" DEFAULT 'MANUAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decks_game_number_positive" CHECK ("decks"."game_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'ADMIN' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tournament_id" uuid,
	"actor_admin_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tournament_settings" ADD CONSTRAINT "tournament_settings_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_replaced_by_player_id_players_id_fk" FOREIGN KEY ("replaced_by_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture_generations" ADD CONSTRAINT "fixture_generations_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture_generations" ADD CONSTRAINT "fixture_generations_generated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("generated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_player_id_players_id_fk" FOREIGN KEY ("home_player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_player_id_players_id_fk" FOREIGN KEY ("away_player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_result_revisions" ADD CONSTRAINT "match_result_revisions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_result_revisions" ADD CONSTRAINT "match_result_revisions_changed_by_admin_id_admin_users_id_fk" FOREIGN KEY ("changed_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_reported_by_player_id_players_id_fk" FOREIGN KEY ("reported_by_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_verified_by_admin_id_admin_users_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_issued_by_admin_id_admin_users_id_fk" FOREIGN KEY ("issued_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_revoked_by_admin_id_admin_users_id_fk" FOREIGN KEY ("revoked_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_admin_id_admin_users_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "players_tournament_slug_key" ON "players" USING btree ("tournament_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "players_tournament_clash_tag_key" ON "players" USING btree ("tournament_id","clash_tag") WHERE "players"."clash_tag" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "players_tournament_slot_key" ON "players" USING btree ("tournament_id","slot") WHERE "players"."slot" is not null;--> statement-breakpoint
CREATE INDEX "players_tournament_status_idx" ON "players" USING btree ("tournament_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_round_order_key" ON "matches" USING btree ("round_id","order_in_round");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_oriented_pair_key" ON "matches" USING btree ("tournament_id","home_player_id","away_player_id");--> statement-breakpoint
CREATE INDEX "matches_tournament_status_idx" ON "matches" USING btree ("tournament_id","status");--> statement-breakpoint
CREATE INDEX "matches_home_player_idx" ON "matches" USING btree ("home_player_id");--> statement-breakpoint
CREATE INDEX "matches_away_player_idx" ON "matches" USING btree ("away_player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_tournament_number_key" ON "rounds" USING btree ("tournament_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "result_revisions_match_revision_key" ON "match_result_revisions" USING btree ("match_id","revision");--> statement-breakpoint
CREATE INDEX "sanctions_player_status_idx" ON "sanctions" USING btree ("tournament_id","player_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "deck_cards_deck_card_key" ON "deck_cards" USING btree ("deck_id","card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "decks_match_player_game_key" ON "decks" USING btree ("match_id","player_id","game_number") WHERE "decks"."match_id" is not null;--> statement-breakpoint
CREATE INDEX "decks_player_idx" ON "decks" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "audit_log_tournament_idx" ON "audit_log" USING btree ("tournament_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");