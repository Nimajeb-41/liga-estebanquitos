/**
 * Evolucion, cara a cara y records.
 *
 * Todo se deriva de los mismos partidos que la tabla. Lo que se fija aqui es
 * que se deriven igual: si la evolucion de la ultima jornada no coincidiera con
 * la clasificacion, una de las dos estaria mintiendo.
 */

import { describe, expect, it } from 'vitest';

import { resolveResult } from '../src/results/result.ts';
import { headToHead, seasonRecords, standingsHistory } from '../src/standings/history.ts';
import { buildStandings, type PlayedMatch } from '../src/standings/standings.ts';
import { DEFAULT_SETTINGS } from '../src/tournament/settings.ts';

const settings = DEFAULT_SETTINGS;
const players = ['a', 'b', 'c', 'd'];

let counter = 0;

function match(
  roundNumber: number,
  homeId: string,
  homeCrowns: number,
  awayCrowns: number,
  awayId: string,
): PlayedMatch {
  counter += 1;
  return {
    id: `m${counter}`,
    roundNumber,
    leg: roundNumber <= 3 ? 1 : 2,
    homeId,
    awayId,
    status: 'COMPLETED',
    result: resolveResult({ homeId, awayId }, { homeCrowns, awayCrowns }, settings),
  };
}

function walkover(roundNumber: number, homeId: string, awayId: string): PlayedMatch {
  counter += 1;
  return {
    id: `w${counter}`,
    roundNumber,
    leg: 1,
    homeId,
    awayId,
    status: 'COMPLETED',
    result: resolveResult(
      { homeId, awayId },
      { homeCrowns: 0, awayCrowns: 0, resolution: 'WALKOVER', absentPlayerId: awayId },
      settings,
    ),
  };
}

const matches = [
  match(1, 'a', 3, 0, 'b'),
  match(1, 'c', 2, 1, 'd'),
  match(2, 'a', 1, 2, 'c'),
  match(2, 'b', 3, 1, 'd'),
  match(3, 'a', 2, 0, 'd'),
  match(3, 'b', 0, 1, 'c'),
];

describe('evolucion por jornada', () => {
  it('la ultima jornada coincide con la clasificacion actual', () => {
    const history = standingsHistory({ playerIds: players, matches, sanctions: [], settings });
    const table = buildStandings({ playerIds: players, matches, sanctions: [], settings });

    for (const row of table) {
      const series = history.players.find((entry) => entry.playerId === row.playerId);
      const last = series?.points[series.points.length - 1];
      expect(last?.position).toBe(row.position);
      expect(last?.points).toBe(row.points);
    }
  });

  it('solo hay punto en las jornadas en las que se jugo algo', () => {
    // Una jornada entera aplazada repetiria el punto anterior y sugeriria que
    // paso algo cuando no paso nada.
    const conHueco = [match(1, 'a', 3, 0, 'b'), match(7, 'c', 2, 1, 'd')];
    const history = standingsHistory({
      playerIds: players,
      matches: conHueco,
      sanctions: [],
      settings,
    });

    expect(history.rounds).toEqual([1, 7]);
  });

  it('sin nada jugado no inventa una tabla inicial', () => {
    const history = standingsHistory({ playerIds: players, matches: [], sanctions: [], settings });

    expect(history.rounds).toEqual([]);
    expect(history.players.every((entry) => entry.points.length === 0)).toBe(true);
  });

  it('cada jornada acumula lo anterior, no solo lo suyo', () => {
    const history = standingsHistory({ playerIds: players, matches, sanctions: [], settings });
    const c = history.players.find((entry) => entry.playerId === 'c');

    expect(c?.points.map((point) => point.played)).toEqual([1, 2, 3]);
    // Los puntos nunca bajan al avanzar: se acumulan.
    const puntos = c?.points.map((point) => point.points) ?? [];
    for (let index = 1; index < puntos.length; index += 1) {
      expect(puntos[index]!).toBeGreaterThanOrEqual(puntos[index - 1]!);
    }
  });
});

describe('cara a cara', () => {
  it('cuenta victorias y coronas desde la perspectiva de cada uno', () => {
    const entre = [match(1, 'a', 3, 0, 'b'), match(4, 'b', 2, 1, 'a')];
    const record = headToHead(entre, 'a', 'b');

    expect(record.played).toBe(2);
    expect(record.winsA).toBe(1);
    expect(record.winsB).toBe(1);
    // Coronas de 'a': 3 en el primero (local) y 1 en el segundo (visitante).
    expect(record.crownsA).toBe(4);
    expect(record.crownsB).toBe(2);
    expect(record.leaderId).toBeNull();
  });

  it('no mezcla partidos de terceros', () => {
    const record = headToHead(matches, 'a', 'b');

    expect(record.played).toBe(1);
    expect(record.matches[0]?.matchId).toBe(matches[0]?.id);
  });

  it('marca la incomparecencia en vez de dar un marcador', () => {
    const record = headToHead([walkover(5, 'a', 'b')], 'a', 'b');

    expect(record.matches[0]?.walkover).toBe(true);
    expect(record.winsA).toBe(1);
    // Sin coronas: no hubo batalla que contar.
    expect(record.crownsA).toBe(0);
    expect(record.crownsB).toBe(0);
  });

  it('sin enfrentamientos devuelve ceros, no un error', () => {
    const record = headToHead(matches, 'a', 'z');

    expect(record.played).toBe(0);
    expect(record.leaderId).toBeNull();
  });
});

describe('records de temporada', () => {
  const streaks = new Map([
    ['a', 3],
    ['b', 1],
    ['c', 3],
    ['d', 0],
  ]);
  const maxCrowns = new Map([
    ['a', 1],
    ['b', 1],
    ['c', 0],
    ['d', 0],
  ]);

  it('la mayor diferencia sale de un partido concreto', () => {
    const records = seasonRecords(matches, streaks, maxCrowns);
    const biggest = records.find((record) => record.code === 'BIGGEST_WIN');

    expect(biggest?.value).toBe(3);
    expect(biggest?.playerIds).toEqual(['a']);
    expect(biggest?.roundNumber).toBe(1);
  });

  it('una incomparecencia no puede ser la mayor goleada', () => {
    // Su resultado no es un marcador: es la ausencia de uno.
    const conWalkover = [...matches, walkover(4, 'd', 'b')];
    const records = seasonRecords(conWalkover, streaks, maxCrowns);
    const biggest = records.find((record) => record.code === 'BIGGEST_WIN');

    expect(biggest?.value).toBe(3);
    expect(biggest?.playerIds).toEqual(['a']);
  });

  it('un empate en el maximo nombra a todos', () => {
    const records = seasonRecords(matches, streaks, maxCrowns);
    const streak = records.find((record) => record.code === 'LONGEST_WIN_STREAK');

    expect(streak?.value).toBe(3);
    expect(streak?.playerIds).toEqual(['a', 'c']);
  });

  it('sin datos devuelve null, no cero', () => {
    // Cero significaria «se midio y salio cero», que es otra cosa.
    const records = seasonRecords([], new Map(), new Map());

    for (const record of records) {
      expect(record.value).toBeNull();
      expect(record.playerIds).toEqual([]);
    }
  });
});
