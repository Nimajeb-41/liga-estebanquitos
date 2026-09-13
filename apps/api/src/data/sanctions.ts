/** Acceso a sanciones. */

import { schema } from '@liga/database';
import type { LigaDb } from '@liga/database/client';
import type { Sanction } from '@liga/domain';
import { desc, eq } from 'drizzle-orm';

export type SanctionRow = typeof schema.sanctions.$inferSelect;

export interface SanctionWithRound {
  readonly sanction: SanctionRow;
  readonly roundNumber: number | null;
}

export function toDomainSanction(row: SanctionRow, roundNumber: number | null): Sanction {
  return {
    id: row.id,
    playerId: row.playerId,
    matchId: row.matchId,
    roundNumber,
    type: row.type,
    points: row.points,
    reason: row.reason,
    evidenceUrl: row.evidenceUrl,
    notes: row.notes,
    issuedByAdminId: row.issuedByAdminId,
    issuedAt: row.issuedAt.toISOString(),
    status: row.status,
    revokedByAdminId: row.revokedByAdminId,
    revokedAt: row.revokedAt === null ? null : row.revokedAt.toISOString(),
    revokedReason: row.revokedReason,
  };
}

export async function listSanctions(
  db: LigaDb,
  tournamentId: string,
): Promise<SanctionWithRound[]> {
  const rows = await db
    .select({ sanction: schema.sanctions, roundNumber: schema.rounds.number })
    .from(schema.sanctions)
    .leftJoin(schema.rounds, eq(schema.sanctions.roundId, schema.rounds.id))
    .where(eq(schema.sanctions.tournamentId, tournamentId))
    .orderBy(desc(schema.sanctions.issuedAt));
  return rows;
}

export async function loadSanctionsAsDomain(db: LigaDb, tournamentId: string): Promise<Sanction[]> {
  const rows = await listSanctions(db, tournamentId);
  return rows.map((row) => toDomainSanction(row.sanction, row.roundNumber));
}

export async function insertSanction(
  db: LigaDb,
  tournamentId: string,
  sanction: Sanction,
  roundId: string | null,
): Promise<void> {
  await db.insert(schema.sanctions).values({
    id: sanction.id,
    tournamentId,
    playerId: sanction.playerId,
    matchId: sanction.matchId,
    roundId,
    type: sanction.type,
    points: sanction.points,
    reason: sanction.reason,
    evidenceUrl: sanction.evidenceUrl,
    notes: sanction.notes,
    issuedByAdminId: sanction.issuedByAdminId,
    issuedAt: new Date(sanction.issuedAt),
    status: sanction.status,
  });
}

export async function persistRevocation(db: LigaDb, sanction: Sanction): Promise<void> {
  await db
    .update(schema.sanctions)
    .set({
      status: sanction.status,
      revokedByAdminId: sanction.revokedByAdminId,
      revokedAt: sanction.revokedAt === null ? null : new Date(sanction.revokedAt),
      revokedReason: sanction.revokedReason,
    })
    .where(eq(schema.sanctions.id, sanction.id));
}

export async function findSanction(
  db: LigaDb,
  sanctionId: string,
): Promise<SanctionRow | undefined> {
  return db.query.sanctions.findFirst({ where: eq(schema.sanctions.id, sanctionId) });
}
