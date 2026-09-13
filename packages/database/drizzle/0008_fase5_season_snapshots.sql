-- Fase 5 · Instantánea de cierre de temporada
--
-- La clasificación **se deriva**: no se guarda. Eso es correcto mientras la
-- temporada está viva —cambiar la puntuación recalcula la tabla sin tocar
-- ningún histórico— pero significa que, sin esta tabla, la clasificación final
-- de 2026-1 cambiaría el día que alguien ajuste el reglamento para 2026-2.
--
-- La carga va en JSON y no en columnas porque es un documento histórico, no una
-- entidad viva: no se consulta por campos ni se actualiza. Se lee entera.
--
-- Nunca contiene tokens, sesiones ni credenciales: es una foto de la
-- competición, no del servidor.

CREATE TABLE IF NOT EXISTS "season_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" uuid NOT NULL,
  "rules_version" text NOT NULL,
  "closed_at" timestamp with time zone NOT NULL,
  "closed_by_admin_id" uuid,
  "closed_by_name" text,
  "reason" text NOT NULL,
  "closed_with_pending" boolean DEFAULT false NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "season_snapshots"
  DROP CONSTRAINT IF EXISTS "season_snapshots_tournament_id_tournaments_id_fk";
--> statement-breakpoint
ALTER TABLE "season_snapshots"
  ADD CONSTRAINT "season_snapshots_tournament_id_tournaments_id_fk"
  FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "season_snapshots_tournament_idx"
  ON "season_snapshots" USING btree ("tournament_id","closed_at");
