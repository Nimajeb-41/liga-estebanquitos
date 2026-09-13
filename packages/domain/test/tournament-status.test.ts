import { describe, expect, it } from 'vitest';

import {
  allowedTransitions,
  assertCan,
  assertTransition,
  can,
  canTransition,
  isTerminal,
  TOURNAMENT_STATUSES,
  type TournamentStatus,
} from '../src/tournament/status.ts';
import { DEFAULT_SETTINGS, describeFormat, validateSettings } from '../src/tournament/settings.ts';
import { expectDomainError } from './helpers.ts';

describe('maquina de estados del torneo', () => {
  it('recorre el camino feliz completo', () => {
    const steps: ReadonlyArray<readonly [TournamentStatus, TournamentStatus]> = [
      ['DRAFT', 'REGISTRATION'],
      ['REGISTRATION', 'READY'],
      ['READY', 'SCHEDULED'],
      ['SCHEDULED', 'LIVE'],
      ['LIVE', 'FINISHED'],
    ];
    for (const [from, to] of steps) {
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it('no permite saltarse pasos', () => {
    expect(canTransition('DRAFT', 'LIVE')).toBe(false);
    expect(canTransition('REGISTRATION', 'SCHEDULED')).toBe(false);
    expect(canTransition('READY', 'LIVE')).toBe(false);
  });

  it('permite volver atras durante la preparacion', () => {
    expect(canTransition('REGISTRATION', 'DRAFT')).toBe(true);
    expect(canTransition('READY', 'REGISTRATION')).toBe(true);
    expect(canTransition('SCHEDULED', 'READY')).toBe(true);
  });

  it('no permite volver atras una vez empezada la competicion', () => {
    expect(canTransition('LIVE', 'SCHEDULED')).toBe(false);
    expect(canTransition('FINISHED', 'LIVE')).toBe(false);
  });

  it('trata FINISHED y CANCELLED como estados terminales', () => {
    expect(isTerminal('FINISHED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    for (const status of TOURNAMENT_STATUSES) {
      if (status !== 'FINISHED' && status !== 'CANCELLED') {
        expect(isTerminal(status)).toBe(false);
      }
    }
  });

  it('permite cancelar desde cualquier estado no terminal', () => {
    for (const status of TOURNAMENT_STATUSES) {
      if (isTerminal(status)) continue;
      expect(allowedTransitions(status)).toContain('CANCELLED');
    }
  });

  it('lanza INVALID_STATUS_TRANSITION en una transicion prohibida', () => {
    expectDomainError(() => assertTransition('DRAFT', 'FINISHED'), 'INVALID_STATUS_TRANSITION');
  });
});

describe('capacidades por estado', () => {
  it('solo deja tocar la plantilla antes de publicar el calendario', () => {
    expect(can('DRAFT', 'MANAGE_ROSTER')).toBe(true);
    expect(can('REGISTRATION', 'MANAGE_ROSTER')).toBe(true);
    expect(can('READY', 'MANAGE_ROSTER')).toBe(true);
    expect(can('SCHEDULED', 'MANAGE_ROSTER')).toBe(false);
    expect(can('LIVE', 'MANAGE_ROSTER')).toBe(false);
  });

  it('solo deja generar el fixture con la plantilla cerrada', () => {
    expect(can('REGISTRATION', 'GENERATE_FIXTURE')).toBe(false);
    expect(can('READY', 'GENERATE_FIXTURE')).toBe(true);
    expect(can('SCHEDULED', 'GENERATE_FIXTURE')).toBe(true);
    expect(can('LIVE', 'GENERATE_FIXTURE')).toBe(false);
  });

  it('solo deja cargar resultados con la competicion en juego', () => {
    expect(can('SCHEDULED', 'RECORD_RESULTS')).toBe(false);
    expect(can('LIVE', 'RECORD_RESULTS')).toBe(true);
    expect(can('FINISHED', 'RECORD_RESULTS')).toBe(false);
  });

  it('obliga a usar el mecanismo de sustitucion una vez publicado el calendario', () => {
    expect(can('SCHEDULED', 'REPLACE_PLAYER')).toBe(true);
    expect(can('LIVE', 'REPLACE_PLAYER')).toBe(true);
    expectDomainError(() => assertCan('LIVE', 'MANAGE_ROSTER'), 'OPERATION_NOT_ALLOWED_IN_STATUS');
  });
});

describe('configuracion del torneo', () => {
  it('describe el formato 10 jugadores / ida y vuelta', () => {
    expect(describeFormat(DEFAULT_SETTINGS)).toEqual({
      players: 10,
      legs: 2,
      rounds: 18,
      matchesPerRound: 5,
      totalMatches: 90,
      matchesPerPlayer: 18,
    });
  });

  it('acepta la configuracion por defecto', () => {
    expect(() => validateSettings(DEFAULT_SETTINGS)).not.toThrow();
  });

  it('rechaza un cupo impar', () => {
    expectDomainError(
      () => validateSettings({ ...DEFAULT_SETTINGS, rosterSize: 9 }),
      'INVALID_SETTINGS',
    );
  });

  it('rechaza una sancion positiva', () => {
    expectDomainError(
      () =>
        validateSettings({
          ...DEFAULT_SETTINGS,
          sanctions: { ...DEFAULT_SETTINGS.sanctions, defaultPoints: 2 },
        }),
      'INVALID_SETTINGS',
    );
  });

  it('rechaza criterios de desempate desconocidos o repetidos', () => {
    expectDomainError(
      () =>
        validateSettings({
          ...DEFAULT_SETTINGS,
          tiebreakers: ['POINTS', 'POINTS'],
        }),
      'INVALID_SETTINGS',
    );
  });

  it('deja los empates sin definir a proposito', () => {
    // El reglamento NO admite empates: un marcador igualado se rechaza.
    expect(DEFAULT_SETTINGS.scoring.draw).toBeNull();
  });

  it('tiene decidida la incomparecencia, y la version lo refleja', () => {
    expect(DEFAULT_SETTINGS.scoring.walkoverWin).toBe(3);
    expect(DEFAULT_SETTINGS.scoring.walkoverCrowns).toEqual([0, 0]);
    expect(DEFAULT_SETTINGS.rulesVersion).toBe('2026-1.2');
  });
});
