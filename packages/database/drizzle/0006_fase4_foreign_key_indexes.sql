-- Fase 4.11 · Indices sobre claves ajenas
--
-- Postgres no indexa las claves ajenas por su cuenta, y eso se paga dos veces:
-- cada consulta que navega la relacion recorre la tabla entera, y cada borrado
-- en la tabla referenciada tiene que comprobar todas las filas que podrian
-- apuntar a la que se va.
--
-- Estos son los que importan de verdad, porque la aplicacion **borra** de las
-- tablas del otro lado:
--
--   · `deletePlayer` borra participantes (apps/api/src/data/players.ts).
--   · Regenerar el calendario borra las rondas enteras, que arrastran en
--     cascada partidos, resultados, reportes, revisiones y aplazamientos
--     (apps/api/src/services/fixture.ts).
--
-- Las claves que apuntan a `admin_users` se quedan sin indice a proposito: la
-- aplicacion no borra administradores por ninguna via, y un indice que nunca
-- se usa solo cuesta escrituras. Queda documentado en scripts/audit-indexes.mjs,
-- que los sigue listando cada vez que se ejecuta.

CREATE INDEX IF NOT EXISTS "sanctions_player_idx" ON "sanctions" USING btree ("player_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sanctions_match_idx" ON "sanctions" USING btree ("match_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sanctions_round_idx" ON "sanctions" USING btree ("round_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_result_reports_player_idx" ON "match_result_reports" USING btree ("player_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_results_reporter_idx" ON "match_results" USING btree ("reported_by_player_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_battles_source_idx" ON "external_battles" USING btree ("source_player_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_replaced_by_idx" ON "players" USING btree ("replaced_by_player_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decks_tournament_idx" ON "decks" USING btree ("tournament_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fixture_generations_tournament_idx" ON "fixture_generations" USING btree ("tournament_id");
