/**
 * Estadisticas oficiales de un participante.
 *
 * Codigo puro, derivado de los mismos partidos que alimentan la clasificacion.
 * No hay una segunda fuente: si estas cifras y la tabla discrepasen, una de las
 * dos estaria mal, y por eso ambas salen de `PlayedMatch[]`.
 *
 * Dos decisiones que se repiten en todo el modulo:
 *
 * 1. **Cero y «sin datos» no son lo mismo.** Un porcentaje sobre cero partidos
 *    es `null`, no `0`. Un 0 % dice «lo intento y fallo siempre»; la realidad
 *    es que todavia no jugo.
 * 2. **Solo cuentan los partidos finalizados.** Un aplazado no es una derrota
 *    (R-04) y un disputado no es definitivo. El filtro vive aqui, con las demas
 *    reglas, no en la consulta que trae los datos.
 */

import { countsForStandings } from '../matches/index.ts';
import type { PlayerId } from '../roster/participant.ts';
import { pointsForResult } from '../scoring/points.ts';
import type { PlayedMatch } from '../standings/standings.ts';
import type { Sanction } from '../sanctions/index.ts';
import type { TournamentSettings } from '../tournament/settings.ts';
import type { OfficialPlayerStatistics, OfficialSplit } from './types.ts';

/** Redondea a dos decimales una proporcion 0..1. */
function ratio(part: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((part / total) * 10_000) / 10_000;
}

/** Media por partido, con un decimal. `null` si no hubo partidos. */
function mean(total: number, count: number): number | null {
  if (count === 0) return null;
  return Math.round((total / count) * 10) / 10;
}

interface MutableSplit {
  played: number;
  wins: number;
  losses: number;
  crownsFor: number;
  crownsAgainst: number;
  points: number;
}

const emptySplit = (): MutableSplit => ({
  played: 0,
  wins: 0,
  losses: 0,
  crownsFor: 0,
  crownsAgainst: 0,
  points: 0,
});

const sealSplit = (split: MutableSplit): OfficialSplit => ({
  played: split.played,
  wins: split.wins,
  losses: split.losses,
  crownsFor: split.crownsFor,
  crownsAgainst: split.crownsAgainst,
  points: split.points,
  winRate: ratio(split.wins, split.played),
});

/**
 * Rachas de una secuencia de resultados.
 *
 * La secuencia llega en orden cronologico. Devuelve la racha en curso —la del
 * final— y las mejores de cada signo, que son cosas distintas: alguien puede
 * llevar tres derrotas seguidas y aun asi tener la mejor racha de victorias.
 */
function streaks(results: readonly ('W' | 'L' | 'D')[]): {
  current: { type: 'W' | 'L' | 'D'; length: number } | null;
  bestWin: number;
  worstLoss: number;
} {
  if (results.length === 0) return { current: null, bestWin: 0, worstLoss: 0 };

  let bestWin = 0;
  let worstLoss = 0;
  let runType = results[0]!;
  let runLength = 0;

  for (const result of results) {
    if (result === runType) runLength += 1;
    else {
      runType = result;
      runLength = 1;
    }
    if (runType === 'W') bestWin = Math.max(bestWin, runLength);
    if (runType === 'L') worstLoss = Math.max(worstLoss, runLength);
  }

  return { current: { type: runType, length: runLength }, bestWin, worstLoss };
}

export interface StatisticsInput {
  readonly playerIds: readonly PlayerId[];
  readonly matches: readonly PlayedMatch[];
  readonly sanctions: readonly Sanction[];
  /** Los puntos los reparte el reglamento vigente, no esta funcion. */
  readonly settings: TournamentSettings;
}

/**
 * Estadisticas oficiales de todos los participantes.
 *
 * El orden de los partidos importa para las rachas: se ordenan por jornada y,
 * dentro de una jornada, por identificador, para que el resultado no dependa de
 * como los devuelva la base de datos.
 */
export function computePlayerStatistics(
  input: StatisticsInput,
): readonly OfficialPlayerStatistics[] {
  const played = [...input.matches]
    .filter((match) => countsForStandings(match.status))
    .sort((left, right) => left.roundNumber - right.roundNumber || left.id.localeCompare(right.id));

  return input.playerIds.map((playerId) => {
    const own = played.filter((match) => match.homeId === playerId || match.awayId === playerId);

    const home = emptySplit();
    const away = emptySplit();
    const results: ('W' | 'L' | 'D')[] = [];

    let wins = 0;
    let losses = 0;
    let draws = 0;
    let maxCrownWins = 0;
    let walkoversFor = 0;
    let walkoversAgainst = 0;
    let crownsFor = 0;
    let crownsAgainst = 0;
    let matchPoints = 0;

    for (const match of own) {
      const isHome = match.homeId === playerId;
      const split = isHome ? home : away;
      const mine = isHome ? match.result.homeCrowns : match.result.awayCrowns;
      const theirs = isHome ? match.result.awayCrowns : match.result.homeCrowns;

      // Los puntos los reparte el reglamento, igual que en la clasificacion.
      // Si una regla pendiente impide calcularlos —una incomparecencia con
      // P-01 abierta—, este partido no aporta puntos: no se inventa un cero
      // con significado, simplemente no suma.
      let gained: number;
      try {
        const points = pointsForResult(match.result, input.settings);
        gained = isHome ? points.home : points.away;
      } catch {
        gained = 0;
      }

      crownsFor += mine;
      crownsAgainst += theirs;
      matchPoints += gained;

      split.played += 1;
      split.crownsFor += mine;
      split.crownsAgainst += theirs;
      split.points += gained;

      if (match.result.outcome === 'DRAW') {
        draws += 1;
        results.push('D');
      } else if (match.result.winnerId === playerId) {
        wins += 1;
        split.wins += 1;
        results.push('W');
        if (match.result.victoryType === 'MAX_CROWNS') maxCrownWins += 1;
        if (match.result.victoryType === 'WALKOVER') walkoversFor += 1;
      } else {
        losses += 1;
        split.losses += 1;
        results.push('L');
        if (match.result.victoryType === 'WALKOVER') walkoversAgainst += 1;
      }
    }

    const active = input.sanctions.filter(
      (sanction) => sanction.playerId === playerId && sanction.status === 'ACTIVE',
    );
    const sanctionPoints = active.reduce((sum, sanction) => sum + sanction.points, 0);
    const run = streaks(results);
    /** Partidos con batalla: los que se pueden promediar. */
    const battles = own.length - walkoversFor - walkoversAgainst;

    return {
      source: 'OFFICIAL',
      playerId,
      played: own.length,
      wins,
      losses,
      draws,
      winRate: ratio(wins, own.length),
      maxCrownWins,
      maxCrownWinRate: ratio(maxCrownWins, wins),
      walkoversFor,
      walkoversAgainst,
      crownsFor,
      crownsAgainst,
      crownDiff: crownsFor - crownsAgainst,
      /*
        Las medias se calculan sobre los partidos que **se jugaron**.

        Una incomparecencia no es un partido de cero coronas: es un partido sin
        batalla. Meterla en la media respondería «cuántas coronas sueles hacer»
        con un dato que no se midió, y castigaría al que se presentó.
      */
      averageCrownsFor: mean(crownsFor, battles),
      averageCrownsAgainst: mean(crownsAgainst, battles),
      matchPoints,
      sanctionPoints,
      points: matchPoints + sanctionPoints,
      currentStreak: run.current,
      bestWinStreak: run.bestWin,
      worstLossStreak: run.worstLoss,
      home: sealSplit(home),
      away: sealSplit(away),
    } satisfies OfficialPlayerStatistics;
  });
}

/**
 * Los mejores en una metrica.
 *
 * Devuelve **todos** los empatados en el primer puesto, no uno arbitrario: una
 * liga de diez personas empata a menudo, y elegir uno «el primero que salga»
 * seria inventarse un desempate.
 *
 * Quien no ha jugado no lidera nada: un `null` nunca gana.
 */
export function leadersBy<T extends { readonly playerId: string }>(
  rows: readonly T[],
  metric: (row: T) => number | null,
  direction: 'HIGHEST' | 'LOWEST' = 'HIGHEST',
): { readonly value: number; readonly playerIds: readonly string[] } | null {
  const usable = rows
    .map((row) => ({ playerId: row.playerId, value: metric(row) }))
    .filter((entry): entry is { playerId: string; value: number } => entry.value !== null);

  if (usable.length === 0) return null;

  const best = usable.reduce(
    (current, entry) =>
      direction === 'HIGHEST' ? Math.max(current, entry.value) : Math.min(current, entry.value),
    usable[0]!.value,
  );

  return {
    value: best,
    playerIds: usable.filter((entry) => entry.value === best).map((entry) => entry.playerId),
  };
}
