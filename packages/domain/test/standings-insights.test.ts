import { describe, expect, it } from 'vitest';

import {
  computeForm,
  DEFAULT_FORM_LENGTH,
  lastPlayedRound,
  positionChanges,
} from '../src/standings/insights.ts';
import { buildStandings, type PlayedMatch } from '../src/standings/standings.ts';
import { resolveResult } from '../src/results/result.ts';
import { DEFAULT_SETTINGS } from '../src/tournament/settings.ts';
import type { MatchStatus } from '../src/matches/status.ts';

const settings = DEFAULT_SETTINGS;

function match(
  id: string,
  roundNumber: number,
  homeId: string,
  homeCrowns: number,
  awayCrowns: number,
  awayId: string,
  status: MatchStatus = 'COMPLETED',
): PlayedMatch {
  return {
    id,
    roundNumber,
    leg: 1,
    homeId,
    awayId,
    status,
    result: resolveResult({ homeId, awayId }, { homeCrowns, awayCrowns }, settings),
  };
}

describe('forma reciente', () => {
  const matches = [
    match('m1', 1, 'a', 3, 0, 'b'),
    match('m2', 2, 'a', 2, 1, 'b'),
    match('m3', 3, 'b', 3, 1, 'a'),
    match('m4', 4, 'a', 3, 2, 'b'),
  ];

  it('devuelve los resultados del mas reciente al mas antiguo', () => {
    const forms = computeForm(['a', 'b'], matches);
    expect(forms.get('a')?.recent).toEqual(['W', 'L', 'W', 'W']);
    expect(forms.get('b')?.recent).toEqual(['L', 'W', 'L', 'L']);
  });

  it('recorta a los ultimos partidos configurados', () => {
    const forms = computeForm(['a', 'b'], matches, { limit: 2 });
    expect(forms.get('a')?.recent).toEqual(['W', 'L']);
    expect(DEFAULT_FORM_LENGTH).toBe(5);
  });

  it('calcula la racha en curso', () => {
    const forms = computeForm(['a', 'b'], matches);
    expect(forms.get('a')?.currentStreak).toEqual({ type: 'W', length: 1 });
    expect(forms.get('b')?.currentStreak).toEqual({ type: 'L', length: 1 });
  });

  it('calcula la mejor racha de victorias de la temporada', () => {
    const forms = computeForm(['a', 'b'], matches);
    expect(forms.get('a')?.bestWinStreak).toBe(2);
    expect(forms.get('b')?.bestWinStreak).toBe(1);
  });

  it('ignora los partidos que no cuentan para la clasificacion', () => {
    const withNoise = [
      ...matches,
      match('m5', 5, 'b', 3, 0, 'a', 'POSTPONED'),
      match('m6', 6, 'b', 3, 0, 'a', 'DISPUTED'),
    ];
    const forms = computeForm(['a', 'b'], withNoise);
    expect(forms.get('a')?.recent).toEqual(['W', 'L', 'W', 'W']);
  });

  it('devuelve forma vacia para quien no ha jugado', () => {
    const forms = computeForm(['a', 'b', 'c'], matches);
    expect(forms.get('c')).toEqual({
      playerId: 'c',
      recent: [],
      currentStreak: null,
      bestWinStreak: 0,
    });
  });

  it('es estable: mismo orden de entrada distinto, misma forma', () => {
    const shuffled = [matches[3], matches[0], matches[2], matches[1]] as PlayedMatch[];
    expect(computeForm(['a'], shuffled).get('a')?.recent).toEqual(
      computeForm(['a'], matches).get('a')?.recent,
    );
  });
});

describe('movimiento de posicion', () => {
  const base = { playerIds: ['a', 'b', 'c'], sanctions: [], settings };

  it('indica cuantos puestos gano o perdio cada jugador', () => {
    const previous = buildStandings({
      ...base,
      matches: [match('m1', 1, 'b', 3, 0, 'a')],
    });
    const current = buildStandings({
      ...base,
      matches: [match('m1', 1, 'b', 3, 0, 'a'), match('m2', 2, 'a', 3, 0, 'c')],
    });

    const changes = positionChanges(previous, current);
    // b lidera al principio; despues a le gana a c y le adelanta.
    expect(changes.get('a')).toBeGreaterThan(0);
    expect(changes.get('b')).toBeLessThanOrEqual(0);
  });

  it('devuelve null para quien no estaba en la tabla anterior', () => {
    const previous = buildStandings({ ...base, playerIds: ['a', 'b'], matches: [] });
    const current = buildStandings({ ...base, matches: [] });
    expect(positionChanges(previous, current).get('c')).toBeNull();
  });

  it('distingue "no se movio" (0) de "sin referencia" (null)', () => {
    const table = buildStandings({ ...base, matches: [match('m1', 1, 'a', 3, 0, 'b')] });
    const changes = positionChanges(table, table);
    expect(changes.get('a')).toBe(0);
    expect(changes.get('c')).toBe(0);
  });
});

describe('ultima jornada jugada', () => {
  it('devuelve la jornada mas alta con un partido completado', () => {
    expect(lastPlayedRound([match('m1', 1, 'a', 3, 0, 'b'), match('m2', 4, 'a', 3, 0, 'c')])).toBe(
      4,
    );
  });

  it('no cuenta los partidos aplazados', () => {
    expect(
      lastPlayedRound([
        match('m1', 1, 'a', 3, 0, 'b'),
        match('m2', 7, 'a', 3, 0, 'c', 'POSTPONED'),
      ]),
    ).toBe(1);
  });

  it('devuelve null si todavia no se jugo nada', () => {
    expect(lastPlayedRound([])).toBeNull();
  });
});
