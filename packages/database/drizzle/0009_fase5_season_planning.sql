-- Fase 5.2 · Fechas previstas de la temporada
--
-- Son planes, no hechos. `started_at` y `finished_at` ya guardan cuándo pasó de
-- verdad; estas dos guardan cuándo se pensaba que iba a pasar. Separarlas
-- permite decir «la liga empezó dos semanas tarde» en vez de reescribir la
-- intención original y perder esa información para siempre.

ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "planned_start_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "planned_end_at" timestamp with time zone;
