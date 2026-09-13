/**
 * Recorrido completo de la Liga Estabanquitos 2026-1, de 6 confirmados a
 * campeon. Este test es la respuesta ejecutable a las preguntas del criterio de
 * exito: como se pasa de 6 a 10, como se generan las 18 fechas, como se calcula
 * la tabla, como se sanciona y como se corrige un resultado.
 */

import { describe, expect, it } from 'vitest';

import { generateFixture } from '../src/fixture/round-robin.ts';
import { allMatches } from '../src/fixture/types.ts';
import { assertValidFixture } from '../src/fixture/validate.ts';
import { resolveResult } from '../src/results/result.ts';
import {
  addParticipant,
  assertRosterReady,
  confirmParticipant,
  confirmedParticipants,
  rosterSummary,
  type Roster,
} from '../src/roster/roster.ts';
import { createSanction } from '../src/sanctions/sanction.ts';
import { buildStandings, type PlayedMatch } from '../src/standings/standings.ts';
import { DEFAULT_SETTINGS, describeFormat } from '../src/tournament/settings.ts';
import { assertTransition, can } from '../src/tournament/status.ts';
import { expectDomainError, rosterOf, slug } from './helpers.ts';

const settings = DEFAULT_SETTINGS;
const CONFIRMED_TODAY = ['Nimaben', 'Lyuk', 'Dullys', 'Esteban', 'Eze23ml', 'LeonSB'];
const SEED = 'sorteo-oficial-2026-1';

/** Marcadores validos, sin empates (todavia no estan permitidos). */
const SCORES: ReadonlyArray<readonly [number, number]> = [
  [3, 0],
  [2, 1],
  [3, 2],
  [1, 0],
  [0, 3],
  [1, 2],
  [2, 3],
  [0, 1],
  [3, 1],
  [1, 3],
];

describe('de 6 confirmados a 10', () => {
  const roster = rosterOf(CONFIRMED_TODAY, settings);

  it('no permite cerrar la plantilla ni generar el fixture con 6', () => {
    expect(rosterSummary(roster, settings).confirmed).toBe(6);
    expectDomainError(() => assertRosterReady(roster, settings), 'ROSTER_INCOMPLETE');
    expect(can('REGISTRATION', 'GENERATE_FIXTURE')).toBe(false);
  });

  it('permite pasar a READY solo cuando hay exactamente 10 confirmados', () => {
    let full: Roster = roster;
    for (const name of ['Jugador 7', 'Jugador 8', 'Jugador 9']) {
      full = addParticipant(full, { id: slug(name), displayName: name }, settings);
      full = confirmParticipant(full, slug(name), settings);
    }
    expectDomainError(() => assertRosterReady(full, settings), 'ROSTER_INCOMPLETE');

    full = addParticipant(full, { id: 'jugador-10', displayName: 'Jugador 10' }, settings);
    full = confirmParticipant(full, 'jugador-10', settings);

    expect(() => assertRosterReady(full, settings)).not.toThrow();
    expect(() => assertTransition('REGISTRATION', 'READY')).not.toThrow();
  });
});

describe('temporada completa con 10 participantes', () => {
  const roster = rosterOf(
    [...CONFIRMED_TODAY, 'Jugador 7', 'Jugador 8', 'Jugador 9', 'Jugador 10'],
    settings,
  );
  const playerIds = confirmedParticipants(roster).map((participant) => participant.id);
  const fixture = generateFixture(playerIds, { seed: SEED });

  const played: PlayedMatch[] = allMatches(fixture).map((match, index) => {
    const score = SCORES[index % SCORES.length] as readonly [number, number];
    return {
      id: `r${match.roundNumber}-${match.order}`,
      roundNumber: match.roundNumber,
      leg: match.leg,
      homeId: match.homeId,
      awayId: match.awayId,
      status: 'COMPLETED',
      result: resolveResult(
        { homeId: match.homeId, awayId: match.awayId },
        { homeCrowns: score[0], awayCrowns: score[1] },
        settings,
      ),
    };
  });

  it('produce el calendario que describe el reglamento', () => {
    const format = describeFormat(settings);
    expect(fixture.rounds).toHaveLength(format.rounds);
    expect(played).toHaveLength(format.totalMatches);
    expect(() => assertValidFixture(fixture, playerIds)).not.toThrow();
  });

  it('recorre la maquina de estados hasta LIVE', () => {
    expect(() => {
      assertTransition('READY', 'SCHEDULED');
      assertTransition('SCHEDULED', 'LIVE');
    }).not.toThrow();
    expect(can('LIVE', 'RECORD_RESULTS')).toBe(true);
    expect(can('LIVE', 'MANAGE_ROSTER')).toBe(false);
  });

  const table = buildStandings({ playerIds, matches: played, sanctions: [], settings });

  it('deja a los 10 jugadores con 18 partidos disputados', () => {
    expect(table).toHaveLength(10);
    for (const row of table) expect(row.played).toBe(18);
    expect(table.reduce((total, row) => total + row.played, 0)).toBe(180);
  });

  it('cuadra las coronas: lo que unos hacen es lo que otros reciben', () => {
    const scored = table.reduce((total, row) => total + row.crownsFor, 0);
    const conceded = table.reduce((total, row) => total + row.crownsAgainst, 0);
    expect(scored).toBe(conceded);
    expect(table.reduce((total, row) => total + row.crownDiff, 0)).toBe(0);
  });

  it('reparte los puntos que corresponden a cada tipo de victoria', () => {
    const expected = played.reduce(
      (total, match) => total + (match.result.victoryType === 'MAX_CROWNS' ? 4 : 3),
      0,
    );
    expect(table.reduce((total, row) => total + row.points, 0)).toBe(expected);
    for (const row of table) expect(row.wins + row.losses + row.draws).toBe(18);
  });

  it('numera las posiciones de 1 a 10', () => {
    expect(table.map((row) => row.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(table.every((row) => !row.unresolvedTie)).toBe(true);
  });

  it('cambia la clasificacion al registrar una sancion por BM', () => {
    const leader = table[0];
    expect(leader).toBeDefined();
    const penalised = buildStandings({
      playerIds,
      matches: played,
      sanctions: [
        createSanction(
          {
            id: 'san-1',
            playerId: (leader as { playerId: string }).playerId,
            type: 'BM',
            reason: 'BM validado por el administrador tras revisar la evidencia',
            issuedByAdminId: 'admin-1',
            issuedAt: '2026-10-01T20:00:00.000Z',
            roundNumber: 5,
          },
          settings,
        ),
      ],
      settings,
    });
    const after = penalised.find((row) => row.playerId === leader?.playerId);
    expect(after?.matchPoints).toBe(leader?.matchPoints);
    expect(after?.points).toBe((leader?.points ?? 0) - 2);
    expect(after?.sanctionPoints).toBe(-2);
  });

  it('rehace la tabla al corregir un resultado ya cargado', () => {
    const target = played[0] as PlayedMatch;
    const corrected: PlayedMatch[] = played.map((match, index) =>
      index === 0
        ? {
            ...match,
            result: resolveResult(
              { homeId: match.homeId, awayId: match.awayId },
              { homeCrowns: 0, awayCrowns: 3 },
              settings,
            ),
          }
        : match,
    );
    const before = table.find((row) => row.playerId === target.homeId);
    const after = buildStandings({
      playerIds,
      matches: corrected,
      sanctions: [],
      settings,
    }).find((row) => row.playerId === target.homeId);

    // El local pasa de ganar 3-0 (4 puntos) a perder 0-3.
    expect(before?.points).toBe((after?.points ?? 0) + 4);
    expect(after?.crownDiff).toBe((before?.crownDiff ?? 0) - 6);
    expect(after?.played).toBe(18);
  });
});
