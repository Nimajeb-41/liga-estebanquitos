import { describe, expect, it } from 'vitest';

import { resolveResult } from '../src/results/result.ts';
import { createSanction, revokeSanction, type Sanction } from '../src/sanctions/sanction.ts';
import { buildStandings, type PlayedMatch } from '../src/standings/standings.ts';
import { DEFAULT_SETTINGS, type TournamentSettings } from '../src/tournament/settings.ts';
import type { TiebreakerId } from '../src/standings/tiebreakers.ts';
import { expectDomainError } from './helpers.ts';

const settings = DEFAULT_SETTINGS;

let matchCounter = 0;

function match(
  roundNumber: number,
  homeId: string,
  homeCrowns: number,
  awayCrowns: number,
  awayId: string,
  custom: TournamentSettings = settings,
): PlayedMatch {
  matchCounter += 1;
  return {
    id: `m${matchCounter}`,
    roundNumber,
    leg: roundNumber <= 3 ? 1 : 2,
    homeId,
    awayId,
    status: 'COMPLETED',
    result: resolveResult({ homeId, awayId }, { homeCrowns, awayCrowns }, custom),
  };
}

function sanction(playerId: string, points?: number, roundNumber?: number): Sanction {
  return createSanction(
    {
      id: `s-${playerId}-${points ?? 'def'}-${roundNumber ?? 0}`,
      playerId,
      type: 'BM',
      reason: 'Comportamiento antideportivo validado por el administrador',
      issuedByAdminId: 'admin-1',
      issuedAt: '2026-09-08T00:00:00.000Z',
      ...(points === undefined ? {} : { points }),
      ...(roundNumber === undefined ? {} : { roundNumber }),
    },
    settings,
  );
}

describe('estadisticas derivadas', () => {
  const matches = [
    match(1, 'a', 3, 0, 'b'), // a: victoria 3 coronas -> 4
    match(1, 'c', 2, 1, 'd'), // c: victoria normal -> 3
    match(2, 'a', 1, 2, 'c'), // c: victoria normal -> 3
    match(2, 'b', 3, 1, 'd'), // b: victoria 3 coronas -> 4
  ];

  const table = buildStandings({
    playerIds: ['a', 'b', 'c', 'd'],
    matches,
    sanctions: [],
    settings,
  });

  it('cuenta PJ, VG y VP', () => {
    const a = table.find((row) => row.playerId === 'a');
    expect(a?.played).toBe(2);
    expect(a?.wins).toBe(1);
    expect(a?.losses).toBe(1);
    expect(a?.draws).toBe(0);
  });

  it('calcula la diferencia de coronas', () => {
    const a = table.find((row) => row.playerId === 'a');
    expect(a?.crownsFor).toBe(4);
    expect(a?.crownsAgainst).toBe(2);
    expect(a?.crownDiff).toBe(2);

    const d = table.find((row) => row.playerId === 'd');
    expect(d?.crownsFor).toBe(2);
    expect(d?.crownsAgainst).toBe(5);
    expect(d?.crownDiff).toBe(-3);
  });

  it('acumula los puntos segun el tipo de victoria', () => {
    expect(table.find((row) => row.playerId === 'c')?.points).toBe(6);
    expect(table.find((row) => row.playerId === 'a')?.points).toBe(4);
    expect(table.find((row) => row.playerId === 'b')?.points).toBe(4);
    expect(table.find((row) => row.playerId === 'd')?.points).toBe(0);
  });

  it('cuenta las victorias por 3 coronas por separado', () => {
    expect(table.find((row) => row.playerId === 'a')?.maxCrownWins).toBe(1);
    expect(table.find((row) => row.playerId === 'c')?.maxCrownWins).toBe(0);
  });

  it('incluye a los jugadores que todavia no jugaron', () => {
    const empty = buildStandings({
      playerIds: ['a', 'b'],
      matches: [],
      sanctions: [],
      settings,
    });
    expect(empty).toHaveLength(2);
    expect(empty[0]?.played).toBe(0);
    expect(empty[0]?.points).toBe(0);
  });

  it('permite reconstruir la tabla tal como estaba en una jornada anterior', () => {
    const afterRoundOne = buildStandings({
      playerIds: ['a', 'b', 'c', 'd'],
      matches,
      sanctions: [],
      settings,
      upToRound: 1,
    });
    expect(afterRoundOne.find((row) => row.playerId === 'a')?.points).toBe(4);
    expect(afterRoundOne.find((row) => row.playerId === 'b')?.points).toBe(0);
    expect(afterRoundOne.find((row) => row.playerId === 'a')?.played).toBe(1);
  });

  it('vuelve a ser coherente si se elimina un resultado', () => {
    const withoutLast = buildStandings({
      playerIds: ['a', 'b', 'c', 'd'],
      matches: matches.slice(0, 3),
      sanctions: [],
      settings,
    });
    expect(withoutLast.find((row) => row.playerId === 'b')?.points).toBe(0);
    expect(withoutLast.find((row) => row.playerId === 'b')?.played).toBe(1);
  });
});

describe('sanciones', () => {
  const matches = [match(1, 'a', 3, 0, 'b')];

  it('aplica -2 por defecto sin tocar los puntos deportivos', () => {
    const table = buildStandings({
      playerIds: ['a', 'b'],
      matches,
      sanctions: [sanction('a')],
      settings,
    });
    const a = table.find((row) => row.playerId === 'a');
    expect(a?.matchPoints).toBe(4);
    expect(a?.sanctionPoints).toBe(-2);
    expect(a?.points).toBe(2);
    expect(a?.sanctionCount).toBe(1);
  });

  it('acumula varias sanciones', () => {
    const table = buildStandings({
      playerIds: ['a', 'b'],
      matches,
      sanctions: [sanction('a'), sanction('a', -3)],
      settings,
    });
    expect(table.find((row) => row.playerId === 'a')?.points).toBe(-1);
  });

  it('ignora las sanciones anuladas', () => {
    const revoked = revokeSanction(sanction('a'), 'admin-1', '2026-09-09T00:00:00.000Z', 'error');
    const table = buildStandings({
      playerIds: ['a', 'b'],
      matches,
      sanctions: [revoked],
      settings,
    });
    expect(table.find((row) => row.playerId === 'a')?.points).toBe(4);
    expect(table.find((row) => row.playerId === 'a')?.sanctionCount).toBe(0);
  });

  it('permite dejar negativa la puntuacion de un jugador', () => {
    const table = buildStandings({
      playerIds: ['a', 'b'],
      matches: [],
      sanctions: [sanction('a')],
      settings,
    });
    expect(table.find((row) => row.playerId === 'a')?.points).toBe(-2);
  });

  it('exige motivo, administrador y penalizacion no positiva', () => {
    expectDomainError(
      () =>
        createSanction(
          {
            id: 's1',
            playerId: 'a',
            type: 'BM',
            reason: '  ',
            issuedByAdminId: 'admin-1',
            issuedAt: '2026-09-08T00:00:00.000Z',
          },
          settings,
        ),
      'INVALID_SETTINGS',
    );
    expectDomainError(
      () =>
        createSanction(
          {
            id: 's2',
            playerId: 'a',
            type: 'BM',
            reason: 'motivo',
            issuedByAdminId: 'admin-1',
            issuedAt: '2026-09-08T00:00:00.000Z',
            points: 2,
          },
          settings,
        ),
      'INVALID_SETTINGS',
    );
  });
});

describe('orden y desempates', () => {
  it('ordena por puntos', () => {
    const table = buildStandings({
      playerIds: ['a', 'b', 'c', 'd'],
      matches: [match(1, 'a', 3, 0, 'b'), match(1, 'c', 2, 0, 'd')],
      sanctions: [],
      settings,
    });
    // a (4 pts) y c (3 pts) delante; entre los dos que no puntuaron manda la
    // diferencia de coronas: d cayo 0-2 y b cayo 0-3.
    expect(table.map((row) => row.playerId)).toEqual(['a', 'c', 'd', 'b']);
    expect(table.map((row) => row.position)).toEqual([1, 2, 3, 4]);
  });

  it('desempata por diferencia de coronas cuando hay los mismos puntos', () => {
    const table = buildStandings({
      playerIds: ['a', 'b', 'c', 'd'],
      matches: [match(1, 'a', 2, 1, 'b'), match(1, 'c', 2, 0, 'd')],
      sanctions: [],
      settings,
    });
    expect(table[0]?.playerId).toBe('c'); // +2 frente a +1
    expect(table[1]?.playerId).toBe('a');
  });

  it('desempata por enfrentamiento directo cuando puntos, DC y victorias coinciden', () => {
    // a y b ganan uno y pierden otro con el mismo balance global de coronas,
    // pero a gano el enfrentamiento directo.
    const chain: readonly TiebreakerId[] = ['POINTS', 'HEAD_TO_HEAD', 'CROWN_DIFF'];
    const table = buildStandings({
      playerIds: ['a', 'b'],
      matches: [match(1, 'a', 2, 1, 'b'), match(2, 'b', 2, 1, 'a')],
      sanctions: [],
      settings: { ...settings, tiebreakers: chain },
    });
    expect(table[0]?.points).toBe(table[1]?.points);
    expect(table.map((row) => row.playerId)).toEqual(['a', 'b']);
  });

  it('resuelve un triple empate con la mini-liga entre los implicados', () => {
    // a, b y c terminan con 6 puntos cada uno. Entre ellos: a gano sus dos
    // enfrentamientos, b gano uno y c ninguno, asi que la mini-liga ordena
    // a > b > c aunque la tabla general no los separe.
    const chain: readonly TiebreakerId[] = ['POINTS', 'HEAD_TO_HEAD'];
    const table = buildStandings({
      playerIds: ['a', 'b', 'c', 'd'],
      matches: [
        match(1, 'a', 2, 1, 'b'),
        match(1, 'a', 2, 1, 'c'),
        match(2, 'b', 2, 1, 'c'),
        match(2, 'b', 2, 1, 'd'),
        match(3, 'c', 2, 1, 'd'),
        match(3, 'c', 2, 1, 'd'),
      ],
      sanctions: [],
      settings: { ...settings, tiebreakers: chain },
    });
    expect(table.filter((row) => row.playerId !== 'd').every((row) => row.points === 6)).toBe(true);
    expect(table.map((row) => row.playerId)).toEqual(['a', 'b', 'c', 'd']);
    expect(table.map((row) => row.position)).toEqual([1, 2, 3, 4]);
    expect(table.some((row) => row.unresolvedTie)).toBe(false);
  });

  it('marca el empate que ningun criterio resuelve y comparte posicion', () => {
    const table = buildStandings({
      playerIds: ['a', 'b'],
      matches: [],
      sanctions: [],
      settings,
    });
    expect(table.map((row) => row.position)).toEqual([1, 1]);
    expect(table.every((row) => row.unresolvedTie)).toBe(true);
  });

  it('respeta el orden de criterios que configure el administrador', () => {
    const matches = [match(1, 'a', 3, 0, 'b'), match(2, 'b', 3, 0, 'c'), match(3, 'c', 3, 0, 'a')];
    const byCrowns = buildStandings({
      playerIds: ['a', 'b', 'c'],
      matches,
      sanctions: [sanction('a')],
      settings,
    });
    // Con sancion, a cae por debajo de b y c aunque su balance sea identico.
    expect(byCrowns[byCrowns.length - 1]?.playerId).toBe('a');

    const withoutSanctionCriteria = buildStandings({
      playerIds: ['a', 'b', 'c'],
      matches,
      sanctions: [],
      settings,
    });
    expect(withoutSanctionCriteria.every((row) => row.points === 4)).toBe(true);
  });
});
