-- Fase 5.0 · Cierre de la regla P-01 (incomparecencias)
--
-- Decisión del 10 de septiembre de 2026:
--
--   presente → PJ +1, VG +1, PTS +3, coronas 0
--   ausente  → PJ +1, VP +1, PTS +0, coronas 0
--
-- Tres puntos, no cuatro: una victoria por tres coronas hay que conseguirla
-- jugando. Y cero coronas, no un 3-0 inventado: la diferencia de coronas es el
-- primer criterio de desempate después de los puntos, y dos incomparecencias
-- decidirían la liga con coronas que nadie consiguió.
--
-- `NULL` sigue significando «sin decidir» en las tres columnas: si una
-- temporada futura vuelve a dejar la regla abierta, el motor se niega a
-- registrar el walkover con `PENDING_RULE` en lugar de inventar una puntuación.

ALTER TABLE "tournament_settings" ADD COLUMN IF NOT EXISTS "walkover_crowns_winner" integer;
--> statement-breakpoint
ALTER TABLE "tournament_settings" ADD COLUMN IF NOT EXISTS "walkover_crowns_loser" integer;
--> statement-breakpoint

-- La decisión se aplica a los torneos que ya existen, y sube la versión del
-- reglamento: la tabla se calculó hasta hoy con `2026-1.1`, y a partir de ahora
-- con `2026-1.2`. La versión viaja en cada respuesta de clasificación
-- precisamente para poder decir con qué reglas se calculó lo que se está viendo.
UPDATE "tournament_settings"
   SET "points_walkover_win"     = 3,
       "walkover_crowns_winner"  = 0,
       "walkover_crowns_loser"   = 0,
       "rules_version"           = '2026-1.2',
       "updated_at"              = now()
 WHERE "points_walkover_win" IS NULL
   AND "rules_version" LIKE '2026-1%';
--> statement-breakpoint

-- Quién no se presentó.
--
-- Sin esta columna una incomparecencia no se puede reconstruir al leerla: el
-- marcador es 0-0 y no dice quién ganó. Antes el ganador se deducía siempre de
-- las coronas, pero P-01 decide justamente que un walkover no reparte ninguna.
ALTER TABLE "match_results" ADD COLUMN IF NOT EXISTS "absent_player_id" uuid;
--> statement-breakpoint
ALTER TABLE "match_results"
  DROP CONSTRAINT IF EXISTS "match_results_absent_player_id_players_id_fk";
--> statement-breakpoint
ALTER TABLE "match_results"
  ADD CONSTRAINT "match_results_absent_player_id_players_id_fk"
  FOREIGN KEY ("absent_player_id") REFERENCES "players"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_results_absent_idx" ON "match_results" USING btree ("absent_player_id");
