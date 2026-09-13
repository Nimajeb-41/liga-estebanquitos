/**
 * Operacion de jornada.
 *
 * Una liga real no se programa partido a partido: se acuerda que la jornada 4
 * se juega el sabado a las 20:00, uno cada media hora. Esto existe para no
 * repetir doce veces el mismo formulario.
 *
 * Dos decisiones que no son obvias:
 *
 * - Solo se tocan los partidos en `SCHEDULED`. Un aplazado tiene su propio
 *   procedimiento, un cancelado no se juega y uno terminado ya tiene fecha
 *   real. Programar en bloque nunca debe reabrir nada.
 * - Por defecto **no** se pisa una fecha ya puesta. Si alguien acordo un
 *   horario distinto con dos jugadores, una programacion masiva no es motivo
 *   para deshacerlo sin decirlo: hay que pedirlo expresamente.
 */

import { schema } from '@liga/database';
import { asc, eq } from 'drizzle-orm';

import { writeAudit } from '../data/audit.ts';
import type { AdminIdentity, AppContext } from '../data/context.ts';
import { requireTournament } from '../data/tournament.ts';
import { badRequest, conflict, notFound } from '../errors.ts';

export interface RoundScheduleRequest {
  /** Hora del primer partido de la jornada, en ISO. */
  readonly startAt: string;
  /** Minutos entre un partido y el siguiente. `0` los pone todos a la vez. */
  readonly intervalMinutes: number;
  /** Si tambien se reescriben los que ya tenian fecha. */
  readonly overwrite: boolean;
}

export interface RoundScheduleResult {
  readonly roundNumber: number;
  readonly scheduled: number;
  readonly skipped: number;
  readonly matches: readonly { readonly id: string; readonly scheduledAt: string }[];
}

export async function scheduleRound(
  ctx: AppContext,
  admin: AdminIdentity,
  roundNumber: number,
  request: RoundScheduleRequest,
): Promise<RoundScheduleResult> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);

  if (Number.isNaN(Date.parse(request.startAt))) {
    throw badRequest('INVALID_DATE', `La fecha "${request.startAt}" no es valida.`);
  }
  if (!Number.isInteger(request.intervalMinutes) || request.intervalMinutes < 0) {
    throw badRequest('INVALID_INTERVAL', 'El intervalo entre partidos son minutos enteros.');
  }

  const round = await ctx.db.query.rounds.findFirst({
    where: (rounds, { and, eq: equals }) =>
      and(equals(rounds.tournamentId, tournament.id), equals(rounds.number, roundNumber)),
    columns: { id: true, number: true },
  });
  if (round === undefined) {
    throw notFound(`No existe la jornada ${roundNumber}.`, { roundNumber });
  }

  const matches = await ctx.db.query.matches.findMany({
    where: eq(schema.matches.roundId, round.id),
    columns: {
      id: true,
      orderInRound: true,
      status: true,
      scheduledAt: true,
      originalScheduledAt: true,
    },
    orderBy: [asc(schema.matches.orderInRound)],
  });

  const targets = matches.filter(
    (match) => match.status === 'SCHEDULED' && (request.overwrite || match.scheduledAt === null),
  );
  if (targets.length === 0) {
    throw conflict(
      'NOTHING_TO_SCHEDULE',
      request.overwrite
        ? `La jornada ${roundNumber} no tiene partidos programados que fechar.`
        : `Todos los partidos programados de la jornada ${roundNumber} ya tienen fecha. Marca «reescribir» si de verdad quieres cambiarlas.`,
      { roundNumber },
    );
  }

  const start = new Date(request.startAt);
  const now = new Date();
  const assigned: { id: string; scheduledAt: string }[] = [];

  for (const [index, match] of targets.entries()) {
    const date = new Date(start.getTime() + index * request.intervalMinutes * 60_000);
    await ctx.db
      .update(schema.matches)
      .set({
        scheduledAt: date,
        // La fecha original es la primera que tuvo: solo se pone si faltaba.
        originalScheduledAt: match.originalScheduledAt ?? date,
        updatedAt: now,
      })
      .where(eq(schema.matches.id, match.id));
    assigned.push({ id: match.id, scheduledAt: date.toISOString() });
  }

  await writeAudit(ctx.db, {
    tournamentId: tournament.id,
    actorAdminId: admin.id,
    requestId: admin.requestId,
    action: 'ROUND_SCHEDULED',
    entityType: 'round',
    entityId: round.id,
    payload: {
      roundNumber,
      startAt: start.toISOString(),
      intervalMinutes: request.intervalMinutes,
      overwrite: request.overwrite,
      scheduled: assigned.length,
      skipped: matches.length - assigned.length,
    },
  });

  return {
    roundNumber,
    scheduled: assigned.length,
    skipped: matches.length - assigned.length,
    matches: assigned,
  };
}

/* -------------------------------------------------------------------------- */
/* Programar la temporada entera                                               */
/* -------------------------------------------------------------------------- */

export interface SeasonScheduleRequest {
  /** Hora del primer partido de la primera sesion. */
  readonly startAt: string;
  /** Cuantas jornadas se juegan en cada sesion. Esta liga: 3 por sabado. */
  readonly roundsPerSession: number;
  /** Dias entre una sesion y la siguiente. 7 = todos los sabados. */
  readonly daysBetweenSessions: number;
  /** Minutos entre partidos dentro de una jornada. */
  readonly intervalMinutes: number;
  /** Descanso entre el ultimo partido de una jornada y el primero de la siguiente. */
  readonly roundGapMinutes: number;
  readonly overwrite: boolean;
}

export interface SeasonScheduleSession {
  readonly date: string;
  readonly rounds: readonly number[];
  readonly matches: number;
}

export interface SeasonScheduleResult {
  readonly sessions: readonly SeasonScheduleSession[];
  readonly scheduled: number;
  readonly skipped: number;
  /** Cuando terminaria el ultimo partido programado. Util para fijar el fin previsto. */
  readonly lastMatchAt: string | null;
}

/**
 * Programa toda la temporada en sesiones.
 *
 * El caso de esta liga: **tres jornadas cada sabado**. Dieciocho jornadas salen
 * en seis sabados, quince partidos por dia.
 *
 * Se apoya en las mismas reglas que programar una jornada suelta —solo toca
 * partidos en `SCHEDULED` y no pisa fechas puestas salvo que se lo pidan—,
 * porque un calendario acordado a mano no se borra por programar en bloque.
 *
 * Lo que **no** hace es decidir cuando empieza la liga. Esa fecha la pone quien
 * la organiza, porque depende de diez personas y de sus sabados.
 */
export async function scheduleSeason(
  ctx: AppContext,
  admin: AdminIdentity,
  request: SeasonScheduleRequest,
): Promise<SeasonScheduleResult> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);

  if (Number.isNaN(Date.parse(request.startAt))) {
    throw badRequest('INVALID_DATE', `La fecha "${request.startAt}" no es valida.`);
  }

  const rounds = await ctx.db.query.rounds.findMany({
    where: eq(schema.rounds.tournamentId, tournament.id),
    columns: { id: true, number: true },
    orderBy: [asc(schema.rounds.number)],
  });
  if (rounds.length === 0) {
    throw conflict(
      'FIXTURE_NOT_GENERATED',
      'Todavia no hay calendario que programar: genera primero el sorteo.',
    );
  }

  const start = new Date(request.startAt);
  const sessions: SeasonScheduleSession[] = [];
  let scheduled = 0;
  let skipped = 0;
  let lastMatchAt: Date | null = null;

  for (let index = 0; index < rounds.length; index += request.roundsPerSession) {
    const session = rounds.slice(index, index + request.roundsPerSession);
    const sessionNumber = Math.floor(index / request.roundsPerSession);
    const sessionStart = new Date(
      start.getTime() + sessionNumber * request.daysBetweenSessions * 24 * 60 * 60 * 1000,
    );

    /*
      Dentro de una sesion las jornadas van seguidas: la siguiente empieza
      cuando termina la anterior, mas el descanso. Se calcula sobre lo que se
      **iba a** programar, no sobre lo programado, para que saltarse una
      jornada ya fechada no descoloque las que vienen detras.
    */
    let cursor = sessionStart;
    const numbers: number[] = [];
    let sessionMatches = 0;

    for (const round of session) {
      const outcome = await scheduleRound(ctx, admin, round.number, {
        startAt: cursor.toISOString(),
        intervalMinutes: request.intervalMinutes,
        overwrite: request.overwrite,
      }).catch((error: unknown) => {
        // `NOTHING_TO_SCHEDULE` es un caso normal aqui: esa jornada ya tenia
        // fecha y no se pidio reescribir. El resto si es un problema.
        if (error instanceof Object && 'code' in error && error.code === 'NOTHING_TO_SCHEDULE') {
          return null;
        }
        throw error;
      });

      const size = await ctx.db.$count(schema.matches, eq(schema.matches.roundId, round.id));
      const span = Math.max(size - 1, 0) * request.intervalMinutes;

      if (outcome !== null) {
        scheduled += outcome.scheduled;
        skipped += outcome.skipped;
        sessionMatches += outcome.scheduled;
        const ends = new Date(cursor.getTime() + span * 60_000);
        if (lastMatchAt === null || ends > lastMatchAt) lastMatchAt = ends;
      } else {
        skipped += size;
      }

      numbers.push(round.number);
      cursor = new Date(cursor.getTime() + (span + request.roundGapMinutes) * 60_000);
    }

    sessions.push({
      date: sessionStart.toISOString(),
      rounds: numbers,
      matches: sessionMatches,
    });
  }

  await writeAudit(ctx.db, {
    tournamentId: tournament.id,
    actorAdminId: admin.id,
    requestId: admin.requestId,
    action: 'SEASON_SCHEDULED',
    entityType: 'tournament',
    entityId: tournament.id,
    payload: {
      startAt: start.toISOString(),
      roundsPerSession: request.roundsPerSession,
      daysBetweenSessions: request.daysBetweenSessions,
      intervalMinutes: request.intervalMinutes,
      roundGapMinutes: request.roundGapMinutes,
      overwrite: request.overwrite,
      sessions: sessions.length,
      scheduled,
      skipped,
    },
  });

  return {
    sessions,
    scheduled,
    skipped,
    lastMatchAt: lastMatchAt === null ? null : lastMatchAt.toISOString(),
  };
}
