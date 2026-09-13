/** Tipos compartidos por la clasificacion y los criterios de desempate. */

import type { PlayerId } from '../roster/participant.ts';

export interface StandingsRow {
  readonly playerId: PlayerId;
  /** PJ - partidos jugados (solo partidos con resultado registrado). */
  readonly played: number;
  /** VG - victorias. */
  readonly wins: number;
  /** VP - derrotas. */
  readonly losses: number;
  /** VE - empates. Siempre 0 mientras los empates no esten habilitados. */
  readonly draws: number;
  /** Victorias por el maximo de coronas (3-x). Criterio de desempate. */
  readonly maxCrownWins: number;
  /** CF - coronas a favor. */
  readonly crownsFor: number;
  /** CC - coronas en contra. */
  readonly crownsAgainst: number;
  /** DC - diferencia de coronas (CF - CC). */
  readonly crownDiff: number;
  /** Puntos obtenidos en la cancha, antes de sanciones. */
  readonly matchPoints: number;
  /** Suma de las sanciones activas (valor negativo o cero). */
  readonly sanctionPoints: number;
  /** PTS - puntos finales = matchPoints + sanctionPoints. */
  readonly points: number;
  /** Numero de sanciones activas aplicadas al jugador. */
  readonly sanctionCount: number;
}

/** Fila de la clasificacion ya ordenada y posicionada. */
export interface RankedStandingsRow extends StandingsRow {
  /** Posicion 1..N. Dos jugadores empatados comparten posicion. */
  readonly position: number;
  /**
   * `true` cuando la fila quedo exactamente igual que otra tras aplicar todos
   * los criterios de desempate configurados: la interfaz debe mostrarlo y el
   * administrador tiene que resolverlo con una regla adicional.
   */
  readonly unresolvedTie: boolean;
}

/** Resultado de un enfrentamiento, ya normalizado, tal y como lo consume la tabla. */
export interface HeadToHeadEntry {
  readonly playerId: PlayerId;
  readonly opponentId: PlayerId;
  readonly pointsWon: number;
  readonly crownsFor: number;
  readonly crownsAgainst: number;
  readonly won: boolean;
}

export interface StandingsContext {
  /** Todos los enfrentamientos resueltos, vistos desde cada jugador. */
  readonly headToHead: readonly HeadToHeadEntry[];
}
