/**
 * Serializadores: de las filas de la base de datos a las formas del contrato
 * (`@liga/contracts`).
 *
 * Aquí es donde el resultado guardado (dos números de coronas) se convierte en
 * lo que la interfaz necesita: ganador, tipo de victoria y puntos. Todo eso lo
 * calcula el dominio; este módulo solo le pregunta y arma el objeto.
 */

import type { Match, MatchResultView, Round } from '@liga/contracts';
import {
  isDomainError,
  pointsForResult,
  resolveResult,
  type TournamentSettings,
} from '@liga/domain';

import type { MatchWithContext, RoundRow } from '../data/matches.ts';

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function serializeRound(round: RoundRow): Round {
  return {
    id: round.id,
    number: round.number,
    leg: round.leg,
    label: round.label,
    scheduledAt: toIso(round.scheduledAt),
  };
}

export function serializeResult(
  row: MatchWithContext,
  settings: TournamentSettings,
): MatchResultView | null {
  const stored = row.result;
  if (stored === null) return null;

  const domainResult = resolveResult(
    { homeId: row.match.homePlayerId, awayId: row.match.awayPlayerId },
    {
      homeCrowns: stored.homeCrowns,
      awayCrowns: stored.awayCrowns,
      resolution: stored.resolution,
      // Solo lo lleva una incomparecencia; en lo demas queda sin poner.
      ...(stored.absentPlayerId === null ? {} : { absentPlayerId: stored.absentPlayerId }),
    },
    settings,
  );

  // Un resultado guardado bajo un reglamento y leído bajo otro puede quedarse
  // sin puntuación definida (el caso real: un walkover cuya regla sigue
  // pendiente). Se devuelve `null` y la interfaz lo muestra como pendiente en
  // lugar de inventar un número.
  let points: MatchResultView['points'] = null;
  try {
    points = pointsForResult(domainResult, settings);
  } catch (error) {
    if (!isDomainError(error)) throw error;
  }

  return {
    homeCrowns: stored.homeCrowns,
    awayCrowns: stored.awayCrowns,
    resolution: stored.resolution,
    outcome: domainResult.outcome,
    victoryType: domainResult.victoryType,
    winnerId: domainResult.winnerId,
    loserId: domainResult.loserId,
    points,
    crownDiff: {
      home: stored.homeCrowns - stored.awayCrowns,
      away: stored.awayCrowns - stored.homeCrowns,
    },
    version: stored.version,
    verifiedAt: toIso(stored.verifiedAt),
  };
}

export function serializeMatch(row: MatchWithContext, settings: TournamentSettings): Match {
  return {
    id: row.match.id,
    order: row.match.orderInRound,
    roundId: row.match.roundId,
    roundNumber: row.round.number,
    leg: row.round.leg,
    status: row.match.status,
    scheduledAt: toIso(row.match.scheduledAt),
    originalScheduledAt: toIso(row.match.originalScheduledAt),
    postponementCount: row.match.postponementCount,
    playedAt: toIso(row.match.playedAt),
    stream: {
      url: row.match.streamUrl,
      vodUrl: row.match.vodUrl,
      platform: row.match.streamPlatform,
    },
    home: {
      id: row.homePlayer.id,
      displayName: row.homePlayer.displayName,
      slug: row.homePlayer.slug,
    },
    away: {
      id: row.awayPlayer.id,
      displayName: row.awayPlayer.displayName,
      slug: row.awayPlayer.slug,
    },
    result: serializeResult(row, settings),
  };
}
