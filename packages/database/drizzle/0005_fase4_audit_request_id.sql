-- Fase 4.10 · Auditoria y observabilidad
--
-- Dos cosas, y las dos existen para responder preguntas que hoy no se pueden
-- responder:
--
-- 1. `request_id` cruza una entrada de auditoria con las lineas de registro de
--    la peticion que la provoco. Sin esto, «esta correccion salio mal» y «este
--    error en el log» son dos hechos sueltos que nadie puede unir.
--
-- 2. Los indices por actor y por accion. La pantalla de auditoria filtra por
--    ambos, y sin indice cada filtro seria un recorrido completo de la tabla
--    que solo crece.

ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "request_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_actor_idx" ON "audit_log" USING btree ("actor_admin_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_action_idx" ON "audit_log" USING btree ("action","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_request_idx" ON "audit_log" USING btree ("request_id");
