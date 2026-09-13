/**
 * Servicio de partidos: directo, aplazamiento, reprogramacion, reportes,
 * validacion y correccion de resultados.
 *
 * Ninguna de estas operaciones sobrescribe la historia: aplazar deja entrada de
 * historial, corregir deja revision, y todo pasa por `audit_log`.
 */

import type { AdminMatchDetail, MatchDetail } from '@liga/contracts';
import { schema } from '@liga/database';
import {
  acceptsResult,
  allowedMatchTransitions,
  assertCan,
  assertMatchTransition,
  addReport,
  postponeMatch,
  reconcileReports,
  rescheduleMatch,
  resolveResult,
  type MatchResolution,
  type MatchSchedule,
  type PostponementReason,
} from '@liga/domain';
import { eq } from 'drizzle-orm';

import { writeAudit } from '../data/audit.ts';
import type { AdminIdentity, AppContext } from '../data/context.ts';
import {
  insertPostponement,
  listPostponements,
  listReports,
  listRevisions,
  requireMatch,
  setMatchStatus,
  toDomainReport,
  upsertReport,
  type MatchWithContext,
} from '../data/matches.ts';
import { requireTournament } from '../data/tournament.ts';
import { badRequest, conflict } from '../errors.ts';
import { serializeMatch } from './serializers.ts';

/*
  Aviso de que algo paso, para quien quiera reaccionar.

  Se emite **despues** de que la escritura haya terminado, nunca dentro de la
  transaccion: un evento anunciando algo que luego se revierte seria peor que no
  anunciar nada.
*/
function announce(
  ctx: AppContext,
  event: Parameters<NonNullable<AppContext['events']>['emit']>[0],
) {
  ctx.events?.emit(event);
}

function toSchedule(row: MatchWithContext): MatchSchedule {
  return {
    roundNumber: row.round.number,
    status: row.match.status,
    scheduledAt: row.match.scheduledAt === null ? null : row.match.scheduledAt.toISOString(),
    originalScheduledAt:
      row.match.originalScheduledAt === null ? null : row.match.originalScheduledAt.toISOString(),
    postponementCount: row.match.postponementCount,
  };
}

/**
 * Ficha completa de un partido, para administracion.
 *
 * Incluye el texto libre de los aplazamientos, los reportes de los jugadores
 * con su evidencia y el motivo de cada correccion.
 */
export async function getAdminMatchDetail(
  ctx: AppContext,
  matchId: string,
): Promise<AdminMatchDetail> {
  const { settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const row = await requireMatch(ctx.db, matchId);
  const [postponements, reports, revisions] = await Promise.all([
    listPostponements(ctx.db, matchId),
    listReports(ctx.db, matchId),
    listRevisions(ctx.db, matchId),
  ]);

  return {
    ...serializeMatch(row, settings),
    actions: {
      allowedTransitions: [...allowedMatchTransitions(row.match.status)],
      acceptsResult: acceptsResult(row.match.status),
      canCorrectResult: row.result !== null,
      canReschedule: row.match.status === 'POSTPONED',
      canCancel: allowedMatchTransitions(row.match.status).includes('CANCELLED'),
      /** Los enlaces se editan siempre: el VOD llega despues del partido. */
      canEditStream: true,
      /*
        Incomparecencia: solo si hay hora prevista, ya paso la tolerancia y no
        hay resultado. El panel no deduce nada de esto; lo pregunta.
      */
      walkover: (() => {
        const scheduledAt = row.match.scheduledAt;
        const playable = row.match.status !== 'POSTPONED' && row.match.status !== 'CANCELLED';
        if (!playable || row.result !== null || scheduledAt === null) {
          return {
            canDeclare: false,
            canDeclareFrom: null,
            toleranceMinutes: settings.noShow.toleranceMinutes,
          };
        }
        const from = new Date(scheduledAt.getTime() + settings.noShow.toleranceMinutes * 60_000);
        return {
          canDeclare: ctx.now() >= from,
          canDeclareFrom: from.toISOString(),
          toleranceMinutes: settings.noShow.toleranceMinutes,
        };
      })(),
    },
    history: {
      postponements: postponements.map((entry) => ({
        event: entry.event,
        roundNumber: entry.roundNumber,
        previousScheduledAt:
          entry.previousScheduledAt === null ? null : entry.previousScheduledAt.toISOString(),
        newScheduledAt: entry.newScheduledAt === null ? null : entry.newScheduledAt.toISOString(),
        reason: entry.reason,
        notes: entry.notes,
        occurredAt: entry.occurredAt.toISOString(),
      })),
      reports: reports.map((report) => ({
        playerId: report.playerId,
        homeCrowns: report.homeCrowns,
        awayCrowns: report.awayCrowns,
        evidenceUrl: report.evidenceUrl,
        reportedAt: report.reportedAt.toISOString(),
      })),
      revisions: revisions.map((revision) => ({
        revision: revision.revision,
        previousValue: revision.previousValue,
        newValue: revision.newValue,
        reason: revision.reason,
        changedAt: revision.changedAt.toISOString(),
      })),
    },
  };
}

/**
 * Ficha publica.
 *
 * Se construye a partir de la administrativa quitando lo que no es de nadie
 * mas: las notas del aplazamiento, quien reporto que, y el texto que justifica
 * una correccion (P-10 todavia no decide si eso se publica). De los reportes
 * solo sale el recuento, y de las correcciones, que existieron y cuando.
 */
export async function getMatchDetail(ctx: AppContext, matchId: string): Promise<MatchDetail> {
  const { actions: _actions, ...full } = await getAdminMatchDetail(ctx, matchId);

  return {
    ...full,
    history: {
      postponements: full.history.postponements.map(({ notes: _notes, ...entry }) => entry),
      corrections: full.history.revisions.map((revision) => ({
        revision: revision.revision,
        changedAt: revision.changedAt,
      })),
      reportCount: full.history.reports.length,
    },
  };
}

export async function setMatchLive(
  ctx: AppContext,
  admin: AdminIdentity,
  matchId: string,
  streamUrl: string | null,
) {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  assertCan(tournament.status, 'RECORD_RESULTS');

  const row = await requireMatch(ctx.db, matchId);
  assertMatchTransition(row.match.status, 'LIVE');

  await setMatchStatus(ctx.db, matchId, 'LIVE', streamUrl === null ? {} : { streamUrl });
  await writeAudit(ctx.db, {
    tournamentId: tournament.id,
    actorAdminId: admin.id,
    requestId: admin.requestId,
    action: 'MATCH_SET_LIVE',
    entityType: 'match',
    entityId: matchId,
    payload: { streamUrl },
  });

  announce(ctx, {
    type: 'MATCH_STATUS_CHANGED',
    at: ctx.now().toISOString(),
    tournamentId: tournament.id,
    matchId,
    status: 'LIVE',
  });
}

/**
 * Cancela un partido.
 *
 * La unica operacion del calendario sin vuelta atras: de CANCELLED no se sale,
 * y el dominio lo dice explicitamente (sus transiciones son la lista vacia).
 * Existe porque una liga real la necesita —alguien se retira a mitad de
 * temporada y sus partidos restantes no se van a jugar—, y porque la
 * alternativa que se usaria si no existiera es peor: dejarlos aplazados para
 * siempre, contaminando cada pantalla que cuenta partidos pendientes.
 *
 * Un partido cancelado no cuenta para nadie: ni victoria, ni derrota, ni
 * partido jugado. Que eso sea lo correcto —frente a dar los puntos al rival—
 * depende de P-05 y P-06, que siguen abiertas; por eso esto solo cancela, y no
 * reparte nada.
 */
export async function cancelMatch(
  ctx: AppContext,
  admin: AdminIdentity,
  matchId: string,
  reason: string,
) {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const row = await requireMatch(ctx.db, matchId);
  assertMatchTransition(row.match.status, 'CANCELLED');

  const previousStatus = row.match.status;
  await setMatchStatus(ctx.db, matchId, 'CANCELLED');
  await writeAudit(ctx.db, {
    tournamentId: tournament.id,
    actorAdminId: admin.id,
    requestId: admin.requestId,
    action: 'MATCH_CANCELLED',
    entityType: 'match',
    entityId: matchId,
    payload: { reason, previousStatus, roundNumber: row.round.number },
  });

  announce(ctx, {
    type: 'MATCH_STATUS_CHANGED',
    at: ctx.now().toISOString(),
    tournamentId: tournament.id,
    matchId,
    status: 'CANCELLED',
  });

  return { id: matchId, status: 'CANCELLED' as const };
}

/**
 * Enlaces de transmision de un partido.
 *
 * Se guarda tal cual llega, ya validado a http/https por el esquema. Es una
 * operacion sobre metadatos: no toca el estado del partido ni el resultado, y
 * puede hacerse en cualquier momento —tipicamente antes (el directo) y despues
 * (el VOD)—.
 */
export async function setMatchStream(
  ctx: AppContext,
  admin: AdminIdentity,
  matchId: string,
  stream: { streamUrl: string | null; vodUrl: string | null; platform: string | null },
) {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  await requireMatch(ctx.db, matchId);

  await ctx.db
    .update(schema.matches)
    .set({
      streamUrl: stream.streamUrl,
      vodUrl: stream.vodUrl,
      streamPlatform: stream.platform,
      updatedAt: new Date(),
    })
    .where(eq(schema.matches.id, matchId));

  await writeAudit(ctx.db, {
    tournamentId: tournament.id,
    actorAdminId: admin.id,
    requestId: admin.requestId,
    action: 'MATCH_STREAM_UPDATED',
    entityType: 'match',
    entityId: matchId,
    payload: stream,
  });

  return { id: matchId, stream };
}

/**
 * Fija la fecha prevista de un partido.
 *
 * La primera fecha que se le asigna queda ademas como `originalScheduledAt` y
 * ya no se toca nunca: es la que permite decir despues "esto era del 1 de
 * octubre".
 */
export async function scheduleMatch(
  ctx: AppContext,
  admin: AdminIdentity,
  matchId: string,
  scheduledAt: string,
) {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const row = await requireMatch(ctx.db, matchId);

  if (Number.isNaN(Date.parse(scheduledAt))) {
    throw badRequest('INVALID_DATE', `La fecha "${scheduledAt}" no es valida.`);
  }
  if (row.match.status !== 'SCHEDULED') {
    throw conflict(
      'MATCH_NOT_SCHEDULED',
      `Solo se fija fecha en un partido programado; este esta en ${row.match.status}. Usa reprogramar.`,
      { status: row.match.status },
    );
  }

  const date = new Date(scheduledAt);
  await ctx.db
    .update(schema.matches)
    .set({
      scheduledAt: date,
      originalScheduledAt: row.match.originalScheduledAt ?? date,
      updatedAt: new Date(),
    })
    .where(eq(schema.matches.id, matchId));

  await writeAudit(ctx.db, {
    tournamentId: tournament.id,
    actorAdminId: admin.id,
    requestId: admin.requestId,
    action: 'MATCH_SCHEDULED',
    entityType: 'match',
    entityId: matchId,
    payload: { scheduledAt, roundNumber: row.round.number },
  });

  // `at` es cuando paso el evento, no la fecha que se acaba de poner.
  announce(ctx, {
    type: 'MATCH_SCHEDULED',
    at: ctx.now().toISOString(),
    tournamentId: tournament.id,
    matchId,
  });

  return { scheduledAt: date };
}

export interface PostponeRequest {
  readonly reason: PostponementReason;
  readonly notes: string;
  readonly proposedAt?: string | null | undefined;
}

export async function postpone(
  ctx: AppContext,
  admin: AdminIdentity,
  matchId: string,
  request: PostponeRequest,
) {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const row = await requireMatch(ctx.db, matchId);

  const change = postponeMatch(toSchedule(row), {
    reason: request.reason,
    notes: request.notes,
    adminId: admin.id,
    occurredAt: ctx.now().toISOString(),
    ...(request.proposedAt === undefined ? {} : { proposedAt: request.proposedAt }),
  });

  return ctx.db.transaction(async (tx) => {
    await tx
      .update(schema.matches)
      .set({
        status: 'POSTPONED',
        scheduledAt:
          change.schedule.scheduledAt === null ? null : new Date(change.schedule.scheduledAt),
        // La fecha original se fija la primera vez y no se toca nunca mas.
        originalScheduledAt: row.match.originalScheduledAt ?? row.match.scheduledAt ?? null,
        postponementCount: change.schedule.postponementCount,
        updatedAt: new Date(),
      })
      .where(eq(schema.matches.id, matchId));

    await insertPostponement(tx, matchId, change.entry);

    await writeAudit(tx, {
      tournamentId: tournament.id,
      actorAdminId: admin.id,
      requestId: admin.requestId,
      action: 'MATCH_POSTPONED',
      entityType: 'match',
      entityId: matchId,
      payload: {
        roundNumber: change.entry.roundNumber,
        reason: change.entry.reason,
        notes: change.entry.notes,
        previousScheduledAt: change.entry.previousScheduledAt,
        proposedAt: change.entry.newScheduledAt,
      },
    });

    return change.schedule;
  });
}

export async function reschedule(
  ctx: AppContext,
  admin: AdminIdentity,
  matchId: string,
  request: { newScheduledAt: string; notes: string; reason?: PostponementReason | undefined },
) {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const row = await requireMatch(ctx.db, matchId);

  const change = rescheduleMatch(toSchedule(row), {
    newScheduledAt: request.newScheduledAt,
    notes: request.notes,
    adminId: admin.id,
    occurredAt: ctx.now().toISOString(),
    ...(request.reason === undefined ? {} : { reason: request.reason }),
  });

  return ctx.db.transaction(async (tx) => {
    await tx
      .update(schema.matches)
      .set({
        status: 'SCHEDULED',
        scheduledAt: new Date(request.newScheduledAt),
        updatedAt: new Date(),
      })
      .where(eq(schema.matches.id, matchId));

    await insertPostponement(tx, matchId, change.entry);

    await writeAudit(tx, {
      tournamentId: tournament.id,
      actorAdminId: admin.id,
      requestId: admin.requestId,
      action: 'MATCH_RESCHEDULED',
      entityType: 'match',
      entityId: matchId,
      payload: {
        roundNumber: change.entry.roundNumber,
        newScheduledAt: change.entry.newScheduledAt,
        notes: change.entry.notes,
      },
    });

    return change.schedule;
  });
}

/* -------------------------------------------------------------------------- */
/* Resultados                                                                  */
/* -------------------------------------------------------------------------- */

interface WriteResultInput {
  readonly homeCrowns: number;
  readonly awayCrowns: number;
  readonly resolution: MatchResolution;
  /** Quien falto. Solo en las incomparecencias; sin esto no se reconstruyen. */
  readonly absentPlayerId?: string | null;
  readonly reason: string;
  readonly evidenceUrl?: string | null;
  readonly notes?: string | null;
}

/**
 * Escribe el resultado y su revision. Nunca sobrescribe en silencio: si ya
 * habia resultado, el valor anterior queda guardado en la revision.
 */
async function writeResult(
  ctx: AppContext,
  admin: AdminIdentity,
  row: MatchWithContext,
  tournamentId: string,
  input: WriteResultInput,
  action: 'MATCH_RESULT_APPROVED' | 'MATCH_RESULT_CORRECTED' | 'WALKOVER_DECLARED',
  /** Datos propios de la accion, que se anaden a la carga de auditoria. */
  extraPayload: Record<string, unknown> = {},
) {
  const previous = row.result;
  const now = ctx.now();

  const written = await ctx.db.transaction(async (tx) => {
    const revisions = await listRevisions(tx, row.match.id);
    const nextRevision = revisions.length + 1;

    if (previous === null) {
      await tx.insert(schema.matchResults).values({
        matchId: row.match.id,
        homeCrowns: input.homeCrowns,
        awayCrowns: input.awayCrowns,
        resolution: input.resolution,
        absentPlayerId: input.absentPlayerId ?? null,
        evidenceUrl: input.evidenceUrl ?? null,
        notes: input.notes ?? null,
        verifiedByAdminId: admin.id,
        verifiedAt: now,
        version: 1,
      });
    } else {
      await tx
        .update(schema.matchResults)
        .set({
          homeCrowns: input.homeCrowns,
          awayCrowns: input.awayCrowns,
          resolution: input.resolution,
          absentPlayerId: input.absentPlayerId ?? null,
          evidenceUrl: input.evidenceUrl ?? previous.evidenceUrl,
          notes: input.notes ?? previous.notes,
          verifiedByAdminId: admin.id,
          verifiedAt: now,
          version: previous.version + 1,
          updatedAt: now,
        })
        .where(eq(schema.matchResults.matchId, row.match.id));
    }

    await tx.insert(schema.matchResultRevisions).values({
      matchId: row.match.id,
      revision: nextRevision,
      previousValue:
        previous === null
          ? null
          : {
              homeCrowns: previous.homeCrowns,
              awayCrowns: previous.awayCrowns,
              resolution: previous.resolution,
              version: previous.version,
            },
      newValue: {
        homeCrowns: input.homeCrowns,
        awayCrowns: input.awayCrowns,
        resolution: input.resolution,
      },
      reason: input.reason,
      changedByAdminId: admin.id,
      changedAt: now,
    });

    await tx
      .update(schema.matches)
      .set({ status: 'COMPLETED', playedAt: row.match.playedAt ?? now, updatedAt: now })
      .where(eq(schema.matches.id, row.match.id));

    await writeAudit(tx, {
      tournamentId,
      actorAdminId: admin.id,
      requestId: admin.requestId,
      action,
      entityType: 'match',
      entityId: row.match.id,
      payload: {
        previous:
          previous === null
            ? null
            : { homeCrowns: previous.homeCrowns, awayCrowns: previous.awayCrowns },
        next: { homeCrowns: input.homeCrowns, awayCrowns: input.awayCrowns },
        reason: input.reason,
        revision: nextRevision,
        ...extraPayload,
      },
    });

    return { revision: nextRevision };
  });

  /*
    Fuera de la transaccion: si se anunciara dentro y la transaccion fallara,
    habriamos avisado de un resultado que no existe.
  */
  announce(ctx, {
    type: 'MATCH_RESULT_RECORDED',
    at: now.toISOString(),
    tournamentId,
    matchId: row.match.id,
    correction: previous !== null,
  });

  return written;
}

/** Registra directamente el resultado oficial (via administrador). */
export async function recordResult(
  ctx: AppContext,
  admin: AdminIdentity,
  matchId: string,
  input: {
    homeCrowns: number;
    awayCrowns: number;
    resolution?: MatchResolution | undefined;
    evidenceUrl?: string | null | undefined;
    notes?: string | null | undefined;
  },
) {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  assertCan(tournament.status, 'RECORD_RESULTS');

  const row = await requireMatch(ctx.db, matchId);
  if (row.match.status === 'POSTPONED' || row.match.status === 'CANCELLED') {
    throw conflict(
      'MATCH_NOT_PLAYABLE',
      `No se puede registrar el resultado de un partido en estado ${row.match.status}.`,
      { status: row.match.status },
    );
  }

  const resolution = input.resolution ?? 'PLAYED';
  // Valida coronas, empates y walkovers pendientes antes de tocar la base.
  resolveResult(
    { homeId: row.match.homePlayerId, awayId: row.match.awayPlayerId },
    { homeCrowns: input.homeCrowns, awayCrowns: input.awayCrowns, resolution },
    settings,
  );

  return writeResult(
    ctx,
    admin,
    row,
    tournament.id,
    {
      homeCrowns: input.homeCrowns,
      awayCrowns: input.awayCrowns,
      resolution,
      reason: 'Resultado registrado por la administracion',
      ...(input.evidenceUrl === undefined ? {} : { evidenceUrl: input.evidenceUrl }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    },
    'MATCH_RESULT_APPROVED',
  );
}

/**
 * Declara una incomparecencia (regla P-01).
 *
 * Es una operacion aparte de `recordResult` porque tiene condiciones propias:
 * hace falta que haya pasado la tolerancia, hace falta decir **quien** no
 * aparecio, y hace falta un motivo por escrito. Pero el resultado lo construye
 * el **mismo** motor de siempre, `resolveResult`, y lo escribe la misma
 * funcion: no hay una segunda forma de puntuar en el sistema.
 *
 * La tolerancia no la aplica un temporizador. Pasados los quince minutos el
 * administrador **puede** declararla; no se declara sola. Un reloj no distingue
 * «no se presento» de «la plataforma tenia mal la hora», y esa diferencia
 * decide una jornada.
 */
export async function declareWalkover(
  ctx: AppContext,
  admin: AdminIdentity,
  matchId: string,
  input: { absentPlayerId: string; reason: string },
) {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  assertCan(tournament.status, 'RECORD_RESULTS');

  const row = await requireMatch(ctx.db, matchId);
  if (row.match.status === 'POSTPONED' || row.match.status === 'CANCELLED') {
    throw conflict(
      'MATCH_NOT_PLAYABLE',
      `No se puede declarar incomparecencia en un partido en estado ${row.match.status}.`,
      { status: row.match.status },
    );
  }
  if (row.result !== null) {
    throw conflict(
      'RESULT_ALREADY_RECORDED',
      'Este partido ya tiene resultado. Para cambiarlo hay que corregirlo, y eso deja revision.',
    );
  }

  /*
    La tolerancia se cuenta desde la hora prevista. Sin hora prevista no hay
    nada desde donde contar: declarar una incomparecencia de un partido que
    nunca tuvo hora seria declararla sobre una suposicion.
  */
  const scheduledAt = row.match.scheduledAt;
  if (scheduledAt === null) {
    throw conflict(
      'MATCH_NOT_SCHEDULED',
      'Este partido no tiene hora prevista: no hay desde cuando contar la tolerancia.',
    );
  }

  const toleranceMs = settings.noShow.toleranceMinutes * 60_000;
  const deadline = new Date(scheduledAt.getTime() + toleranceMs);
  const now = ctx.now();
  if (now < deadline) {
    throw conflict(
      'TOLERANCE_NOT_ELAPSED',
      `Todavia no han pasado los ${settings.noShow.toleranceMinutes} minutos de tolerancia.`,
      {
        toleranceMinutes: settings.noShow.toleranceMinutes,
        scheduledAt: scheduledAt.toISOString(),
        canDeclareFrom: deadline.toISOString(),
      },
    );
  }

  // El motor decide quien gana, con cuantas coronas (ninguna) y cuantos puntos.
  // Si la regla estuviera sin definir, falla aqui con PENDING_RULE.
  const result = resolveResult(
    { homeId: row.match.homePlayerId, awayId: row.match.awayPlayerId },
    {
      homeCrowns: 0,
      awayCrowns: 0,
      resolution: 'WALKOVER',
      absentPlayerId: input.absentPlayerId,
    },
    settings,
  );

  return writeResult(
    ctx,
    admin,
    row,
    tournament.id,
    {
      homeCrowns: result.homeCrowns,
      awayCrowns: result.awayCrowns,
      resolution: 'WALKOVER',
      absentPlayerId: input.absentPlayerId,
      reason: input.reason,
    },
    'WALKOVER_DECLARED',
    {
      absentPlayerId: input.absentPlayerId,
      winnerId: result.winnerId,
      scheduledAt: scheduledAt.toISOString(),
      toleranceMinutes: settings.noShow.toleranceMinutes,
      declaredAt: now.toISOString(),
    },
  );
}

/** Correccion de un resultado ya registrado. Exige motivo. */
export async function correctResult(
  ctx: AppContext,
  admin: AdminIdentity,
  matchId: string,
  input: { homeCrowns: number; awayCrowns: number; reason: string },
) {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  assertCan(tournament.status, 'RECORD_RESULTS');

  const row = await requireMatch(ctx.db, matchId);
  if (row.result === null) {
    throw badRequest(
      'NO_RESULT_TO_CORRECT',
      'Este partido no tiene resultado que corregir; registralo primero.',
    );
  }
  if (input.reason.trim().length === 0) {
    throw badRequest('REASON_REQUIRED', 'Toda correccion necesita un motivo.');
  }

  resolveResult(
    { homeId: row.match.homePlayerId, awayId: row.match.awayPlayerId },
    {
      homeCrowns: input.homeCrowns,
      awayCrowns: input.awayCrowns,
      resolution: row.result.resolution,
    },
    settings,
  );

  return writeResult(
    ctx,
    admin,
    row,
    tournament.id,
    {
      homeCrowns: input.homeCrowns,
      awayCrowns: input.awayCrowns,
      resolution: row.result.resolution,
      reason: input.reason.trim(),
    },
    'MATCH_RESULT_CORRECTED',
  );
}

/**
 * Registra el reporte de uno de los dos jugadores y concilia.
 *
 * Si ambos coinciden, el resultado queda validado y el partido pasa a
 * COMPLETED. Si se contradicen, el partido pasa a DISPUTED y lo resuelve un
 * administrador. En Fase 1 el reporte lo introduce un administrador o arbitro
 * indicando de que jugador es; el auto-servicio para jugadores necesita cuentas
 * de jugador y llega en la Fase 2 (ver docs/api.md).
 */
export async function reportResult(
  ctx: AppContext,
  admin: AdminIdentity,
  matchId: string,
  input: {
    playerId: string;
    homeCrowns: number;
    awayCrowns: number;
    evidenceUrl?: string | null | undefined;
  },
) {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  assertCan(tournament.status, 'RECORD_RESULTS');

  const row = await requireMatch(ctx.db, matchId);
  const pairing = { homeId: row.match.homePlayerId, awayId: row.match.awayPlayerId };

  const existing = (await listReports(ctx.db, matchId)).map(toDomainReport);
  const reports = addReport(
    existing,
    {
      playerId: input.playerId,
      homeCrowns: input.homeCrowns,
      awayCrowns: input.awayCrowns,
      reportedAt: ctx.now().toISOString(),
    },
    pairing,
    row.match.status,
    settings,
  );

  const reconciliation = reconcileReports(pairing, reports);

  await ctx.db.transaction(async (tx) => {
    await upsertReport(
      tx,
      matchId,
      {
        playerId: input.playerId,
        homeCrowns: input.homeCrowns,
        awayCrowns: input.awayCrowns,
        reportedAt: ctx.now().toISOString(),
      },
      input.evidenceUrl ?? null,
    );

    await writeAudit(tx, {
      tournamentId: tournament.id,
      actorAdminId: admin.id,
      requestId: admin.requestId,
      action: 'MATCH_RESULT_REPORTED',
      entityType: 'match',
      entityId: matchId,
      payload: {
        playerId: input.playerId,
        homeCrowns: input.homeCrowns,
        awayCrowns: input.awayCrowns,
        outcome: reconciliation.status,
      },
    });

    if (reconciliation.status === 'CONFLICT') {
      assertMatchTransition(row.match.status, 'DISPUTED');
      await setMatchStatus(tx, matchId, 'DISPUTED');
      await writeAudit(tx, {
        tournamentId: tournament.id,
        actorAdminId: admin.id,
        requestId: admin.requestId,
        action: 'MATCH_DISPUTED',
        entityType: 'match',
        entityId: matchId,
        payload: { reports: reports.map((report) => ({ ...report })) },
      });
    }
  });

  if (reconciliation.status === 'AGREED') {
    const fresh = await requireMatch(ctx.db, matchId);
    await writeResult(
      ctx,
      admin,
      fresh,
      tournament.id,
      {
        homeCrowns: reconciliation.homeCrowns as number,
        awayCrowns: reconciliation.awayCrowns as number,
        resolution: 'PLAYED',
        reason: 'Resultado coincidente reportado por ambos jugadores',
        ...(input.evidenceUrl === undefined ? {} : { evidenceUrl: input.evidenceUrl }),
      },
      'MATCH_RESULT_APPROVED',
    );
  }

  return reconciliation;
}
