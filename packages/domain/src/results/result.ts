/**
 * Resultado de un partido.
 *
 * Un partido de la liga es un enfrentamiento a una batalla: cada jugador
 * consigue entre 0 y `crowns.maxPerMatch` coronas y gana quien mas consiga.
 * Nada de esto se guarda "calculado": el ganador, el tipo de victoria y los
 * puntos se derivan siempre de las coronas y de la configuracion vigente.
 */

import { DomainError, pendingRule } from '../errors.ts';
import type { PlayerId } from '../roster/participant.ts';
import type { TournamentSettings } from '../tournament/settings.ts';

/**
 * Como se llego al resultado. Se separa del estado a proposito: el estado dice
 * en que punto del ciclo esta el partido, la resolucion dice de donde sale el
 * marcador.
 */
export const MATCH_RESOLUTIONS = ['PLAYED', 'WALKOVER', 'ADMIN_DECISION'] as const;
export type MatchResolution = (typeof MATCH_RESOLUTIONS)[number];

export const MATCH_OUTCOMES = ['HOME_WIN', 'AWAY_WIN', 'DRAW'] as const;
export type MatchOutcome = (typeof MATCH_OUTCOMES)[number];

export const VICTORY_TYPES = [
  'NORMAL',
  'MAX_CROWNS',
  'WALKOVER',
  'ADMIN_DECISION',
  'NONE',
] as const;
export type VictoryType = (typeof VICTORY_TYPES)[number];

export interface MatchPairing {
  readonly homeId: PlayerId;
  readonly awayId: PlayerId;
}

export interface MatchResultInput {
  readonly homeCrowns: number;
  readonly awayCrowns: number;
  readonly resolution?: MatchResolution;
  /**
   * Quien no se presento. **Obligatorio y exclusivo** de `WALKOVER`.
   *
   * En un walkover el marcador no decide nada: no hubo batalla. Quien gana es
   * el que estaba, y eso solo se sabe diciendo quien faltaba. Derivarlo del
   * marcador exigiria inventarse un 3-0 que nadie jugo.
   */
  readonly absentPlayerId?: PlayerId;
}

export interface MatchResult {
  readonly homeCrowns: number;
  readonly awayCrowns: number;
  readonly resolution: MatchResolution;
  readonly outcome: MatchOutcome;
  readonly victoryType: VictoryType;
  readonly winnerId: PlayerId | null;
  readonly loserId: PlayerId | null;
}

/**
 * Comprueba que un marcador es coherente con el formato:
 * enteros, dentro del rango, y sin que ambos jugadores alcancen el maximo.
 */
export function validateCrowns(
  homeCrowns: number,
  awayCrowns: number,
  settings: TournamentSettings,
): void {
  const max = settings.crowns.maxPerMatch;
  const problems: string[] = [];

  for (const [label, value] of [
    ['local', homeCrowns],
    ['visitante', awayCrowns],
  ] as const) {
    if (!Number.isInteger(value)) problems.push(`Las coronas del ${label} deben ser un entero.`);
    if (value < 0) problems.push(`Las coronas del ${label} no pueden ser negativas.`);
    if (value > max) problems.push(`Las coronas del ${label} no pueden superar ${max}.`);
  }

  if (homeCrowns === max && awayCrowns === max) {
    problems.push(`Los dos jugadores no pueden llegar a ${max} coronas en el mismo partido.`);
  }

  if (problems.length > 0) {
    throw new DomainError('INVALID_CROWNS', problems.join(' '), {
      homeCrowns,
      awayCrowns,
      maxPerMatch: max,
      problems,
    });
  }

  if (homeCrowns === awayCrowns && settings.scoring.draw === null) {
    throw new DomainError(
      'DRAW_NOT_ALLOWED',
      `Marcador empatado (${homeCrowns}-${awayCrowns}): el reglamento no admite empates, el partido debe resolverse con un ganador.`,
      { homeCrowns, awayCrowns },
    );
  }
}

/** Construye el resultado normalizado de un partido a partir del marcador. */
export function resolveResult(
  pairing: MatchPairing,
  input: MatchResultInput,
  settings: TournamentSettings,
): MatchResult {
  if (pairing.homeId === pairing.awayId) {
    throw new DomainError('SELF_MATCH', 'Un jugador no puede enfrentarse a si mismo.', {
      playerId: pairing.homeId,
    });
  }

  const resolution = input.resolution ?? 'PLAYED';

  if (resolution === 'WALKOVER') return resolveWalkover(pairing, input, settings);

  if (input.absentPlayerId !== undefined) {
    throw new DomainError(
      'ABSENT_PLAYER_NOT_APPLICABLE',
      'Solo un walkover tiene jugador ausente: un partido jugado se resuelve por el marcador.',
      { resolution },
    );
  }

  validateCrowns(input.homeCrowns, input.awayCrowns, settings);

  const { homeCrowns, awayCrowns } = input;
  const outcome: MatchOutcome =
    homeCrowns === awayCrowns ? 'DRAW' : homeCrowns > awayCrowns ? 'HOME_WIN' : 'AWAY_WIN';

  const winnerId =
    outcome === 'DRAW' ? null : outcome === 'HOME_WIN' ? pairing.homeId : pairing.awayId;
  const loserId =
    outcome === 'DRAW' ? null : outcome === 'HOME_WIN' ? pairing.awayId : pairing.homeId;

  const winnerCrowns = Math.max(homeCrowns, awayCrowns);
  let victoryType: VictoryType;
  if (outcome === 'DRAW') {
    victoryType = 'NONE';
  } else if (resolution === 'ADMIN_DECISION') {
    victoryType = 'ADMIN_DECISION';
  } else {
    victoryType = winnerCrowns === settings.crowns.maxPerMatch ? 'MAX_CROWNS' : 'NORMAL';
  }

  return {
    homeCrowns,
    awayCrowns,
    resolution,
    outcome,
    victoryType,
    winnerId,
    loserId,
  };
}

/**
 * Incomparecencia (regla P-01, decidida el 10 de septiembre de 2026).
 *
 * Un walkover **no es un marcador**. No hubo batalla, así que no hay coronas
 * que repartir: quien se presentó gana el partido y los puntos de una victoria
 * normal, y ahí acaba. Concretamente:
 *
 *   presente  → PJ +1, VG +1, PTS +3, coronas 0
 *   ausente   → PJ +1, VP +1, PTS +0, coronas 0
 *
 * Tres cosas que **no** hace, y que son la razón de que esto sea una función
 * aparte en vez de una rama dentro del camino normal:
 *
 * - **No fabrica un 3-0.** Un marcador inventado contamina la diferencia de
 *   coronas, que es el primer criterio de desempate después de los puntos: dos
 *   incomparecencias decidirían la liga con coronas que nadie consiguió.
 * - **No es victoria por tres coronas.** Son 3 puntos, no 4, y no cuenta en el
 *   recuento de victorias máximas.
 * - **No deriva el ganador del marcador.** Con 0-0 el marcador diría empate.
 *   Gana quien estaba, y eso solo se sabe diciendo quién faltaba.
 *
 * El partido queda distinguible de una victoria jugada para siempre, por su
 * `resolution` y su `victoryType`.
 */
function resolveWalkover(
  pairing: MatchPairing,
  input: MatchResultInput,
  settings: TournamentSettings,
): MatchResult {
  if (settings.scoring.walkoverWin === null) {
    throw pendingRule('victoria por incomparecencia (walkover)', 'docs/pending-rules.md');
  }

  const absent = input.absentPlayerId;
  if (absent === undefined) {
    throw new DomainError(
      'ABSENT_PLAYER_REQUIRED',
      'Una incomparecencia necesita saber quién no se presentó: el marcador no lo dice.',
      { homeId: pairing.homeId, awayId: pairing.awayId },
    );
  }
  if (absent !== pairing.homeId && absent !== pairing.awayId) {
    throw new DomainError(
      'ABSENT_PLAYER_NOT_IN_MATCH',
      'El jugador ausente tiene que ser uno de los dos del partido.',
      { absent, homeId: pairing.homeId, awayId: pairing.awayId },
    );
  }

  // Un walkover con marcador sería una contradicción: o hubo batalla o no la
  // hubo. Se rechaza en vez de ignorarlo en silencio.
  if (input.homeCrowns !== 0 || input.awayCrowns !== 0) {
    throw new DomainError(
      'WALKOVER_HAS_NO_SCORE',
      'Una incomparecencia no tiene marcador: no se jugó ninguna batalla.',
      { homeCrowns: input.homeCrowns, awayCrowns: input.awayCrowns },
    );
  }

  const homeAbsent = absent === pairing.homeId;
  const [winnerCrowns, loserCrowns] = settings.scoring.walkoverCrowns ?? [0, 0];

  return {
    homeCrowns: homeAbsent ? loserCrowns : winnerCrowns,
    awayCrowns: homeAbsent ? winnerCrowns : loserCrowns,
    resolution: 'WALKOVER',
    outcome: homeAbsent ? 'AWAY_WIN' : 'HOME_WIN',
    victoryType: 'WALKOVER',
    winnerId: homeAbsent ? pairing.awayId : pairing.homeId,
    loserId: absent,
  };
}
