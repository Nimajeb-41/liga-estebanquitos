/**
 * Generador de fixture round-robin (metodo del circulo / Berger).
 *
 * Con N participantes (N par):
 *   - la ida tiene N-1 jornadas de N/2 partidos,
 *   - la vuelta repite la ida invirtiendo local y visitante,
 *   - cada jugador juega exactamente una vez por jornada,
 *   - cada pareja se enfrenta exactamente `legs` veces.
 *
 * Para N = 10 y 2 vueltas: 18 jornadas, 5 partidos por jornada, 90 partidos,
 * 18 partidos por jugador.
 *
 * El algoritmo fija al primer participante y rota a los demas. Para que el
 * jugador fijo no sea siempre local se invierte su emparejamiento en las
 * jornadas impares; el resto del reparto local/visitante lo equilibra la propia
 * rotacion. Sobre el total del torneo el equilibrio es exacto por construccion:
 * cada pareja juega una vez en cada condicion.
 */

import { DomainError } from '../errors.ts';
import type { PlayerId } from '../roster/participant.ts';
import { createRandom, createSeed, shuffle } from './random.ts';
import type { Fixture, FixtureMatch, FixtureRound } from './types.ts';

export interface GenerateFixtureOptions {
  /** Semilla del sorteo. Si no se indica se genera una y queda guardada. */
  readonly seed?: string;
  /** 1 = solo ida, 2 = ida y vuelta. Por defecto 2. */
  readonly legs?: number;
  /** Barajar a los participantes antes de emparejar. Por defecto true. */
  readonly shufflePlayers?: boolean;
}

function assertPlayableRoster(playerIds: readonly PlayerId[]): void {
  if (playerIds.length < 2) {
    throw new DomainError(
      'NOT_ENOUGH_PLAYERS',
      `Hacen falta al menos 2 participantes para generar un fixture; hay ${playerIds.length}.`,
      { count: playerIds.length },
    );
  }
  if (playerIds.length % 2 !== 0) {
    throw new DomainError(
      'ODD_PLAYER_COUNT',
      `El generador requiere un numero par de participantes; hay ${playerIds.length}. ` +
        'Con numero impar haria falta una jornada de descanso (bye), que este formato no contempla.',
      { count: playerIds.length },
    );
  }
  const unique = new Set(playerIds);
  if (unique.size !== playerIds.length) {
    throw new DomainError('DUPLICATE_PLAYER_ID', 'Hay participantes repetidos en la lista.', {
      count: playerIds.length,
      unique: unique.size,
    });
  }
}

/** Emparejamientos de la ida, sin decidir todavia local/visitante. */
function circleMethodPairings(playerIds: readonly PlayerId[]): PlayerId[][][] {
  const size = playerIds.length;
  const half = size / 2;
  const fixed = playerIds[0] as PlayerId;
  let rotating = playerIds.slice(1);

  const rounds: PlayerId[][][] = [];
  for (let round = 0; round < size - 1; round += 1) {
    const arrangement = [fixed, ...rotating];
    const pairs: PlayerId[][] = [];
    for (let i = 0; i < half; i += 1) {
      pairs.push([arrangement[i] as PlayerId, arrangement[size - 1 - i] as PlayerId]);
    }
    rounds.push(pairs);

    const last = rotating[rotating.length - 1] as PlayerId;
    rotating = [last, ...rotating.slice(0, rotating.length - 1)];
  }
  return rounds;
}

export function generateFixture(
  playerIds: readonly PlayerId[],
  options: GenerateFixtureOptions = {},
): Fixture {
  assertPlayableRoster(playerIds);

  const legs = options.legs ?? 2;
  if (!Number.isInteger(legs) || legs < 1 || legs > 2) {
    throw new DomainError('INVALID_SETTINGS', `legs debe ser 1 o 2; se recibio ${legs}.`, { legs });
  }

  const seed = options.seed ?? createSeed();
  const ordered =
    options.shufflePlayers === false ? playerIds.slice() : shuffle(playerIds, createRandom(seed));

  const pairings = circleMethodPairings(ordered);
  const roundsPerLeg = ordered.length - 1;
  const rounds: FixtureRound[] = [];

  for (let leg = 1; leg <= legs; leg += 1) {
    for (let index = 0; index < roundsPerLeg; index += 1) {
      const roundNumber = (leg - 1) * roundsPerLeg + index + 1;
      const pairs = pairings[index] as PlayerId[][];
      const matches: FixtureMatch[] = pairs.map((pair, position) => {
        const first = pair[0] as PlayerId;
        const second = pair[1] as PlayerId;
        // El jugador fijo (position 0) alterna condicion segun la paridad de la
        // jornada; en la vuelta se invierte todo.
        const firstIsHome = position === 0 ? index % 2 === 0 : true;
        const homeInFirstLeg = firstIsHome ? first : second;
        const awayInFirstLeg = firstIsHome ? second : first;
        const swap = leg === 2;
        return {
          roundNumber,
          leg,
          order: position + 1,
          homeId: swap ? awayInFirstLeg : homeInFirstLeg,
          awayId: swap ? homeInFirstLeg : awayInFirstLeg,
        };
      });
      rounds.push({ number: roundNumber, leg, matches });
    }
  }

  return {
    algorithm: 'CIRCLE_METHOD',
    seed,
    legs,
    playerIds: ordered,
    rounds,
  };
}
