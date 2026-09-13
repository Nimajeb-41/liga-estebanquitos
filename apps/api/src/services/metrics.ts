/**
 * Metricas de operacion.
 *
 * Responden a «¿como va la liga?» sin abrir la base de datos: cuanto queda por
 * jugar, cuanto lleva atascado y en que estado esta la evidencia externa.
 *
 * Son **recuentos**, no valoraciones. Aqui no se decide que un torneo va «mal»
 * porque tenga tres aplazados: se dice que tiene tres aplazados y quien lo lea
 * juzga. Un umbral inventado en este archivo acabaria pintando semaforos rojos
 * que nadie acordo.
 */

import { schema } from '@liga/database';
import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';

import type { AppContext } from '../data/context.ts';

export interface OperationalMetrics {
  readonly generatedAt: string;
  readonly matches: {
    readonly total: number;
    readonly byStatus: Readonly<Record<string, number>>;
    /** Programados cuya fecha ya paso y siguen sin resultado. */
    readonly overdue: number;
    /** Partidos sin fecha asignada todavia. */
    readonly unscheduled: number;
  };
  readonly attention: {
    /** Aplazados esperando fecha nueva. */
    readonly postponed: number;
    /** Disputas sin resolver: cada una es un partido fuera de la tabla. */
    readonly disputed: number;
    /** Candidatos de Clash Royale esperando revision humana. */
    readonly pendingCandidates: number;
    /** Batallas marcadas por el importador porque algo no cuadraba. */
    readonly battlesNeedingReview: number;
  };
  readonly evidence: {
    readonly linkedPlayers: number;
    readonly syncedPlayers: number;
    readonly storedBattles: number;
    readonly confirmedCandidates: number;
    /**
     * Cuando se sincronizo por ultima vez cualquier participante. `null` si
     * nunca: es la respuesta honesta a «¿esto esta funcionando?».
     */
    readonly lastSyncAt: string | null;
  };
  readonly audit: {
    readonly total: number;
    readonly last24h: number;
    readonly lastEntryAt: string | null;
  };
}

export async function collectMetrics(
  ctx: AppContext,
  tournamentId: string,
): Promise<OperationalMetrics> {
  const now = ctx.now();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [statuses, overdue, unscheduled, candidates, battles, players, audit] = await Promise.all([
    ctx.db
      .select({ status: schema.matches.status, total: sql<number>`count(*)::int` })
      .from(schema.matches)
      .innerJoin(schema.rounds, eq(schema.matches.roundId, schema.rounds.id))
      .where(eq(schema.rounds.tournamentId, tournamentId))
      .groupBy(schema.matches.status),

    // Programado, con fecha, y esa fecha ya paso. Es la lista de «alguien
    // tiene que preguntar que ha pasado con esto».
    ctx.db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.matches)
      .innerJoin(schema.rounds, eq(schema.matches.roundId, schema.rounds.id))
      .where(
        and(
          eq(schema.rounds.tournamentId, tournamentId),
          eq(schema.matches.status, 'SCHEDULED'),
          isNotNull(schema.matches.scheduledAt),
          lt(schema.matches.scheduledAt, now),
        ),
      ),

    ctx.db
      .select({
        total: sql<number>`count(*) filter (where ${schema.matches.scheduledAt} is null)::int`,
      })
      .from(schema.matches)
      .innerJoin(schema.rounds, eq(schema.matches.roundId, schema.rounds.id))
      .where(eq(schema.rounds.tournamentId, tournamentId)),

    ctx.db
      .select({ status: schema.battleCandidates.status, total: sql<number>`count(*)::int` })
      .from(schema.battleCandidates)
      .where(eq(schema.battleCandidates.tournamentId, tournamentId))
      .groupBy(schema.battleCandidates.status),

    ctx.db
      .select({
        total: sql<number>`count(*)::int`,
        needsReview: sql<number>`count(*) filter (where ${schema.externalBattles.needsReview})::int`,
      })
      .from(schema.externalBattles)
      .where(eq(schema.externalBattles.tournamentId, tournamentId)),

    ctx.db
      .select({
        linked: sql<number>`count(*) filter (where ${schema.players.clashTag} is not null)::int`,
        synced: sql<number>`count(*) filter (where ${schema.players.clashSyncedAt} is not null)::int`,
        lastSync: sql<Date | null>`max(${schema.players.clashSyncedAt})`,
      })
      .from(schema.players)
      .where(eq(schema.players.tournamentId, tournamentId)),

    ctx.db
      .select({
        total: sql<number>`count(*)::int`,
        recent: sql<number>`count(*) filter (where ${schema.auditLog.createdAt} >= ${dayAgo})::int`,
        last: sql<Date | null>`max(${schema.auditLog.createdAt})`,
      })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.tournamentId, tournamentId)),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of statuses) byStatus[row.status] = row.total;

  const candidateCount = (status: string): number =>
    candidates.find((row) => row.status === status)?.total ?? 0;

  const toIso = (value: Date | string | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  };

  return {
    generatedAt: now.toISOString(),
    matches: {
      total: statuses.reduce((sum, row) => sum + row.total, 0),
      byStatus,
      overdue: overdue[0]?.total ?? 0,
      unscheduled: unscheduled[0]?.total ?? 0,
    },
    attention: {
      postponed: byStatus['POSTPONED'] ?? 0,
      disputed: byStatus['DISPUTED'] ?? 0,
      pendingCandidates: candidateCount('PENDING'),
      battlesNeedingReview: battles[0]?.needsReview ?? 0,
    },
    evidence: {
      linkedPlayers: players[0]?.linked ?? 0,
      syncedPlayers: players[0]?.synced ?? 0,
      storedBattles: battles[0]?.total ?? 0,
      confirmedCandidates: candidateCount('CONFIRMED'),
      lastSyncAt: toIso(players[0]?.lastSync ?? null),
    },
    audit: {
      total: audit[0]?.total ?? 0,
      last24h: audit[0]?.recent ?? 0,
      lastEntryAt: toIso(audit[0]?.last ?? null),
    },
  };
}
