/** Servicio del torneo: lectura de estado y transiciones. */

import type { MatchStatus, TournamentOverview } from '@liga/contracts';
import {
  allowedTransitions,
  assertRosterReady,
  assertTransition,
  capabilitiesOf,
  describeFormat,
  seasonClosureReport,
  type ClosureReport,
  rosterSummary,
  type TournamentStatus,
} from '@liga/domain';

import { writeAudit } from '../data/audit.ts';
import type { AdminIdentity, AppContext } from '../data/context.ts';
import { listMatches } from '../data/matches.ts';
import { loadRosterAsDomain } from '../data/players.ts';
import { requireTournament, updateTournamentStatus } from '../data/tournament.ts';
import { conflict } from '../errors.ts';
import { createSeasonSnapshot } from './snapshot.ts';

export async function getTournamentOverview(ctx: AppContext): Promise<TournamentOverview> {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const { roster } = await loadRosterAsDomain(ctx.db, tournament.id);
  const summary = rosterSummary(roster, settings);
  const matches = await listMatches(ctx.db, tournament.id);

  const count = (status: MatchStatus): number =>
    matches.filter((row) => row.match.status === status).length;

  const completed = count('COMPLETED');
  const total = matches.length;

  // Jornada en curso: la primera que todavía tiene algo por resolver. Si no
  // queda nada, la competición está terminada y no hay jornada actual.
  const pendingRounds = matches
    .filter((row) => row.match.status !== 'COMPLETED' && row.match.status !== 'CANCELLED')
    .map((row) => row.round.number);
  const currentRound = pendingRounds.length === 0 ? null : Math.min(...pendingRounds);

  return {
    id: tournament.id,
    slug: tournament.slug,
    name: tournament.name,
    season: tournament.season,
    status: tournament.status,
    capabilities: [...capabilitiesOf(tournament.status)],
    allowedTransitions: [...allowedTransitions(tournament.status)],
    format: describeFormat(settings),
    roster: {
      confirmed: summary.confirmed,
      pending: summary.pending,
      registered: summary.registered,
      rosterSize: summary.rosterSize,
      complete: summary.complete,
    },
    fixture: {
      generated: tournament.fixtureGeneratedAt !== null,
      seed: tournament.fixtureSeed,
      generatedAt:
        tournament.fixtureGeneratedAt === null ? null : tournament.fixtureGeneratedAt.toISOString(),
      matches: total,
    },
    progress: {
      completed,
      scheduled: count('SCHEDULED'),
      live: count('LIVE'),
      postponed: count('POSTPONED'),
      disputed: count('DISPUTED'),
      cancelled: count('CANCELLED'),
      total,
      ratio: total === 0 ? 0 : completed / total,
      currentRound,
    },
    rulesVersion: settings.rulesVersion,
    plannedStartAt: tournament.plannedStartAt?.toISOString() ?? null,
    plannedEndAt: tournament.plannedEndAt?.toISOString() ?? null,
    startedAt: tournament.startedAt === null ? null : tournament.startedAt.toISOString(),
    finishedAt: tournament.finishedAt === null ? null : tournament.finishedAt.toISOString(),
  };
}

/**
 * Cambia el estado del torneo.
 *
 * Las transiciones válidas las decide el dominio; aquí solo se añaden las
 * comprobaciones que necesitan datos: para pasar a READY tiene que haber
 * exactamente los confirmados que exige el reglamento.
 */
export async function changeTournamentStatus(
  ctx: AppContext,
  admin: AdminIdentity,
  target: TournamentStatus,
): Promise<{ from: TournamentStatus; to: TournamentStatus }> {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const from = tournament.status;

  assertTransition(from, target);

  if (target === 'READY') {
    const { roster } = await loadRosterAsDomain(ctx.db, tournament.id);
    assertRosterReady(roster, settings);
  }

  /*
    SCHEDULED significa «el calendario oficial existe».

    Sin esa comprobacion el estado mentiria: el panel diria que la temporada
    esta calendarizada y no habria ni un partido. Y el paso siguiente, LIVE,
    dejaria una liga en marcha sin nada que jugar.
  */
  if (target === 'SCHEDULED' && tournament.fixtureGeneratedAt === null) {
    throw conflict(
      'FIXTURE_NOT_GENERATED',
      'Para calendarizar la temporada hace falta generar antes el calendario oficial.',
    );
  }

  /*
    Cerrar la temporada **no** se hace por aqui.

    Es la operacion mas definitiva del sistema —de FINISHED no se sale— y exige
    comprobar que no queda nada sin resolver, dejar constancia de quien la
    cierra y generar la instantanea final. Todo eso vive en su propia
    operacion, `finishSeason`, que ademas puede explicar que falta.
  */
  if (target === 'FINISHED') {
    throw conflict(
      'USE_SEASON_FINALIZATION',
      'Cerrar la temporada es una operacion propia: usa la finalizacion, que comprueba lo que queda pendiente y genera la instantanea final.',
      { endpoint: 'POST /api/v1/admin/tournament/finish' },
    );
  }

  const now = ctx.now();
  await updateTournamentStatus(ctx.db, tournament.id, target, {
    ...(target === 'LIVE' ? { startedAt: now } : {}),
  });

  await writeAudit(ctx.db, {
    tournamentId: tournament.id,
    actorAdminId: admin.id,
    requestId: admin.requestId,
    action: 'TOURNAMENT_STATUS_CHANGED',
    entityType: 'tournament',
    entityId: tournament.id,
    payload: { from, to: target },
  });

  return { from, to: target };
}

/* -------------------------------------------------------------------------- */
/* Cierre de temporada                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Que queda sin resolver antes de poder cerrar.
 *
 * Se consulta sola, sin cerrar nada: el panel la usa para enseñar la lista de
 * lo que falta, con los partidos concretos, antes de que nadie pulse nada.
 */
export async function getClosureReport(ctx: AppContext): Promise<ClosureReport> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const matches = await listMatches(ctx.db, tournament.id);
  return seasonClosureReport(
    matches.map((row) => ({ id: row.match.id, status: row.match.status })),
  );
}

/**
 * Cierra la temporada.
 *
 * La operacion mas definitiva del sistema: de `FINISHED` no se sale, y la
 * clasificacion de ese momento queda como el resultado de la competicion. Por
 * eso no se hace desde el selector de estado y por eso tiene tres condiciones.
 *
 * **Primera: hay que saber que queda pendiente.** Si algun partido sigue sin
 * jugar, en disputa o aplazado, la operacion se niega y devuelve la lista con
 * los identificadores. Quien lleva la liga puede entonces resolverlos, o
 * decidir cerrar igualmente.
 *
 * **Segunda: cerrar con pendientes exige decirlo.** `acknowledgePending` no es
 * una casilla de «sí, sí, adelante»: es la diferencia entre cerrar una
 * temporada terminada y cerrar una temporada a medias, y las dos cosas quedan
 * escritas de forma distinta en la auditoria.
 *
 * **Tercera: hace falta un motivo.** Dentro de seis meses, «por que se cerro
 * con tres partidos sin jugar» tiene que tener respuesta.
 *
 * Lo que esta operacion **no** hace es decidir que pasa con lo que queda. Un
 * partido sin jugar a estas alturas puede ser un abandono (**P-05**), una
 * incomparecencia que nadie declaro (R-09) o un aplazamiento sin fecha
 * (**P-08**). Las tres tienen consecuencias distintas y ninguna esta decidida:
 * los partidos se quedan como estan y no puntuan.
 */
export async function finishSeason(
  ctx: AppContext,
  admin: AdminIdentity,
  input: { reason: string; acknowledgePending?: boolean | undefined },
): Promise<{ status: 'FINISHED'; finishedAt: string; snapshotId: string; report: ClosureReport }> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);

  assertTransition(tournament.status, 'FINISHED');

  const matches = await listMatches(ctx.db, tournament.id);
  const report = seasonClosureReport(
    matches.map((row) => ({ id: row.match.id, status: row.match.status })),
  );

  if (!report.closeable && input.acknowledgePending !== true) {
    throw conflict(
      'SEASON_NOT_CLOSEABLE',
      'La temporada tiene asuntos sin resolver. Resuélvelos, o cierra reconociendo expresamente que quedan pendientes.',
      { report },
    );
  }

  const now = ctx.now();
  const snapshot = await createSeasonSnapshot(ctx, tournament.id, {
    closedBy: admin,
    closedAt: now,
    reason: input.reason,
    report,
  });

  await updateTournamentStatus(ctx.db, tournament.id, 'FINISHED', { finishedAt: now });

  await writeAudit(ctx.db, {
    tournamentId: tournament.id,
    actorAdminId: admin.id,
    requestId: admin.requestId,
    action: 'SEASON_FINISHED',
    entityType: 'tournament',
    entityId: tournament.id,
    payload: {
      from: tournament.status,
      reason: input.reason,
      // Se guarda si se cerró con pendientes y cuáles: es lo que hace la
      // decisión revisable después.
      closedWithPending: !report.closeable,
      blockers: report.blockers,
      snapshotId: snapshot.id,
    },
  });

  ctx.events?.emit({
    type: 'SEASON_FINISHED',
    at: now.toISOString(),
    tournamentId: tournament.id,
  });

  return {
    status: 'FINISHED',
    finishedAt: now.toISOString(),
    snapshotId: snapshot.id,
    report,
  };
}
