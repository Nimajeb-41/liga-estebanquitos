/**
 * Auditoria.
 *
 * Toda operacion administrativa con efecto sobre la competicion escribe aqui.
 * No es opcional ni "si da tiempo": es lo que permite responder despues por que
 * la tabla tiene los puntos que tiene.
 */

import { schema } from '@liga/database';
import type { LigaDb } from '@liga/database/client';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

export const AUDIT_ACTIONS = [
  'ADMIN_LOGIN',
  'PLAYER_CREATED',
  'PLAYER_UPDATED',
  'PLAYER_DELETED',
  'PLAYER_CONFIRMED',
  'PLAYER_UNCONFIRMED',
  'PLAYER_WITHDRAWN',
  'PLAYER_REPLACED',
  'TOURNAMENT_STATUS_CHANGED',
  // Fase 5: cerrar la temporada es la operacion mas definitiva del sistema. Su
  // entrada guarda si se cerro con pendientes y cuales.
  'SEASON_FINISHED',
  // Fase 5.2: identidad y reglamento de la temporada. El cambio de reglamento
  // guarda el antes y el despues completos: puede reescribir la tabla.
  'SEASON_IDENTITY_UPDATED',
  'SETTINGS_UPDATED',
  'FIXTURE_GENERATED',
  'MATCH_SCHEDULED',
  // Fase 5.5: programar una jornada entera. Guarda el intervalo y cuantos se
  // saltaron, porque una fecha puesta a mano no se pisa sin pedirlo.
  'ROUND_SCHEDULED',
  // Fase 6: programar la temporada entera en sesiones (tres jornadas por sabado).
  'SEASON_SCHEDULED',
  'MATCH_SET_LIVE',
  'MATCH_POSTPONED',
  'MATCH_RESCHEDULED',
  'MATCH_RESULT_REPORTED',
  'MATCH_RESULT_APPROVED',
  'MATCH_RESULT_CORRECTED',
  'MATCH_DISPUTED',
  // Fase 4: cancelar no tiene vuelta atras, asi que su rastro importa mas que
  // el de ninguna otra operacion del calendario.
  'MATCH_CANCELLED',
  // Fase 5: incomparecencia (P-01). Guarda quien falto y desde que hora se
  // contaba la tolerancia, que es lo que hace la decision revisable.
  'WALKOVER_DECLARED',
  'MATCH_STREAM_UPDATED',
  'SANCTION_CREATED',
  'SANCTION_REVOKED',
  // Fase 3: evidencia externa. Ninguna de estas registra un resultado por si
  // misma; la unica que acaba tocando la clasificacion es la confirmacion, y lo
  // hace llamando al mismo servicio que un resultado escrito a mano.
  'CLASH_TAG_LINKED',
  'CLASH_TAG_UNLINKED',
  'CLASH_BATTLELOG_SYNCED',
  'CLASH_CARDS_SYNCED',
  'BATTLE_CANDIDATE_CONFIRMED',
  'BATTLE_CANDIDATE_REJECTED',
  'BATTLE_CANDIDATE_FLAGGED',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  readonly tournamentId: string | null;
  readonly actorAdminId: string | null;
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly payload?: Record<string, unknown>;
  /** La peticion HTTP que la provoco, si vino de una. */
  readonly requestId?: string | undefined;
}

export async function writeAudit(db: LigaDb, entry: AuditEntry): Promise<void> {
  await db.insert(schema.auditLog).values({
    tournamentId: entry.tournamentId,
    actorAdminId: entry.actorAdminId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    payload: entry.payload ?? {},
    requestId: entry.requestId ?? null,
  });
}

export interface AuditRow {
  readonly id: number;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly payload: unknown;
  readonly createdAt: Date;
  readonly actor: string | null;
  readonly requestId: string | null;
}

/**
 * Filtros de la consulta de auditoria.
 *
 * Se aplican **en la base de datos**, no en el navegador. La diferencia no es
 * de rendimiento: filtrando en el cliente habria que enviarle antes el registro
 * entero, y ese registro contiene los motivos de cada correccion y las notas
 * internas de cada aplazamiento. Lo que no se pide, no se manda.
 */
export interface AuditFilters {
  readonly action?: string | undefined;
  readonly actorAdminId?: string | undefined;
  readonly entityType?: string | undefined;
  readonly entityId?: string | undefined;
  readonly requestId?: string | undefined;
  readonly since?: Date | undefined;
  readonly until?: Date | undefined;
  readonly limit?: number | undefined;
}

export async function listAudit(
  db: LigaDb,
  tournamentId: string,
  filters: AuditFilters = {},
): Promise<AuditRow[]> {
  const conditions = [eq(schema.auditLog.tournamentId, tournamentId)];

  if (filters.action !== undefined) {
    conditions.push(eq(schema.auditLog.action, filters.action));
  }
  if (filters.actorAdminId !== undefined) {
    conditions.push(eq(schema.auditLog.actorAdminId, filters.actorAdminId));
  }
  if (filters.entityType !== undefined) {
    conditions.push(eq(schema.auditLog.entityType, filters.entityType));
  }
  if (filters.entityId !== undefined) {
    conditions.push(eq(schema.auditLog.entityId, filters.entityId));
  }
  if (filters.requestId !== undefined) {
    conditions.push(eq(schema.auditLog.requestId, filters.requestId));
  }
  if (filters.since !== undefined) {
    conditions.push(gte(schema.auditLog.createdAt, filters.since));
  }
  if (filters.until !== undefined) {
    conditions.push(lte(schema.auditLog.createdAt, filters.until));
  }

  return db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      entityType: schema.auditLog.entityType,
      entityId: schema.auditLog.entityId,
      payload: schema.auditLog.payload,
      createdAt: schema.auditLog.createdAt,
      actor: schema.adminUsers.displayName,
      requestId: schema.auditLog.requestId,
    })
    .from(schema.auditLog)
    .leftJoin(schema.adminUsers, eq(schema.auditLog.actorAdminId, schema.adminUsers.id))
    .where(and(...conditions))
    .orderBy(desc(schema.auditLog.id))
    .limit(filters.limit ?? 100);
}

/**
 * De que se puede filtrar, segun lo que hay registrado.
 *
 * Se calcula sobre la tabla en vez de listar las constantes: asi el desplegable
 * ofrece solo lo que existe de verdad en este torneo, y no veinte acciones que
 * nunca han ocurrido.
 */
export async function auditFacets(
  db: LigaDb,
  tournamentId: string,
): Promise<{
  actions: { value: string; total: number }[];
  actors: { id: string; displayName: string }[];
  entityTypes: string[];
}> {
  const [actions, actors, entityTypes] = await Promise.all([
    db
      .select({ value: schema.auditLog.action, total: sql<number>`count(*)::int` })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.tournamentId, tournamentId))
      .groupBy(schema.auditLog.action)
      .orderBy(schema.auditLog.action),
    db
      .selectDistinct({ id: schema.adminUsers.id, displayName: schema.adminUsers.displayName })
      .from(schema.auditLog)
      .innerJoin(schema.adminUsers, eq(schema.auditLog.actorAdminId, schema.adminUsers.id))
      .where(eq(schema.auditLog.tournamentId, tournamentId)),
    db
      .selectDistinct({ value: schema.auditLog.entityType })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.tournamentId, tournamentId))
      .orderBy(schema.auditLog.entityType),
  ]);

  return {
    actions,
    actors,
    entityTypes: entityTypes.map((row) => row.value),
  };
}
