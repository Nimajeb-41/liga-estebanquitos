/**
 * Criterios de desempate.
 *
 * Cada criterio es un comparador con nombre. El orden de aplicacion vive en
 * `TournamentSettings.tiebreakers`, de modo que cambiar la politica de
 * desempate es cambiar un array de identificadores, no reescribir la tabla.
 */

import { DomainError } from '../errors.ts';
import type { HeadToHeadEntry, StandingsContext, StandingsRow } from './types.ts';

export const TIEBREAKER_IDS = [
  /** Puntos finales (incluye sanciones). */
  'POINTS',
  /** DC - diferencia de coronas. */
  'CROWN_DIFF',
  /** VG - numero de victorias. */
  'WINS',
  /** Enfrentamiento directo entre los jugadores empatados (mini-liga). */
  'HEAD_TO_HEAD',
  /** Victorias consiguiendo el maximo de coronas. */
  'MAX_CROWN_WINS',
  /** CF - coronas a favor. */
  'CROWNS_FOR',
  /** CC - menos coronas recibidas. */
  'FEWEST_CROWNS_AGAINST',
  /** Menor cantidad de puntos perdidos por sancion (juego mas limpio). */
  'FEWEST_SANCTIONS',
] as const;

export type TiebreakerId = (typeof TIEBREAKER_IDS)[number];

export function isTiebreakerId(value: string): value is TiebreakerId {
  return (TIEBREAKER_IDS as readonly string[]).includes(value);
}

/**
 * Comparador: devuelve un numero negativo si `a` va por delante de `b`.
 * Todos los criterios ordenan "de mejor a peor" (descendente en la metrica).
 */
export type TiebreakerComparator = (
  a: StandingsRow,
  b: StandingsRow,
  context: StandingsContext,
) => number;

/** Mini-liga entre los jugadores implicados en el empate. */
function headToHead(a: StandingsRow, b: StandingsRow, context: StandingsContext): number {
  const between = context.headToHead.filter(
    (entry: HeadToHeadEntry) =>
      (entry.playerId === a.playerId && entry.opponentId === b.playerId) ||
      (entry.playerId === b.playerId && entry.opponentId === a.playerId),
  );

  if (between.length === 0) return 0;

  let pointsA = 0;
  let pointsB = 0;
  let crownDiffA = 0;

  for (const entry of between) {
    if (entry.playerId === a.playerId) {
      pointsA += entry.pointsWon;
      crownDiffA += entry.crownsFor - entry.crownsAgainst;
    } else {
      pointsB += entry.pointsWon;
      crownDiffA -= entry.crownsFor - entry.crownsAgainst;
    }
  }

  if (pointsA !== pointsB) return pointsB - pointsA;
  return -crownDiffA;
}

const COMPARATORS: Readonly<Record<TiebreakerId, TiebreakerComparator>> = {
  POINTS: (a, b) => b.points - a.points,
  CROWN_DIFF: (a, b) => b.crownDiff - a.crownDiff,
  WINS: (a, b) => b.wins - a.wins,
  HEAD_TO_HEAD: headToHead,
  MAX_CROWN_WINS: (a, b) => b.maxCrownWins - a.maxCrownWins,
  CROWNS_FOR: (a, b) => b.crownsFor - a.crownsFor,
  FEWEST_CROWNS_AGAINST: (a, b) => a.crownsAgainst - b.crownsAgainst,
  FEWEST_SANCTIONS: (a, b) => b.sanctionPoints - a.sanctionPoints,
};

export function comparatorFor(id: TiebreakerId): TiebreakerComparator {
  const comparator = COMPARATORS[id];
  if (comparator === undefined) {
    throw new DomainError('UNKNOWN_TIEBREAKER', `Criterio de desempate desconocido: ${id}.`, {
      id,
    });
  }
  return comparator;
}

/**
 * Compara dos filas aplicando la cadena de criterios en orden.
 * Devuelve 0 unicamente si todos los criterios configurados empatan.
 */
export function compareByChain(
  a: StandingsRow,
  b: StandingsRow,
  chain: readonly TiebreakerId[],
  context: StandingsContext,
): number {
  for (const id of chain) {
    const result = comparatorFor(id)(a, b, context);
    if (result !== 0) return result;
  }
  return 0;
}
