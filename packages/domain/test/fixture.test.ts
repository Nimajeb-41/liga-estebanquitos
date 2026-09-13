import { describe, expect, it } from 'vitest';

import { generateFixture } from '../src/fixture/round-robin.ts';
import { allMatches, type Fixture } from '../src/fixture/types.ts';
import { homeCountsByLeg, validateFixture } from '../src/fixture/validate.ts';
import { expectDomainError } from './helpers.ts';

const TEN = Array.from({ length: 10 }, (_, index) => `p${index + 1}`);
const SEED = 'liga-estabanquitos-2026-1';

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

describe('generateFixture — formato de la Liga Estabanquitos (10 jugadores, ida y vuelta)', () => {
  const fixture = generateFixture(TEN, { seed: SEED });

  it('genera 18 jornadas', () => {
    expect(fixture.rounds).toHaveLength(18);
  });

  it('genera 5 partidos por jornada', () => {
    for (const round of fixture.rounds) {
      expect(round.matches).toHaveLength(5);
    }
  });

  it('genera 90 partidos en total', () => {
    expect(allMatches(fixture)).toHaveLength(90);
  });

  it('hace que cada jugador dispute 18 partidos', () => {
    const counts = new Map<string, number>();
    for (const match of allMatches(fixture)) {
      counts.set(match.homeId, (counts.get(match.homeId) ?? 0) + 1);
      counts.set(match.awayId, (counts.get(match.awayId) ?? 0) + 1);
    }
    expect([...counts.values()]).toEqual(Array.from({ length: 10 }, () => 18));
  });

  it('enfrenta a cada pareja exactamente dos veces', () => {
    const counts = new Map<string, number>();
    for (const match of allMatches(fixture)) {
      const key = pairKey(match.homeId, match.awayId);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(45); // C(10,2)
    for (const count of counts.values()) expect(count).toBe(2);
  });

  it('hace jugar a cada participante exactamente una vez por jornada', () => {
    for (const round of fixture.rounds) {
      const seen = round.matches.flatMap((match) => [match.homeId, match.awayId]);
      expect(new Set(seen).size).toBe(10);
      expect(seen).toHaveLength(10);
    }
  });

  it('separa ida (jornadas 1-9) y vuelta (jornadas 10-18)', () => {
    const first = fixture.rounds.filter((round) => round.leg === 1);
    const second = fixture.rounds.filter((round) => round.leg === 2);
    expect(first.map((round) => round.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(second.map((round) => round.number)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it('invierte local y visitante en la vuelta', () => {
    const firstLeg = fixture.rounds.filter((round) => round.leg === 1);
    const secondLeg = fixture.rounds.filter((round) => round.leg === 2);

    firstLeg.forEach((round, index) => {
      const mirror = secondLeg[index];
      expect(mirror).toBeDefined();
      round.matches.forEach((match, position) => {
        const mirrored = mirror?.matches[position];
        expect(mirrored?.homeId).toBe(match.awayId);
        expect(mirrored?.awayId).toBe(match.homeId);
      });
    });
  });

  it('no repite ningun enfrentamiento con la misma condicion de local', () => {
    const oriented = allMatches(fixture).map((match) => `${match.homeId}>${match.awayId}`);
    expect(new Set(oriented).size).toBe(90);
  });

  it('nunca empareja a un jugador consigo mismo', () => {
    for (const match of allMatches(fixture)) {
      expect(match.homeId).not.toBe(match.awayId);
    }
  });

  it('pasa la validacion automatica sin incumplimientos', () => {
    expect(validateFixture(fixture, TEN)).toEqual([]);
  });

  it('reparte los partidos como local de forma equilibrada en cada vuelta', () => {
    const byLeg = homeCountsByLeg(fixture);
    for (const leg of [1, 2]) {
      const counts = byLeg.get(leg);
      expect(counts).toBeDefined();
      for (const count of (counts as Map<string, number>).values()) {
        expect(count).toBeGreaterThanOrEqual(4);
        expect(count).toBeLessThanOrEqual(5);
      }
    }
  });

  it('deja a cada jugador con 9 partidos como local y 9 como visitante en total', () => {
    const home = new Map<string, number>();
    const away = new Map<string, number>();
    for (const match of allMatches(fixture)) {
      home.set(match.homeId, (home.get(match.homeId) ?? 0) + 1);
      away.set(match.awayId, (away.get(match.awayId) ?? 0) + 1);
    }
    for (const playerId of TEN) {
      expect(home.get(playerId)).toBe(9);
      expect(away.get(playerId)).toBe(9);
    }
  });
});

describe('generateFixture — reproducibilidad', () => {
  it('produce el mismo calendario con la misma semilla', () => {
    const a = generateFixture(TEN, { seed: SEED });
    const b = generateFixture(TEN, { seed: SEED });
    expect(b).toEqual(a);
  });

  it('produce calendarios distintos con semillas distintas', () => {
    const a = generateFixture(TEN, { seed: 'sorteo-a' });
    const b = generateFixture(TEN, { seed: 'sorteo-b' });
    expect(b.playerIds).not.toEqual(a.playerIds);
  });

  it('guarda la semilla dentro del fixture', () => {
    expect(generateFixture(TEN, { seed: SEED }).seed).toBe(SEED);
  });

  it('genera una semilla cuando no se indica ninguna', () => {
    expect(generateFixture(TEN).seed.length).toBeGreaterThan(0);
  });

  it('respeta el orden dado cuando se desactiva el barajado', () => {
    expect(generateFixture(TEN, { seed: SEED, shufflePlayers: false }).playerIds).toEqual(TEN);
  });
});

describe('generateFixture — otros tamanos y errores', () => {
  it.each([4, 6, 8, 12, 16])('es valido para %i participantes', (size) => {
    const ids = Array.from({ length: size }, (_, index) => `j${index + 1}`);
    const fixture = generateFixture(ids, { seed: `seed-${size}` });
    expect(fixture.rounds).toHaveLength((size - 1) * 2);
    expect(allMatches(fixture)).toHaveLength(size * (size - 1));
    expect(validateFixture(fixture, ids)).toEqual([]);
  });

  it('genera solo la ida cuando legs = 1', () => {
    const fixture = generateFixture(TEN, { seed: SEED, legs: 1 });
    expect(fixture.rounds).toHaveLength(9);
    expect(allMatches(fixture)).toHaveLength(45);
    expect(validateFixture(fixture, TEN)).toEqual([]);
  });

  it('rechaza un numero impar de participantes', () => {
    expectDomainError(() => generateFixture(TEN.slice(0, 9)), 'ODD_PLAYER_COUNT');
  });

  it('rechaza menos de dos participantes', () => {
    expectDomainError(() => generateFixture(['solo']), 'NOT_ENOUGH_PLAYERS');
  });

  it('rechaza participantes repetidos', () => {
    expectDomainError(() => generateFixture(['a', 'b', 'c', 'a']), 'DUPLICATE_PLAYER_ID');
  });

  it('rechaza un numero de vueltas no soportado', () => {
    expectDomainError(() => generateFixture(TEN, { legs: 3 }), 'INVALID_SETTINGS');
  });
});

describe('validateFixture — detecta calendarios corruptos', () => {
  const valid = generateFixture(TEN, { seed: SEED });

  function corrupt(mutate: (fixture: Fixture) => Fixture): ReturnType<typeof validateFixture> {
    return validateFixture(mutate(structuredClone(valid) as Fixture), TEN);
  }

  it('detecta una jornada con partidos de menos', () => {
    const violations = corrupt((fixture) => ({
      ...fixture,
      rounds: fixture.rounds.map((round, index) =>
        index === 0 ? { ...round, matches: round.matches.slice(0, 4) } : round,
      ),
    }));
    expect(violations.map((violation) => violation.code)).toContain('ROUND_SIZE');
  });

  it('detecta que falten jornadas', () => {
    const violations = corrupt((fixture) => ({ ...fixture, rounds: fixture.rounds.slice(0, 17) }));
    expect(violations.map((violation) => violation.code)).toContain('ROUND_COUNT');
  });

  it('detecta un jugador que juega dos veces en la misma jornada', () => {
    const violations = corrupt((fixture) => {
      const rounds = fixture.rounds.map((round, index) => {
        if (index !== 0) return round;
        const first = round.matches[0];
        const second = round.matches[1];
        if (first === undefined || second === undefined) return round;
        const matches = round.matches.slice();
        matches[1] = { ...second, homeId: first.homeId };
        return { ...round, matches };
      });
      return { ...fixture, rounds };
    });
    const codes = violations.map((violation) => violation.code);
    expect(codes).toContain('PLAYER_TWICE_IN_ROUND');
    expect(codes).toContain('PLAYER_MISSING_IN_ROUND');
  });

  it('detecta un enfrentamiento que no se repite el numero correcto de veces', () => {
    const violations = corrupt((fixture) => {
      const rounds = fixture.rounds.map((round, index) => {
        if (index !== 0) return round;
        const matches = round.matches.slice();
        const first = matches[0];
        if (first === undefined) return round;
        matches[0] = { ...first, awayId: first.homeId };
        return { ...round, matches };
      });
      return { ...fixture, rounds };
    });
    const codes = violations.map((violation) => violation.code);
    expect(codes).toContain('SELF_MATCH');
    expect(codes).toContain('PAIR_COUNT');
  });
});
