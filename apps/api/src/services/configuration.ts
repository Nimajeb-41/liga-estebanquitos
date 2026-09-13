/**
 * Configuración de la temporada.
 *
 * Aquí se cambia lo que un administrador puede cambiar sin tocar código: la
 * identidad de la temporada, sus fechas previstas y el reglamento.
 *
 * La parte delicada es el reglamento. La clasificación **se deriva**: cambiar
 * `scoring.win` no actualiza una tabla, la reescribe entera y hacia atrás. Por
 * eso cada cambio de puntuación:
 *
 * - pasa por el dominio, que dice si está permitido en este estado;
 * - **sube la versión del reglamento**, que viaja en cada respuesta de
 *   clasificación precisamente para poder decir con qué reglas se calculó;
 * - queda en auditoría con el valor anterior y el nuevo.
 *
 * Sin lo segundo, dos tablas calculadas con reglas distintas llevarían la misma
 * etiqueta, y no habría forma de saber cuál se estaba mirando.
 */

import { schema } from '@liga/database';
import {
  assertSettingsChangeAllowed,
  nextRulesVersion,
  validateSettings,
  type ConfigurableSetting,
  type TournamentSettings,
} from '@liga/domain';
import { eq } from 'drizzle-orm';

import { writeAudit } from '../data/audit.ts';
import type { AdminIdentity, AppContext } from '../data/context.ts';
import { requireTournament, toDomainSettings } from '../data/tournament.ts';
import { badRequest } from '../errors.ts';

/* -------------------------------------------------------------------------- */
/* Identidad y fechas                                                          */
/* -------------------------------------------------------------------------- */

export interface SeasonIdentityInput {
  readonly name?: string | undefined;
  readonly season?: string | undefined;
  readonly plannedStartAt?: string | null | undefined;
  readonly plannedEndAt?: string | null | undefined;
}

export async function updateSeasonIdentity(
  ctx: AppContext,
  admin: AdminIdentity,
  input: SeasonIdentityInput,
) {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);

  const toDate = (value: string | null | undefined): Date | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw badRequest('INVALID_DATE', `Fecha inválida: ${value}.`);
    return date;
  };

  const plannedStartAt = toDate(input.plannedStartAt);
  const plannedEndAt = toDate(input.plannedEndAt);

  // Una temporada que termina antes de empezar es un error de tecleo, no una
  // decisión: se rechaza en vez de guardarse y confundir a todo el que la lea.
  const start = plannedStartAt === undefined ? tournament.plannedStartAt : plannedStartAt;
  const end = plannedEndAt === undefined ? tournament.plannedEndAt : plannedEndAt;
  if (start !== null && end !== null && start !== undefined && end !== undefined && end < start) {
    throw badRequest('INVALID_DATE_RANGE', 'La fecha prevista de fin es anterior a la de inicio.', {
      plannedStartAt: start.toISOString(),
      plannedEndAt: end.toISOString(),
    });
  }

  const before = {
    name: tournament.name,
    season: tournament.season,
    plannedStartAt: tournament.plannedStartAt?.toISOString() ?? null,
    plannedEndAt: tournament.plannedEndAt?.toISOString() ?? null,
  };

  await ctx.db
    .update(schema.tournaments)
    .set({
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.season === undefined ? {} : { season: input.season }),
      ...(plannedStartAt === undefined ? {} : { plannedStartAt }),
      ...(plannedEndAt === undefined ? {} : { plannedEndAt }),
      updatedAt: ctx.now(),
    })
    .where(eq(schema.tournaments.id, tournament.id));

  const { tournament: updated } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const after = {
    name: updated.name,
    season: updated.season,
    plannedStartAt: updated.plannedStartAt?.toISOString() ?? null,
    plannedEndAt: updated.plannedEndAt?.toISOString() ?? null,
  };

  await writeAudit(ctx.db, {
    tournamentId: tournament.id,
    actorAdminId: admin.id,
    requestId: admin.requestId,
    action: 'SEASON_IDENTITY_UPDATED',
    entityType: 'tournament',
    entityId: tournament.id,
    payload: { before, after },
  });

  return after;
}

/* -------------------------------------------------------------------------- */
/* Reglamento                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Qué se puede cambiar del reglamento, y qué consecuencia tiene.
 *
 * Se publica para que el panel pueda avisar **antes** de que alguien pulse
 * nada: cambiar la puntuación a mitad de temporada recalcula las jornadas ya
 * jugadas, y eso hay que decirlo antes, no después.
 */
export interface ConfigurableParameter {
  readonly key: ConfigurableSetting;
  readonly label: string;
  readonly group: 'FORMAT' | 'SCORING' | 'OPERATIONAL';
  /** `false` cuando el estado actual ya no permite cambiarlo. */
  readonly editable: boolean;
  /** Por qué no se puede, cuando no se puede. */
  readonly lockedReason: string | null;
  /** Si cambiarlo recalcula la clasificación ya jugada. */
  readonly recalculatesStandings: boolean;
}

export const CONFIGURABLE_PARAMETERS: readonly {
  key: ConfigurableSetting;
  label: string;
  group: ConfigurableParameter['group'];
}[] = [
  { key: 'rosterSize', label: 'Número de participantes', group: 'FORMAT' },
  { key: 'legs', label: 'Vueltas (ida y vuelta)', group: 'FORMAT' },
  { key: 'scoring', label: 'Puntuación', group: 'SCORING' },
  { key: 'crowns', label: 'Coronas por partido', group: 'SCORING' },
  { key: 'tiebreakers', label: 'Criterios de desempate', group: 'SCORING' },
  { key: 'sanctions', label: 'Sanciones', group: 'SCORING' },
  { key: 'disputes', label: 'Ventana de impugnación', group: 'OPERATIONAL' },
  { key: 'noShow', label: 'Tolerancia de incomparecencia', group: 'OPERATIONAL' },
];

export async function describeConfigurableParameters(
  ctx: AppContext,
): Promise<{ rulesVersion: string; status: string; parameters: ConfigurableParameter[] }> {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);

  const parameters = CONFIGURABLE_PARAMETERS.map((parameter): ConfigurableParameter => {
    let editable = true;
    let lockedReason: string | null = null;
    let recalculatesStandings = false;

    try {
      const verdict = assertSettingsChangeAllowed(tournament.status, [parameter.key]);
      recalculatesStandings = verdict.recalculatesStandings;
    } catch (error) {
      editable = false;
      lockedReason = error instanceof Error ? error.message : 'No se puede cambiar ahora.';
    }

    return { ...parameter, editable, lockedReason, recalculatesStandings };
  });

  return { rulesVersion: settings.rulesVersion, status: tournament.status, parameters };
}

/**
 * Cada campo puede venir o no venir.
 *
 * Se escribe el `| undefined` a mano en vez de usar `Partial<>` porque el
 * proyecto compila con `exactOptionalPropertyTypes`: ahí «opcional» y «puede
 * valer undefined» son cosas distintas, y lo que llega de un JSON es lo
 * segundo.
 */
type Optional<T> = { readonly [K in keyof T]?: T[K] | undefined };

export interface SettingsInput {
  readonly rosterSize?: number | undefined;
  readonly legs?: number | undefined;
  readonly scoring?: Optional<TournamentSettings['scoring']> | undefined;
  readonly crowns?: Optional<TournamentSettings['crowns']> | undefined;
  readonly sanctions?: Optional<TournamentSettings['sanctions']> | undefined;
  readonly disputes?: Optional<TournamentSettings['disputes']> | undefined;
  readonly noShow?: Optional<TournamentSettings['noShow']> | undefined;
  readonly tiebreakers?: readonly string[] | undefined;
  /** Motivo del cambio. Obligatorio: la tabla puede cambiar por esto. */
  readonly reason: string;
}

export async function updateTournamentSettings(
  ctx: AppContext,
  admin: AdminIdentity,
  input: SettingsInput,
) {
  const { tournament, settings, settingsRow } = await requireTournament(
    ctx.db,
    ctx.config.tournamentSlug,
  );

  const changed = (
    [
      'rosterSize',
      'legs',
      'scoring',
      'crowns',
      'sanctions',
      'disputes',
      'noShow',
      'tiebreakers',
    ] as const
  ).filter((key) => input[key] !== undefined) as ConfigurableSetting[];

  if (changed.length === 0) {
    throw badRequest('NOTHING_TO_UPDATE', 'No se ha indicado ningún parámetro que cambiar.');
  }

  // El dominio decide si este estado admite estos cambios.
  const verdict = assertSettingsChangeAllowed(tournament.status, changed);

  /*
    Se mezcla campo a campo, no con un `spread`.

    Un `{ ...actual, ...entrante }` copiaría también las claves que llegaron
    como `undefined` explícito —que es lo que produce un JSON parcial— y
    borraría valores que nadie pidió borrar. `??` distingue «no lo mandaron» de
    «lo mandaron vacío».
  */
  const keep = <T>(incoming: T | null | undefined, current: T): T => incoming ?? current;
  const nullable = <T>(incoming: T | null | undefined, current: T | null): T | null =>
    incoming === undefined ? current : incoming;

  const merged: TournamentSettings = {
    ...settings,
    rosterSize: keep(input.rosterSize, settings.rosterSize),
    legs: keep(input.legs, settings.legs),
    scoring: {
      win: keep(input.scoring?.win, settings.scoring.win),
      winWithMaxCrowns: keep(input.scoring?.winWithMaxCrowns, settings.scoring.winWithMaxCrowns),
      loss: keep(input.scoring?.loss, settings.scoring.loss),
      // `null` es una decisión aquí: significa «esta regla sigue sin definirse».
      draw: nullable(input.scoring?.draw, settings.scoring.draw),
      walkoverWin: nullable(input.scoring?.walkoverWin, settings.scoring.walkoverWin),
      walkoverCrowns: nullable(input.scoring?.walkoverCrowns, settings.scoring.walkoverCrowns),
    },
    crowns: { maxPerMatch: keep(input.crowns?.maxPerMatch, settings.crowns.maxPerMatch) },
    sanctions: {
      defaultPoints: keep(input.sanctions?.defaultPoints, settings.sanctions.defaultPoints),
      minPoints: keep(input.sanctions?.minPoints, settings.sanctions.minPoints),
    },
    disputes: { windowHours: keep(input.disputes?.windowHours, settings.disputes.windowHours) },
    noShow: {
      toleranceMinutes: keep(input.noShow?.toleranceMinutes, settings.noShow.toleranceMinutes),
      // Nunca configurable: una incomparecencia la declara una persona (R-03).
      automatic: false,
    },
    tiebreakers:
      input.tiebreakers === undefined
        ? settings.tiebreakers
        : (input.tiebreakers as TournamentSettings['tiebreakers']),
    // Cambiar las reglas cambia la versión. Sin esto, dos tablas calculadas con
    // reglas distintas llevarían la misma etiqueta.
    rulesVersion: verdict.recalculatesStandings
      ? nextRulesVersion(settings.rulesVersion)
      : settings.rulesVersion,
  };

  // Falla aquí, antes de tocar la base: una configuración imposible guardada es
  // una tabla que no se puede calcular.
  validateSettings(merged);

  const now = ctx.now();

  await ctx.db.transaction(async (tx) => {
    await tx
      .update(schema.tournaments)
      .set({ rosterSize: merged.rosterSize, legs: merged.legs, updatedAt: now })
      .where(eq(schema.tournaments.id, tournament.id));

    await tx
      .update(schema.tournamentSettings)
      .set({
        pointsWin: merged.scoring.win,
        pointsWinMaxCrowns: merged.scoring.winWithMaxCrowns,
        pointsLoss: merged.scoring.loss,
        pointsDraw: merged.scoring.draw,
        pointsWalkoverWin: merged.scoring.walkoverWin,
        walkoverCrownsWinner: merged.scoring.walkoverCrowns?.[0] ?? null,
        walkoverCrownsLoser: merged.scoring.walkoverCrowns?.[1] ?? null,
        maxCrownsPerMatch: merged.crowns.maxPerMatch,
        sanctionDefaultPoints: merged.sanctions.defaultPoints,
        sanctionMinPoints: merged.sanctions.minPoints,
        disputeWindowHours: merged.disputes.windowHours,
        noShowToleranceMinutes: merged.noShow.toleranceMinutes,
        tiebreakers: [...merged.tiebreakers],
        rulesVersion: merged.rulesVersion,
        updatedAt: now,
      })
      .where(eq(schema.tournamentSettings.tournamentId, tournament.id));

    await writeAudit(tx, {
      tournamentId: tournament.id,
      actorAdminId: admin.id,
      requestId: admin.requestId,
      action: 'SETTINGS_UPDATED',
      entityType: 'tournament',
      entityId: tournament.id,
      payload: {
        reason: input.reason,
        changed,
        // El antes y el después completos: es lo que permite entender, seis
        // meses más tarde, por qué la tabla dice lo que dice.
        before: { ...settings },
        after: { ...merged },
        recalculatesStandings: verdict.recalculatesStandings,
        rulesVersion: { from: settings.rulesVersion, to: merged.rulesVersion },
      },
    });
  });

  const refreshed = await ctx.db.query.tournamentSettings.findFirst({
    where: eq(schema.tournamentSettings.tournamentId, tournament.id),
  });
  const { tournament: updatedTournament } = await requireTournament(
    ctx.db,
    ctx.config.tournamentSlug,
  );

  /*
    Se anuncia si el cambio reescribe la tabla, porque es lo unico que otra
    parte del sistema necesitaria saber para reaccionar: lo demas son plazos.
  */
  ctx.events?.emit({
    type: 'SETTINGS_UPDATED',
    at: ctx.now().toISOString(),
    tournamentId: tournament.id,
    recalculatesStandings: verdict.recalculatesStandings,
  });

  return {
    settings: toDomainSettings(updatedTournament, refreshed!),
    recalculatesStandings: verdict.recalculatesStandings,
    rulesVersion: { from: settings.rulesVersion, to: merged.rulesVersion },
    previousUpdatedAt: settingsRow.updatedAt.toISOString(),
  };
}
