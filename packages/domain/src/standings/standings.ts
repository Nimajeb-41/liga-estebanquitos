/**
 * Clasificacion.
 *
 * La tabla es SIEMPRE una proyeccion: partidos + resultados + sanciones ->
 * estadisticas -> clasificacion. No existe ninguna via para editarla a mano, y
 * borrar o corregir un resultado la deja automaticamente coherente.
 */

import { countsForStandings, type MatchStatus } from '../matches/status.ts';
import type { MatchResult } from '../results/result.ts';
import type { PlayerId } from '../roster/participant.ts';
import { pointsForResult } from '../scoring/points.ts';
import { isActiveSanction, type Sanction } from '../sanctions/sanction.ts';
import type { TournamentSettings } from '../tournament/settings.ts';
import { comparatorFor, type TiebreakerId } from './tiebreakers.ts';
import type {
  HeadToHeadEntry,
  RankedStandingsRow,
  StandingsContext,
  StandingsRow,
} from './types.ts';

/**
 * Partido con resultado registrado, tal y como lo consume la clasificacion.
 *
 * El estado viaja con el partido a proposito: la regla de que un aplazado no
 * puntua y un disputado deja de contar es una regla de competicion, y por tanto
 * vive aqui, no en la consulta SQL que trae los datos.
 */
export interface PlayedMatch {
  readonly id: string;
  readonly roundNumber: number;
  readonly leg: number;
  readonly homeId: PlayerId;
  readonly awayId: PlayerId;
  readonly status: MatchStatus;
  readonly result: MatchResult;
}

export interface BuildStandingsInput {
  readonly playerIds: readonly PlayerId[];
  readonly matches: readonly PlayedMatch[];
  readonly sanctions: readonly Sanction[];
  readonly settings: TournamentSettings;
  /** Calcula la tabla como estaba tras esa jornada (para ver la evolucion). */
  readonly upToRound?: number;
}

interface MutableRow {
  playerId: PlayerId;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  maxCrownWins: number;
  crownsFor: number;
  crownsAgainst: number;
  matchPoints: number;
  sanctionPoints: number;
  sanctionCount: number;
}

function emptyRow(playerId: PlayerId): MutableRow {
  return {
    playerId,
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    maxCrownWins: 0,
    crownsFor: 0,
    crownsAgainst: 0,
    matchPoints: 0,
    sanctionPoints: 0,
    sanctionCount: 0,
  };
}

/** Estadisticas por jugador, sin ordenar. */
export function computeStats(input: BuildStandingsInput): {
  rows: StandingsRow[];
  context: StandingsContext;
} {
  const rows = new Map<PlayerId, MutableRow>();
  for (const playerId of input.playerIds) rows.set(playerId, emptyRow(playerId));

  const headToHead: HeadToHeadEntry[] = [];
  // Solo cuentan los partidos COMPLETED: un aplazado no suma PJ ni coronas, y
  // un disputado deja de contar hasta que el administrador lo resuelva.
  const matches = input.matches
    .filter((match) => countsForStandings(match.status))
    .filter(
      (match) => input.upToRound === undefined || match.roundNumber <= (input.upToRound as number),
    );

  for (const match of matches) {
    const home = rows.get(match.homeId);
    const away = rows.get(match.awayId);
    if (home === undefined || away === undefined) continue;

    const { result } = match;
    const points = pointsForResult(result, input.settings);

    home.played += 1;
    away.played += 1;
    home.crownsFor += result.homeCrowns;
    home.crownsAgainst += result.awayCrowns;
    away.crownsFor += result.awayCrowns;
    away.crownsAgainst += result.homeCrowns;
    home.matchPoints += points.home;
    away.matchPoints += points.away;

    if (result.outcome === 'DRAW') {
      home.draws += 1;
      away.draws += 1;
    } else {
      const winner = result.outcome === 'HOME_WIN' ? home : away;
      const loser = result.outcome === 'HOME_WIN' ? away : home;
      winner.wins += 1;
      loser.losses += 1;
      if (result.victoryType === 'MAX_CROWNS') winner.maxCrownWins += 1;
    }

    headToHead.push({
      playerId: match.homeId,
      opponentId: match.awayId,
      pointsWon: points.home,
      crownsFor: result.homeCrowns,
      crownsAgainst: result.awayCrowns,
      won: result.outcome === 'HOME_WIN',
    });
    headToHead.push({
      playerId: match.awayId,
      opponentId: match.homeId,
      pointsWon: points.away,
      crownsFor: result.awayCrowns,
      crownsAgainst: result.homeCrowns,
      won: result.outcome === 'AWAY_WIN',
    });
  }

  for (const sanction of input.sanctions) {
    if (!isActiveSanction(sanction)) continue;
    if (
      input.upToRound !== undefined &&
      sanction.roundNumber !== null &&
      sanction.roundNumber > input.upToRound
    ) {
      continue;
    }
    const row = rows.get(sanction.playerId);
    if (row === undefined) continue;
    row.sanctionPoints += sanction.points;
    row.sanctionCount += 1;
  }

  const finalRows: StandingsRow[] = [...rows.values()].map((row) => ({
    playerId: row.playerId,
    played: row.played,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    maxCrownWins: row.maxCrownWins,
    crownsFor: row.crownsFor,
    crownsAgainst: row.crownsAgainst,
    crownDiff: row.crownsFor - row.crownsAgainst,
    matchPoints: row.matchPoints,
    sanctionPoints: row.sanctionPoints,
    points: row.matchPoints + row.sanctionPoints,
    sanctionCount: row.sanctionCount,
  }));

  return { rows: finalRows, context: { headToHead } };
}

/* -------------------------------------------------------------------------- */
/* Ordenacion                                                                  */
/* -------------------------------------------------------------------------- */

interface MiniLeagueKey {
  readonly points: number;
  readonly crownDiff: number;
}

/**
 * Mini-liga entre los jugadores empatados: solo se cuentan los partidos que
 * disputaron entre ellos. Resuelve correctamente los empates de tres o mas,
 * donde una comparacion por parejas seria intransitiva.
 */
function miniLeagueKeys(
  group: readonly StandingsRow[],
  context: StandingsContext,
): Map<PlayerId, MiniLeagueKey> {
  const members = new Set(group.map((row) => row.playerId));
  const keys = new Map<PlayerId, { points: number; crownDiff: number }>();
  for (const row of group) keys.set(row.playerId, { points: 0, crownDiff: 0 });

  for (const entry of context.headToHead) {
    if (!members.has(entry.playerId) || !members.has(entry.opponentId)) continue;
    const key = keys.get(entry.playerId);
    if (key === undefined) continue;
    key.points += entry.pointsWon;
    key.crownDiff += entry.crownsFor - entry.crownsAgainst;
  }

  return new Map([...keys].map(([playerId, key]) => [playerId, key]));
}

/** Agrupa filas consecutivas que el comparador considera equivalentes. */
function groupConsecutive(
  ordered: readonly StandingsRow[],
  equal: (a: StandingsRow, b: StandingsRow) => boolean,
): StandingsRow[][] {
  const groups: StandingsRow[][] = [];
  for (const row of ordered) {
    const last = groups[groups.length - 1];
    if (last !== undefined && equal(last[last.length - 1] as StandingsRow, row)) {
      last.push(row);
    } else {
      groups.push([row]);
    }
  }
  return groups;
}

/**
 * Ordena un grupo aplicando la cadena de criterios desde `index`.
 * Devuelve grupos: cada grupo interno son filas que ningun criterio separo.
 */
function resolveGroup(
  rows: readonly StandingsRow[],
  chain: readonly TiebreakerId[],
  index: number,
  context: StandingsContext,
): StandingsRow[][] {
  if (rows.length <= 1) return [rows.slice()];
  if (index >= chain.length) {
    // Empate real: se deja marcado y se ordena por id para que la salida sea
    // estable, nunca aleatoria.
    return [rows.slice().sort((a, b) => a.playerId.localeCompare(b.playerId))];
  }

  const id = chain[index] as TiebreakerId;
  let ordered: StandingsRow[];
  let equal: (a: StandingsRow, b: StandingsRow) => boolean;

  if (id === 'HEAD_TO_HEAD') {
    const keys = miniLeagueKeys(rows, context);
    const keyOf = (row: StandingsRow): MiniLeagueKey =>
      keys.get(row.playerId) ?? { points: 0, crownDiff: 0 };
    ordered = rows.slice().sort((a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      return kb.points - ka.points || kb.crownDiff - ka.crownDiff;
    });
    equal = (a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      return ka.points === kb.points && ka.crownDiff === kb.crownDiff;
    };
  } else {
    const comparator = comparatorFor(id);
    ordered = rows.slice().sort((a, b) => comparator(a, b, context));
    equal = (a, b) => comparator(a, b, context) === 0;
  }

  return groupConsecutive(ordered, equal).flatMap((group) =>
    resolveGroup(group, chain, index + 1, context),
  );
}

/** Clasificacion completa, ordenada y con las posiciones asignadas. */
export function buildStandings(input: BuildStandingsInput): RankedStandingsRow[] {
  const { rows, context } = computeStats(input);
  const groups = resolveGroup(rows, input.settings.tiebreakers, 0, context);

  const ranked: RankedStandingsRow[] = [];
  let position = 1;
  for (const group of groups) {
    const unresolvedTie = group.length > 1;
    for (const row of group) {
      ranked.push({ ...row, position, unresolvedTie });
    }
    position += group.length;
  }
  return ranked;
}
