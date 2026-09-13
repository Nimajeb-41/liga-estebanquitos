/**
 * Servicio de participantes.
 *
 * Todas las reglas (plazas, duplicados, cupo de 10, quien puede tocar la
 * plantilla y cuando) las decide `@liga/domain`. Este modulo carga, delega,
 * persiste el cambio y lo audita.
 */

import { schema } from '@liga/database';
import {
  addParticipant,
  assertCan,
  can,
  confirmParticipant,
  DomainError,
  pendingRule,
  removeParticipant,
  replaceParticipant,
  requireParticipant,
  rosterSummary,
  unconfirmParticipant,
  updateParticipant,
  withdrawParticipant,
  type NewParticipantInput,
  type ParticipantPatch,
  type Roster,
  type TournamentCapability,
} from '@liga/domain';
import type { AdminPlayersResponse, PlayersResponse } from '@liga/contracts';
import { and, eq, or } from 'drizzle-orm';

import { writeAudit, type AuditAction } from '../data/audit.ts';
import type { AdminIdentity, AppContext } from '../data/context.ts';
import { diffRoster, loadRoster, loadRosterAsDomain, persistRosterDiff } from '../data/players.ts';
import { requireTournament } from '../data/tournament.ts';
import { conflict, forbidden } from '../errors.ts';

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Proyeccion publica y proyeccion administrativa.
 *
 * Las notas internas y la fecha de alta solo se devuelven a administracion: el
 * sitio publico no necesita saber que alguien "confirma por Discord".
 */
export async function listPlayers(ctx: AppContext): Promise<PlayersResponse> {
  const full = await listPlayersForAdmin(ctx);
  return {
    summary: full.summary,
    slots: full.slots,
    players: full.players.map(({ notes: _notes, createdAt: _createdAt, ...player }) => player),
  };
}

export async function listPlayersForAdmin(ctx: AppContext): Promise<AdminPlayersResponse> {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const rows = await loadRoster(ctx.db, tournament.id);
  const roster: Roster = rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    clashTag: row.clashTag,
    clashLinkStatus: row.clashLinkStatus,
    status: row.status,
    slot: row.slot,
    notes: row.notes,
    replacedByPlayerId: row.replacedByPlayerId,
  }));
  const summary = rosterSummary(roster, settings);

  return {
    summary: {
      confirmed: summary.confirmed,
      pending: summary.pending,
      registered: summary.registered,
      rosterSize: summary.rosterSize,
      complete: summary.complete,
    },
    slots: summary.slots.map((slot) => ({
      slot: slot.slot,
      player:
        slot.participant === null
          ? null
          : { id: slot.participant.id, displayName: slot.participant.displayName },
    })),
    players: rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      slug: row.slug,
      clashTag: row.clashTag,
      clashLinkStatus: row.clashLinkStatus,
      status: row.status,
      slot: row.slot,
      avatarUrl: row.avatarUrl,
      notes: row.notes,
      replacedByPlayerId: row.replacedByPlayerId,
      confirmedAt: row.confirmedAt === null ? null : row.confirmedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/**
 * Aplica una operacion de plantilla: carga, delega en el dominio, persiste el
 * diff y audita. Todo dentro de una transaccion.
 */
async function mutateRoster(
  ctx: AppContext,
  admin: AdminIdentity,
  action: AuditAction,
  apply: (roster: Roster, settings: Parameters<typeof rosterSummary>[1]) => Roster,
  entityId: (before: Roster, after: Roster) => string | null,
  payload: Record<string, unknown> = {},
  /*
    Que permiso exige esta operacion.

    Casi todas cambian **quien** compite y piden `MANAGE_ROSTER`, que se pierde
    en cuanto hay calendario. Renombrar no: cambia una etiqueta, no la
    competicion, y por eso pide un permiso propio que sigue disponible.
  */
  capability: TournamentCapability = 'MANAGE_ROSTER',
) {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  assertCan(tournament.status, capability);

  return ctx.db.transaction(async (tx) => {
    const { roster: before } = await loadRosterAsDomain(tx, tournament.id);
    const after = apply(before, settings);
    const diff = diffRoster(before, after);
    await persistRosterDiff(tx, tournament.id, diff);

    await writeAudit(tx, {
      tournamentId: tournament.id,
      actorAdminId: admin.id,
      requestId: admin.requestId,
      action,
      entityType: 'player',
      entityId: entityId(before, after),
      payload,
    });

    return after;
  });
}

export async function createPlayer(
  ctx: AppContext,
  admin: AdminIdentity,
  input: {
    displayName: string;
    clashTag?: string | null | undefined;
    notes?: string | null | undefined;
  },
) {
  const id = newId();
  const participant: NewParticipantInput = {
    id,
    displayName: input.displayName,
    ...(input.clashTag === undefined ? {} : { clashTag: input.clashTag }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  };
  await mutateRoster(
    ctx,
    admin,
    'PLAYER_CREATED',
    (roster, settings) => addParticipant(roster, participant, settings),
    () => id,
    { displayName: input.displayName },
  );
  return { id };
}

export async function updatePlayer(
  ctx: AppContext,
  admin: AdminIdentity,
  playerId: string,
  patch: ParticipantPatch,
) {
  await mutateRoster(
    ctx,
    admin,
    'PLAYER_UPDATED',
    (roster) => updateParticipant(roster, playerId, patch),
    () => playerId,
    { patch },
    'RENAME_PLAYER',
  );
}

export async function confirmPlayer(
  ctx: AppContext,
  admin: AdminIdentity,
  playerId: string,
  slot?: number,
) {
  await mutateRoster(
    ctx,
    admin,
    'PLAYER_CONFIRMED',
    (roster, settings) => confirmParticipant(roster, playerId, settings, slot),
    () => playerId,
    slot === undefined ? {} : { slot },
  );
}

export async function unconfirmPlayer(ctx: AppContext, admin: AdminIdentity, playerId: string) {
  await mutateRoster(
    ctx,
    admin,
    'PLAYER_UNCONFIRMED',
    (roster) => unconfirmParticipant(roster, playerId),
    () => playerId,
  );
}

/** Baja: solo tiene sentido antes de que el jugador forme parte del calendario. */
/**
 * Borra a un participante.
 *
 * Solo si no ha llegado a existir competitivamente. El estado del torneo ya lo
 * impide mientras haya calendario — desaparece en SCHEDULED—
 * pero eso es una regla de estado y esto es una regla de integridad: si esta
 * persona aparece en algun partido, borrarla dejaria huecos en el historial y
 * en la auditoria que despues nadie podria explicar.
 *
 * Para sacar a alguien de la competicion esta la retirada, que conserva todo.
 */
export async function deletePlayer(ctx: AppContext, admin: AdminIdentity, playerId: string) {
  const appearances = await ctx.db.query.matches.findFirst({
    where: or(eq(schema.matches.homePlayerId, playerId), eq(schema.matches.awayPlayerId, playerId)),
    columns: { id: true },
  });
  if (appearances !== undefined) {
    throw conflict(
      'PLAYER_HAS_MATCHES',
      'Este participante ya figura en el calendario: borrarlo dejaria huecos en el historial. Usa la retirada, que conserva lo jugado.',
      { playerId },
    );
  }

  await mutateRoster(
    ctx,
    admin,
    'PLAYER_DELETED',
    (roster) => removeParticipant(roster, playerId),
    () => playerId,
  );
}

export async function withdrawPlayer(ctx: AppContext, admin: AdminIdentity, playerId: string) {
  await mutateRoster(
    ctx,
    admin,
    'PLAYER_WITHDRAWN',
    (roster) => withdrawParticipant(roster, playerId),
    () => playerId,
  );
}

/**
 * Sustitucion.
 *
 * Antes de generar el calendario es una operacion de plantilla normal. Con el
 * calendario ya publicado es una operacion aparte (`REPLACE_PLAYER`) que ademas
 * traslada los partidos del saliente al entrante, y solo se permite si el
 * saliente todavia no ha jugado: que ocurre con sus resultados es una regla
 * pendiente (P-09), y no se inventa.
 */
export async function replacePlayer(
  ctx: AppContext,
  admin: AdminIdentity,
  outgoingId: string,
  incoming: {
    displayName: string;
    clashTag?: string | null | undefined;
    notes?: string | null | undefined;
  },
) {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const fixtureExists = tournament.fixtureGeneratedAt !== null;

  if (fixtureExists) {
    if (!can(tournament.status, 'REPLACE_PLAYER')) {
      throw forbidden(
        `Con el torneo en ${tournament.status} no se pueden sustituir participantes.`,
      );
    }
  } else {
    assertCan(tournament.status, 'MANAGE_ROSTER');
  }

  const incomingId = newId();

  return ctx.db.transaction(async (tx) => {
    const { roster: before } = await loadRosterAsDomain(tx, tournament.id);
    requireParticipant(before, outgoingId);

    if (fixtureExists) {
      const completed = await tx
        .select({ id: schema.matches.id })
        .from(schema.matches)
        .where(
          and(
            eq(schema.matches.tournamentId, tournament.id),
            eq(schema.matches.status, 'COMPLETED'),
            or(
              eq(schema.matches.homePlayerId, outgoingId),
              eq(schema.matches.awayPlayerId, outgoingId),
            ),
          ),
        );
      if (completed.length > 0) {
        throw pendingRule(
          'que ocurre con los resultados ya jugados de un participante sustituido',
          'docs/pending-rules.md (P-09)',
        );
      }
    }

    const after = replaceParticipant(
      before,
      outgoingId,
      {
        id: incomingId,
        displayName: incoming.displayName,
        ...(incoming.clashTag === undefined ? {} : { clashTag: incoming.clashTag }),
        ...(incoming.notes === undefined ? {} : { notes: incoming.notes }),
      },
      settings,
    );

    await persistRosterDiff(tx, tournament.id, diffRoster(before, after));

    let movedMatches = 0;
    if (fixtureExists) {
      const home = await tx
        .update(schema.matches)
        .set({ homePlayerId: incomingId, updatedAt: new Date() })
        .where(
          and(
            eq(schema.matches.tournamentId, tournament.id),
            eq(schema.matches.homePlayerId, outgoingId),
          ),
        )
        .returning({ id: schema.matches.id });
      const away = await tx
        .update(schema.matches)
        .set({ awayPlayerId: incomingId, updatedAt: new Date() })
        .where(
          and(
            eq(schema.matches.tournamentId, tournament.id),
            eq(schema.matches.awayPlayerId, outgoingId),
          ),
        )
        .returning({ id: schema.matches.id });
      movedMatches = home.length + away.length;
    }

    await writeAudit(tx, {
      tournamentId: tournament.id,
      actorAdminId: admin.id,
      requestId: admin.requestId,
      action: 'PLAYER_REPLACED',
      entityType: 'player',
      entityId: outgoingId,
      payload: {
        outgoingId,
        incomingId,
        incomingName: incoming.displayName,
        movedMatches,
        fixtureExisted: fixtureExists,
      },
    });

    return { incomingId, movedMatches };
  });
}

export function assertPlayerExists(roster: Roster, playerId: string): void {
  const found = roster.some((participant) => participant.id === playerId);
  if (!found) {
    throw new DomainError('PLAYER_NOT_FOUND', `No existe el participante ${playerId}.`, {
      playerId,
    });
  }
}
