/**
 * Validacion automatica del fixture.
 *
 * El generador es solo la mitad del trabajo: antes de publicar un calendario
 * oficial se comprueban todas las invariantes. `validateFixture` devuelve la
 * lista completa de incumplimientos (util para mostrarlos en el panel de
 * administracion) y `assertValidFixture` lanza si hay alguno.
 */

import { DomainError } from '../errors.ts';
import type { PlayerId } from '../roster/participant.ts';
import { allMatches, type Fixture } from './types.ts';

export const FIXTURE_VIOLATION_CODES = [
  'ROUND_COUNT',
  'ROUND_NUMBERING',
  'LEG_ASSIGNMENT',
  'ROUND_SIZE',
  'TOTAL_MATCHES',
  'SELF_MATCH',
  'UNKNOWN_PLAYER',
  'PLAYER_TWICE_IN_ROUND',
  'PLAYER_MISSING_IN_ROUND',
  'PAIR_COUNT',
  'DUPLICATED_ORIENTED_PAIR',
  'MATCHES_PER_PLAYER',
] as const;

export type FixtureViolationCode = (typeof FIXTURE_VIOLATION_CODES)[number];

export interface FixtureViolation {
  readonly code: FixtureViolationCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

function pairKey(a: PlayerId, b: PlayerId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function validateFixture(
  fixture: Fixture,
  expectedPlayerIds: readonly PlayerId[],
): FixtureViolation[] {
  const violations: FixtureViolation[] = [];
  const players = new Set(expectedPlayerIds);
  const size = players.size;
  const expectedRounds = (size - 1) * fixture.legs;
  const expectedMatchesPerRound = size / 2;
  const expectedTotal = expectedRounds * expectedMatchesPerRound;

  if (fixture.rounds.length !== expectedRounds) {
    violations.push({
      code: 'ROUND_COUNT',
      message: `Se esperaban ${expectedRounds} jornadas y hay ${fixture.rounds.length}.`,
      details: { expected: expectedRounds, actual: fixture.rounds.length },
    });
  }

  const matches = allMatches(fixture);
  if (matches.length !== expectedTotal) {
    violations.push({
      code: 'TOTAL_MATCHES',
      message: `Se esperaban ${expectedTotal} partidos y hay ${matches.length}.`,
      details: { expected: expectedTotal, actual: matches.length },
    });
  }

  const roundsPerLeg = size - 1;
  fixture.rounds.forEach((round, index) => {
    if (round.number !== index + 1) {
      violations.push({
        code: 'ROUND_NUMBERING',
        message: `La jornada en la posicion ${index + 1} esta numerada como ${round.number}.`,
        details: { expected: index + 1, actual: round.number },
      });
    }

    const expectedLeg = Math.floor(index / roundsPerLeg) + 1;
    if (round.leg !== expectedLeg) {
      violations.push({
        code: 'LEG_ASSIGNMENT',
        message: `La jornada ${round.number} deberia pertenecer a la vuelta ${expectedLeg} y figura como ${round.leg}.`,
        details: { round: round.number, expected: expectedLeg, actual: round.leg },
      });
    }

    if (round.matches.length !== expectedMatchesPerRound) {
      violations.push({
        code: 'ROUND_SIZE',
        message: `La jornada ${round.number} tiene ${round.matches.length} partidos y deberia tener ${expectedMatchesPerRound}.`,
        details: { round: round.number, actual: round.matches.length },
      });
    }

    const seen = new Map<PlayerId, number>();
    for (const match of round.matches) {
      if (match.homeId === match.awayId) {
        violations.push({
          code: 'SELF_MATCH',
          message: `En la jornada ${round.number} un jugador se enfrenta a si mismo (${match.homeId}).`,
          details: { round: round.number, playerId: match.homeId },
        });
      }
      for (const playerId of [match.homeId, match.awayId]) {
        if (!players.has(playerId)) {
          violations.push({
            code: 'UNKNOWN_PLAYER',
            message: `La jornada ${round.number} incluye a ${playerId}, que no esta en la plantilla.`,
            details: { round: round.number, playerId },
          });
        }
        seen.set(playerId, (seen.get(playerId) ?? 0) + 1);
      }
    }

    for (const [playerId, times] of seen) {
      if (times > 1) {
        violations.push({
          code: 'PLAYER_TWICE_IN_ROUND',
          message: `${playerId} juega ${times} veces en la jornada ${round.number}.`,
          details: { round: round.number, playerId, times },
        });
      }
    }
    for (const playerId of players) {
      if (!seen.has(playerId)) {
        violations.push({
          code: 'PLAYER_MISSING_IN_ROUND',
          message: `${playerId} no juega en la jornada ${round.number}.`,
          details: { round: round.number, playerId },
        });
      }
    }
  });

  const pairCounts = new Map<string, number>();
  const orientedCounts = new Map<string, number>();
  const perPlayer = new Map<PlayerId, number>();

  for (const match of matches) {
    const key = pairKey(match.homeId, match.awayId);
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    const oriented = `${match.homeId}>${match.awayId}`;
    orientedCounts.set(oriented, (orientedCounts.get(oriented) ?? 0) + 1);
    perPlayer.set(match.homeId, (perPlayer.get(match.homeId) ?? 0) + 1);
    perPlayer.set(match.awayId, (perPlayer.get(match.awayId) ?? 0) + 1);
  }

  const playerList = [...players];
  for (let i = 0; i < playerList.length; i += 1) {
    for (let j = i + 1; j < playerList.length; j += 1) {
      const a = playerList[i] as PlayerId;
      const b = playerList[j] as PlayerId;
      const count = pairCounts.get(pairKey(a, b)) ?? 0;
      if (count !== fixture.legs) {
        violations.push({
          code: 'PAIR_COUNT',
          message: `${a} y ${b} se enfrentan ${count} veces y deberian enfrentarse ${fixture.legs}.`,
          details: { a, b, expected: fixture.legs, actual: count },
        });
      }
    }
  }

  if (fixture.legs === 2) {
    for (const [oriented, count] of orientedCounts) {
      if (count !== 1) {
        violations.push({
          code: 'DUPLICATED_ORIENTED_PAIR',
          message: `El enfrentamiento ${oriented} (mismo local y mismo visitante) aparece ${count} veces; con ida y vuelta debe aparecer una sola vez.`,
          details: { oriented, count },
        });
      }
    }
  }

  const expectedPerPlayer = (size - 1) * fixture.legs;
  for (const playerId of players) {
    const played = perPlayer.get(playerId) ?? 0;
    if (played !== expectedPerPlayer) {
      violations.push({
        code: 'MATCHES_PER_PLAYER',
        message: `${playerId} tiene ${played} partidos y deberia tener ${expectedPerPlayer}.`,
        details: { playerId, expected: expectedPerPlayer, actual: played },
      });
    }
  }

  return violations;
}

export function assertValidFixture(fixture: Fixture, expectedPlayerIds: readonly PlayerId[]): void {
  const violations = validateFixture(fixture, expectedPlayerIds);
  if (violations.length > 0) {
    throw new DomainError(
      'INVALID_FIXTURE',
      `El fixture no es valido: ${violations.length} incumplimiento(s). ${violations[0]?.message ?? ''}`,
      { violations },
    );
  }
}

/** Partidos como local de cada jugador, por vuelta. Util para auditar el reparto. */
export function homeCountsByLeg(fixture: Fixture): Map<number, Map<PlayerId, number>> {
  const byLeg = new Map<number, Map<PlayerId, number>>();
  for (const round of fixture.rounds) {
    const counts = byLeg.get(round.leg) ?? new Map<PlayerId, number>();
    for (const match of round.matches) {
      counts.set(match.homeId, (counts.get(match.homeId) ?? 0) + 1);
      if (!counts.has(match.awayId)) counts.set(match.awayId, counts.get(match.awayId) ?? 0);
    }
    byLeg.set(round.leg, counts);
  }
  return byLeg;
}
