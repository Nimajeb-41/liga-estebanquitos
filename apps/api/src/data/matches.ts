/**
 * Acceso a jornadas, partidos, resultados y su historial.
 */

import { schema } from '@liga/database';
import type { LigaDb } from '@liga/database/client';
import {
  resolveResult,
  type MatchResult,
  type MatchStatus,
  type PlayedMatch,
  type PostponementEntry,
  type ResultReport,
  type TournamentSettings,
} from '@liga/domain';
import { and, asc, eq } from 'drizzle-orm';

import { notFound } from '../errors.ts';

export type RoundRow = typeof schema.rounds.$inferSelect;
export type MatchRow = typeof schema.matches.$inferSelect;
export type MatchResultRow = typeof schema.matchResults.$inferSelect;
export type ReportRow = typeof schema.matchResultReports.$inferSelect;
export type PostponementRow = typeof schema.matchPostponements.$inferSelect;

export interface MatchWithContext {
  readonly match: MatchRow;
  readonly round: RoundRow;
  readonly homePlayer: { id: string; displayName: string; slug: string };
  readonly awayPlayer: { id: string; displayName: string; slug: string };
  readonly result: MatchResultRow | null;
}

const matchRelations = {
  round: true,
  homePlayer: { columns: { id: true, displayName: true, slug: true } },
  awayPlayer: { columns: { id: true, displayName: true, slug: true } },
  result: true,
} as const;

/**
 * Drizzle devuelve las columnas del partido en la raiz y las relaciones al
 * lado; aqui se separan para que el resto del codigo trabaje con una forma
 * explicita.
 */
function shape(row: Record<string, unknown>): MatchWithContext {
  const { round, homePlayer, awayPlayer, result, ...match } = row as {
    round: RoundRow;
    homePlayer: { id: string; displayName: string; slug: string };
    awayPlayer: { id: string; displayName: string; slug: string };
    result: MatchResultRow | null;
  } & Record<string, unknown>;

  return {
    match: match as unknown as MatchRow,
    round,
    homePlayer,
    awayPlayer,
    result: result ?? null,
  };
}

export async function listMatches(db: LigaDb, tournamentId: string): Promise<MatchWithContext[]> {
  const rows = await db.query.matches.findMany({
    where: eq(schema.matches.tournamentId, tournamentId),
    with: matchRelations,
    orderBy: [asc(schema.matches.orderInRound)],
  });
  return rows
    .map((row) => shape(row as unknown as Record<string, unknown>))
    .sort((a, b) => a.round.number - b.round.number || a.match.orderInRound - b.match.orderInRound);
}

export async function findMatch(db: LigaDb, matchId: string): Promise<MatchWithContext | null> {
  const row = await db.query.matches.findFirst({
    where: eq(schema.matches.id, matchId),
    with: matchRelations,
  });
  return row === undefined ? null : shape(row as unknown as Record<string, unknown>);
}

export async function requireMatch(db: LigaDb, matchId: string): Promise<MatchWithContext> {
  const match = await findMatch(db, matchId);
  if (match === null) throw notFound(`No existe el partido ${matchId}.`, { matchId });
  return match;
}

export async function listRounds(db: LigaDb, tournamentId: string): Promise<RoundRow[]> {
  return db.query.rounds.findMany({
    where: eq(schema.rounds.tournamentId, tournamentId),
    orderBy: [asc(schema.rounds.number)],
  });
}

/**
 * Partidos en la forma que consume el motor de clasificacion.
 * Solo se traen los que tienen resultado; el propio dominio descarta despues
 * los que no estan COMPLETED.
 */
export async function loadPlayedMatches(
  db: LigaDb,
  tournamentId: string,
  settings: TournamentSettings,
): Promise<PlayedMatch[]> {
  const rows = await listMatches(db, tournamentId);
  const played: PlayedMatch[] = [];

  for (const row of rows) {
    if (row.result === null) continue;
    played.push({
      id: row.match.id,
      roundNumber: row.round.number,
      leg: row.round.leg,
      homeId: row.match.homePlayerId,
      awayId: row.match.awayPlayerId,
      status: row.match.status,
      result: toDomainResult(row, settings),
    });
  }
  return played;
}

export function toDomainResult(row: MatchWithContext, settings: TournamentSettings): MatchResult {
  const result = row.result;
  if (result === null) {
    throw notFound(`El partido ${row.match.id} no tiene resultado.`, { matchId: row.match.id });
  }
  return resolveResult(
    { homeId: row.match.homePlayerId, awayId: row.match.awayPlayerId },
    {
      homeCrowns: result.homeCrowns,
      awayCrowns: result.awayCrowns,
      resolution: result.resolution,
      // Solo lo lleva una incomparecencia; en lo demas queda sin poner.
      ...(result.absentPlayerId === null ? {} : { absentPlayerId: result.absentPlayerId }),
    },
    settings,
  );
}

export async function listReports(db: LigaDb, matchId: string): Promise<ReportRow[]> {
  return db.query.matchResultReports.findMany({
    where: eq(schema.matchResultReports.matchId, matchId),
  });
}

export function toDomainReport(row: ReportRow): ResultReport {
  return {
    playerId: row.playerId,
    homeCrowns: row.homeCrowns,
    awayCrowns: row.awayCrowns,
    reportedAt: row.reportedAt.toISOString(),
  };
}

export async function upsertReport(
  db: LigaDb,
  matchId: string,
  report: ResultReport,
  evidenceUrl: string | null,
): Promise<void> {
  await db
    .insert(schema.matchResultReports)
    .values({
      matchId,
      playerId: report.playerId,
      homeCrowns: report.homeCrowns,
      awayCrowns: report.awayCrowns,
      evidenceUrl,
      reportedAt: new Date(report.reportedAt),
    })
    .onConflictDoUpdate({
      target: [schema.matchResultReports.matchId, schema.matchResultReports.playerId],
      set: {
        homeCrowns: report.homeCrowns,
        awayCrowns: report.awayCrowns,
        evidenceUrl,
        reportedAt: new Date(report.reportedAt),
      },
    });
}

export async function setMatchStatus(
  db: LigaDb,
  matchId: string,
  status: MatchStatus,
  extra: Partial<Pick<MatchRow, 'playedAt' | 'scheduledAt' | 'streamUrl'>> = {},
): Promise<void> {
  await db
    .update(schema.matches)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(eq(schema.matches.id, matchId));
}

export async function listPostponements(db: LigaDb, matchId: string): Promise<PostponementRow[]> {
  return db.query.matchPostponements.findMany({
    where: eq(schema.matchPostponements.matchId, matchId),
    orderBy: [asc(schema.matchPostponements.occurredAt)],
  });
}

export async function insertPostponement(
  db: LigaDb,
  matchId: string,
  entry: PostponementEntry,
): Promise<void> {
  await db.insert(schema.matchPostponements).values({
    matchId,
    event: entry.event,
    roundNumber: entry.roundNumber,
    previousScheduledAt:
      entry.previousScheduledAt === null ? null : new Date(entry.previousScheduledAt),
    newScheduledAt: entry.newScheduledAt === null ? null : new Date(entry.newScheduledAt),
    reason: entry.reason,
    notes: entry.notes,
    adminId: entry.adminId,
    occurredAt: new Date(entry.occurredAt),
  });
}

export async function listRevisions(
  db: LigaDb,
  matchId: string,
): Promise<(typeof schema.matchResultRevisions.$inferSelect)[]> {
  return db.query.matchResultRevisions.findMany({
    where: eq(schema.matchResultRevisions.matchId, matchId),
    orderBy: [asc(schema.matchResultRevisions.revision)],
  });
}

export async function countMatches(db: LigaDb, tournamentId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.matches.id })
    .from(schema.matches)
    .where(eq(schema.matches.tournamentId, tournamentId));
  return rows.length;
}

export async function findMatchByPlayers(
  db: LigaDb,
  tournamentId: string,
  homePlayerId: string,
  awayPlayerId: string,
): Promise<MatchRow | undefined> {
  return db.query.matches.findFirst({
    where: and(
      eq(schema.matches.tournamentId, tournamentId),
      eq(schema.matches.homePlayerId, homePlayerId),
      eq(schema.matches.awayPlayerId, awayPlayerId),
    ),
  });
}
