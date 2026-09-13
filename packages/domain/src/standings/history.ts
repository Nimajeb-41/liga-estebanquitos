/**
 * Evolucion de la clasificacion, cara a cara y records de temporada.
 *
 * Todo esto se **deriva** de los mismos partidos que la tabla. No se guarda
 * nada: si manana cambia la puntuacion, la evolucion cambia con ella, igual que
 * la clasificacion. Guardar la posicion de cada jornada crearia una segunda
 * verdad que envejeceria mal.
 *
 * La posicion de un jugador en la jornada 3 es «como habria quedado la tabla si
 * la temporada hubiera terminado ahi», con las reglas de hoy. Es lo unico que
 * se puede afirmar sin inventar: no existe una foto historica que nadie sacara.
 */

import { countsForStandings } from '../matches/status.ts';
import type { PlayerId } from '../roster/participant.ts';
import type { Sanction } from '../sanctions/sanction.ts';
import type { TournamentSettings } from '../tournament/settings.ts';
import { buildStandings, type PlayedMatch } from './standings.ts';

/* -------------------------------------------------------------------------- */
/* Evolucion por jornada                                                       */
/* -------------------------------------------------------------------------- */

export interface HistoryPoint {
  readonly round: number;
  readonly position: number;
  readonly points: number;
  readonly played: number;
}

export interface PlayerHistory {
  readonly playerId: PlayerId;
  readonly points: readonly HistoryPoint[];
}

export interface StandingsHistory {
  /** Jornadas con algo jugado, en orden. Vacio si no se jugo nada. */
  readonly rounds: readonly number[];
  readonly players: readonly PlayerHistory[];
}

export interface HistoryInput {
  readonly playerIds: readonly PlayerId[];
  readonly matches: readonly PlayedMatch[];
  readonly sanctions: readonly Sanction[];
  readonly settings: TournamentSettings;
}

/**
 * La tabla tal y como quedo despues de cada jornada jugada.
 *
 * Solo se incluyen jornadas en las que se jugo algo. Una jornada entera
 * aplazada no aporta un punto en la grafica: repetiria el anterior y sugeriria
 * que paso algo cuando no paso nada.
 */
export function standingsHistory(input: HistoryInput): StandingsHistory {
  const played = input.matches.filter((match) => countsForStandings(match.status));
  const rounds = [...new Set(played.map((match) => match.roundNumber))].sort((a, b) => a - b);

  const byPlayer = new Map<PlayerId, HistoryPoint[]>();
  for (const playerId of input.playerIds) byPlayer.set(playerId, []);

  for (const round of rounds) {
    const table = buildStandings({
      playerIds: input.playerIds,
      matches: input.matches,
      sanctions: input.sanctions,
      settings: input.settings,
      upToRound: round,
    });

    for (const row of table) {
      byPlayer.get(row.playerId)?.push({
        round,
        position: row.position,
        points: row.points,
        played: row.played,
      });
    }
  }

  return {
    rounds,
    players: [...byPlayer].map(([playerId, points]) => ({ playerId, points })),
  };
}

/* -------------------------------------------------------------------------- */
/* Cara a cara                                                                 */
/* -------------------------------------------------------------------------- */

export interface HeadToHeadMatch {
  readonly matchId: string;
  readonly roundNumber: number;
  readonly leg: number;
  /** Quien jugaba en casa en ese partido. */
  readonly homeId: PlayerId;
  readonly homeCrowns: number;
  readonly awayCrowns: number;
  readonly winnerId: PlayerId | null;
  readonly walkover: boolean;
}

export interface HeadToHead {
  readonly playerA: PlayerId;
  readonly playerB: PlayerId;
  readonly played: number;
  readonly winsA: number;
  readonly winsB: number;
  readonly draws: number;
  readonly crownsA: number;
  readonly crownsB: number;
  readonly matches: readonly HeadToHeadMatch[];
  /**
   * Quien domina el cara a cara, o `null` si estan igualados.
   *
   * Es el recuento de victorias y nada mas. Que hacer con un empate a
   * victorias cuando el cara a cara decide una posicion es una regla de
   * desempate, y esa vive en `tiebreakers`, no aqui.
   */
  readonly leaderId: PlayerId | null;
}

export function headToHead(
  matches: readonly PlayedMatch[],
  playerA: PlayerId,
  playerB: PlayerId,
): HeadToHead {
  const between = matches
    .filter(
      (match) =>
        countsForStandings(match.status) &&
        ((match.homeId === playerA && match.awayId === playerB) ||
          (match.homeId === playerB && match.awayId === playerA)),
    )
    .slice()
    .sort((a, b) => a.roundNumber - b.roundNumber || a.id.localeCompare(b.id));

  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let crownsA = 0;
  let crownsB = 0;

  const detail: HeadToHeadMatch[] = between.map((match) => {
    const aIsHome = match.homeId === playerA;
    const crowns = {
      a: aIsHome ? match.result.homeCrowns : match.result.awayCrowns,
      b: aIsHome ? match.result.awayCrowns : match.result.homeCrowns,
    };
    crownsA += crowns.a;
    crownsB += crowns.b;

    if (match.result.outcome === 'DRAW') draws += 1;
    else if (match.result.winnerId === playerA) winsA += 1;
    else winsB += 1;

    return {
      matchId: match.id,
      roundNumber: match.roundNumber,
      leg: match.leg,
      homeId: match.homeId,
      homeCrowns: match.result.homeCrowns,
      awayCrowns: match.result.awayCrowns,
      winnerId: match.result.outcome === 'DRAW' ? null : match.result.winnerId,
      walkover: match.result.victoryType === 'WALKOVER',
    };
  });

  return {
    playerA,
    playerB,
    played: detail.length,
    winsA,
    winsB,
    draws,
    crownsA,
    crownsB,
    matches: detail,
    leaderId: winsA === winsB ? null : winsA > winsB ? playerA : playerB,
  };
}

/* -------------------------------------------------------------------------- */
/* Records de temporada                                                        */
/* -------------------------------------------------------------------------- */

/** Codigo estable de cada record. El texto lo pone la interfaz. */
export type SeasonRecordCode =
  'BIGGEST_WIN' | 'MOST_CROWNS_IN_MATCH' | 'LONGEST_WIN_STREAK' | 'MOST_MAX_CROWN_WINS';

export interface SeasonRecord {
  readonly code: SeasonRecordCode;
  /**
   * El valor del record. `null` cuando no hay nada que contar todavia: es
   * distinto de cero, que significaria «se midio y salio cero».
   */
  readonly value: number | null;
  readonly playerIds: readonly PlayerId[];
  readonly matchId: string | null;
  readonly roundNumber: number | null;
}

/**
 * Records de la temporada.
 *
 * Las incomparecencias quedan fuera de los records de marcador a proposito: su
 * resultado no es un marcador, es la ausencia de uno. Contar un walkover como
 * «la mayor goleada» seria inventar una batalla que no se jugo.
 */
export function seasonRecords(
  matches: readonly PlayedMatch[],
  streaks: ReadonlyMap<PlayerId, number>,
  maxCrownWins: ReadonlyMap<PlayerId, number>,
): readonly SeasonRecord[] {
  const scored = matches.filter(
    (match) => countsForStandings(match.status) && match.result.victoryType !== 'WALKOVER',
  );

  const empty = (code: SeasonRecordCode): SeasonRecord => ({
    code,
    value: null,
    playerIds: [],
    matchId: null,
    roundNumber: null,
  });

  const records: SeasonRecord[] = [];

  /* Mayor diferencia de coronas en un partido. */
  let biggest: { diff: number; match: PlayedMatch } | null = null;
  let mostCrowns: { crowns: number; match: PlayedMatch } | null = null;
  for (const match of scored) {
    const diff = Math.abs(match.result.homeCrowns - match.result.awayCrowns);
    if (biggest === null || diff > biggest.diff) biggest = { diff, match };

    const crowns = match.result.homeCrowns + match.result.awayCrowns;
    if (mostCrowns === null || crowns > mostCrowns.crowns) mostCrowns = { crowns, match };
  }

  records.push(
    biggest === null || biggest.diff === 0
      ? empty('BIGGEST_WIN')
      : {
          code: 'BIGGEST_WIN',
          value: biggest.diff,
          playerIds:
            biggest.match.result.outcome === 'DRAW' || biggest.match.result.winnerId === null
              ? []
              : [biggest.match.result.winnerId],
          matchId: biggest.match.id,
          roundNumber: biggest.match.roundNumber,
        },
  );

  records.push(
    mostCrowns === null
      ? empty('MOST_CROWNS_IN_MATCH')
      : {
          code: 'MOST_CROWNS_IN_MATCH',
          value: mostCrowns.crowns,
          playerIds: [mostCrowns.match.homeId, mostCrowns.match.awayId],
          matchId: mostCrowns.match.id,
          roundNumber: mostCrowns.match.roundNumber,
        },
  );

  records.push(leaders('LONGEST_WIN_STREAK', streaks));
  records.push(leaders('MOST_MAX_CROWN_WINS', maxCrownWins));

  return records;
}

/** Quien tiene el maximo de una medida, con todos los empatados. */
function leaders(code: SeasonRecordCode, values: ReadonlyMap<PlayerId, number>): SeasonRecord {
  let best = 0;
  for (const value of values.values()) if (value > best) best = value;
  if (best === 0) return { code, value: null, playerIds: [], matchId: null, roundNumber: null };

  const playerIds = [...values]
    .filter(([, value]) => value === best)
    .map(([playerId]) => playerId)
    .sort();

  return { code, value: best, playerIds, matchId: null, roundNumber: null };
}
