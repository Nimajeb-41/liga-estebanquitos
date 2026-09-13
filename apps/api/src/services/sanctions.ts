/**
 * Servicio de sanciones.
 *
 * No hay deteccion automatica de BM: la sancion la registra siempre un
 * administrador. Anular no borra: la sancion queda con estado REVOKED, su
 * motivo y su autor, y la tabla se recalcula sola.
 */

import { createSanction, revokeSanction as revokeInDomain, type SanctionType } from '@liga/domain';
import type { AdminSanction, PublicSanction } from '@liga/contracts';
import { eq } from 'drizzle-orm';

import { schema } from '@liga/database';
import { writeAudit } from '../data/audit.ts';
import type { AdminIdentity, AppContext } from '../data/context.ts';
import { assertCan } from '@liga/domain';
import {
  findSanction,
  insertSanction,
  listSanctions,
  persistRevocation,
  toDomainSanction,
} from '../data/sanctions.ts';
import { requireTournament } from '../data/tournament.ts';
import { notFound } from '../errors.ts';

/**
 * Proyeccion publica de las sanciones.
 *
 * Se publica lo que explica la tabla (jugador, motivo, puntos, estado y fecha)
 * y se omite lo interno: la evidencia y las observaciones de administracion.
 */
export async function listPublicSanctions(ctx: AppContext): Promise<PublicSanction[]> {
  const all = await listAllSanctions(ctx);
  return all.map(
    ({ evidenceUrl: _evidenceUrl, notes: _notes, revokedReason: _revokedReason, ...sanction }) =>
      sanction,
  );
}

export async function listAllSanctions(ctx: AppContext): Promise<AdminSanction[]> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const rows = await listSanctions(ctx.db, tournament.id);
  const players = await ctx.db.query.players.findMany({
    where: eq(schema.players.tournamentId, tournament.id),
    columns: { id: true, displayName: true },
  });
  const names = new Map(players.map((player) => [player.id, player.displayName]));

  return rows.map((row) => ({
    id: row.sanction.id,
    playerId: row.sanction.playerId,
    playerName: names.get(row.sanction.playerId) ?? 'Desconocido',
    matchId: row.sanction.matchId,
    roundNumber: row.roundNumber,
    type: row.sanction.type,
    points: row.sanction.points,
    reason: row.sanction.reason,
    evidenceUrl: row.sanction.evidenceUrl,
    notes: row.sanction.notes,
    status: row.sanction.status,
    issuedAt: row.sanction.issuedAt.toISOString(),
    revokedAt: row.sanction.revokedAt === null ? null : row.sanction.revokedAt.toISOString(),
    revokedReason: row.sanction.revokedReason,
  }));
}

export async function createNewSanction(
  ctx: AppContext,
  admin: AdminIdentity,
  input: {
    playerId: string;
    type: SanctionType;
    reason: string;
    points?: number | undefined;
    matchId?: string | null | undefined;
    evidenceUrl?: string | null | undefined;
    notes?: string | null | undefined;
  },
) {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  assertCan(tournament.status, 'RECORD_SANCTIONS');

  const player = await ctx.db.query.players.findFirst({
    where: eq(schema.players.id, input.playerId),
  });
  if (player === undefined || player.tournamentId !== tournament.id) {
    throw notFound(`No existe el participante ${input.playerId} en este torneo.`);
  }

  let roundId: string | null = null;
  if (input.matchId !== undefined && input.matchId !== null) {
    const match = await ctx.db.query.matches.findFirst({
      where: eq(schema.matches.id, input.matchId),
    });
    if (match === undefined) throw notFound(`No existe el partido ${input.matchId}.`);
    roundId = match.roundId;
  }

  const sanction = createSanction(
    {
      id: crypto.randomUUID(),
      playerId: input.playerId,
      type: input.type,
      reason: input.reason,
      issuedByAdminId: admin.id,
      issuedAt: ctx.now().toISOString(),
      ...(input.points === undefined ? {} : { points: input.points }),
      ...(input.matchId === undefined ? {} : { matchId: input.matchId }),
      ...(input.evidenceUrl === undefined ? {} : { evidenceUrl: input.evidenceUrl }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    },
    settings,
  );

  await ctx.db.transaction(async (tx) => {
    await insertSanction(tx, tournament.id, sanction, roundId);
    await writeAudit(tx, {
      tournamentId: tournament.id,
      actorAdminId: admin.id,
      requestId: admin.requestId,
      action: 'SANCTION_CREATED',
      entityType: 'sanction',
      entityId: sanction.id,
      payload: {
        playerId: sanction.playerId,
        type: sanction.type,
        points: sanction.points,
        reason: sanction.reason,
      },
    });
  });

  return { id: sanction.id, points: sanction.points };
}

export async function revokeExistingSanction(
  ctx: AppContext,
  admin: AdminIdentity,
  sanctionId: string,
  reason: string,
) {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const row = await findSanction(ctx.db, sanctionId);
  if (row === undefined || row.tournamentId !== tournament.id) {
    throw notFound(`No existe la sancion ${sanctionId}.`);
  }

  const revoked = revokeInDomain(
    toDomainSanction(row, null),
    admin.id,
    ctx.now().toISOString(),
    reason,
  );

  await ctx.db.transaction(async (tx) => {
    await persistRevocation(tx, revoked);
    await writeAudit(tx, {
      tournamentId: tournament.id,
      actorAdminId: admin.id,
      requestId: admin.requestId,
      action: 'SANCTION_REVOKED',
      entityType: 'sanction',
      entityId: sanctionId,
      payload: { reason, points: row.points, playerId: row.playerId },
    });
  });

  return { id: sanctionId, status: revoked.status };
}
