CREATE TYPE "public"."battle_candidate_status" AS ENUM('PENDING', 'NEEDS_REVIEW', 'CONFIRMED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."clash_link_status" AS ENUM('UNVERIFIED', 'VERIFIED');--> statement-breakpoint
CREATE TABLE "battle_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"external_battle_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"status" "battle_candidate_status" DEFAULT 'PENDING' NOT NULL,
	"confidence" integer NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ambiguities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_admin_id" uuid,
	"resolution_note" text,
	CONSTRAINT "battle_candidates_confidence_range" CHECK ("battle_candidates"."confidence" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "external_battle_cards" (
	"battle_id" uuid NOT NULL,
	"side" integer NOT NULL,
	"slot" integer NOT NULL,
	"is_support" boolean DEFAULT false NOT NULL,
	"card_id" integer NOT NULL,
	"card_name" text NOT NULL,
	"level" integer,
	"evolution_level" integer,
	"star_level" integer,
	CONSTRAINT "external_battle_cards_battle_id_side_is_support_slot_pk" PRIMARY KEY("battle_id","side","is_support","slot"),
	CONSTRAINT "external_battle_cards_slot_positive" CHECK ("external_battle_cards"."slot" >= 1)
);
--> statement-breakpoint
CREATE TABLE "external_battle_sides" (
	"battle_id" uuid NOT NULL,
	"side" integer NOT NULL,
	"clash_tag" text NOT NULL,
	"clash_name" text,
	"crowns" integer NOT NULL,
	"player_id" uuid,
	"princess_towers_standing" integer,
	"king_tower_hit_points" integer,
	"starting_trophies" integer,
	CONSTRAINT "external_battle_sides_battle_id_side_pk" PRIMARY KEY("battle_id","side"),
	CONSTRAINT "external_battle_sides_side_range" CHECK ("external_battle_sides"."side" in (1, 2)),
	CONSTRAINT "external_battle_sides_crowns_range" CHECK ("external_battle_sides"."crowns" >= 0)
);
--> statement-breakpoint
CREATE TABLE "external_battles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"provider" text DEFAULT 'CLASH_ROYALE' NOT NULL,
	"fingerprint" text NOT NULL,
	"battle_time" timestamp with time zone NOT NULL,
	"battle_type" text NOT NULL,
	"game_mode_id" integer,
	"game_mode_name" text,
	"arena_name" text,
	"deck_selection" text,
	"is_hosted_match" boolean,
	"tournament_tag" text,
	"source_player_id" uuid,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "clash_link_status" "clash_link_status";--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "clash_linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "clash_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "clash_name" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "max_evolution_level" integer;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "icon_url_evolution" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "is_support" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "battle_candidates" ADD CONSTRAINT "battle_candidates_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_candidates" ADD CONSTRAINT "battle_candidates_external_battle_id_external_battles_id_fk" FOREIGN KEY ("external_battle_id") REFERENCES "public"."external_battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_candidates" ADD CONSTRAINT "battle_candidates_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_candidates" ADD CONSTRAINT "battle_candidates_resolved_by_admin_id_admin_users_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_battle_cards" ADD CONSTRAINT "external_battle_cards_battle_id_external_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."external_battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_battle_sides" ADD CONSTRAINT "external_battle_sides_battle_id_external_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."external_battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_battle_sides" ADD CONSTRAINT "external_battle_sides_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_battles" ADD CONSTRAINT "external_battles_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_battles" ADD CONSTRAINT "external_battles_source_player_id_players_id_fk" FOREIGN KEY ("source_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "battle_candidates_battle_match_key" ON "battle_candidates" USING btree ("external_battle_id","match_id");--> statement-breakpoint
CREATE INDEX "battle_candidates_status_idx" ON "battle_candidates" USING btree ("tournament_id","status");--> statement-breakpoint
CREATE INDEX "battle_candidates_match_idx" ON "battle_candidates" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "external_battle_cards_card_idx" ON "external_battle_cards" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "external_battle_sides_tag_idx" ON "external_battle_sides" USING btree ("clash_tag");--> statement-breakpoint
CREATE INDEX "external_battle_sides_player_idx" ON "external_battle_sides" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_battles_fingerprint_key" ON "external_battles" USING btree ("tournament_id","provider","fingerprint");--> statement-breakpoint
CREATE INDEX "external_battles_time_idx" ON "external_battles" USING btree ("tournament_id","battle_time");--> statement-breakpoint
CREATE INDEX "external_battles_type_idx" ON "external_battles" USING btree ("tournament_id","battle_type");