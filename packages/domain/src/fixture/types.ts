/** Estructuras del fixture (calendario oficial). */

import type { PlayerId } from '../roster/participant.ts';

export const FIXTURE_ALGORITHMS = ['CIRCLE_METHOD'] as const;
export type FixtureAlgorithm = (typeof FIXTURE_ALGORITHMS)[number];

export interface FixtureMatch {
  /** Jornada 1..R dentro de todo el torneo. */
  readonly roundNumber: number;
  /** Vuelta: 1 = ida, 2 = vuelta. */
  readonly leg: number;
  /** Orden del partido dentro de la jornada, 1..matchesPerRound. */
  readonly order: number;
  readonly homeId: PlayerId;
  readonly awayId: PlayerId;
}

export interface FixtureRound {
  readonly number: number;
  readonly leg: number;
  readonly matches: readonly FixtureMatch[];
}

export interface Fixture {
  readonly algorithm: FixtureAlgorithm;
  /**
   * Semilla usada para barajar a los participantes. Guardarla permite
   * regenerar exactamente el mismo calendario y auditar que no hubo trampa.
   */
  readonly seed: string;
  readonly legs: number;
  /** Participantes en el orden efectivo que uso el algoritmo (ya barajado). */
  readonly playerIds: readonly PlayerId[];
  readonly rounds: readonly FixtureRound[];
}

/** Todos los partidos del fixture, en orden de jornada. */
export function allMatches(fixture: Fixture): readonly FixtureMatch[] {
  return fixture.rounds.flatMap((round) => round.matches);
}
