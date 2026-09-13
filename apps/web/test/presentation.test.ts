/**
 * Formatos y etiquetas. Son detalles pequeños que, mal hechos, hacen que un
 * número diga lo contrario de lo que pasó.
 */

import { describe, expect, it } from 'vitest';

import {
  countsForStandings,
  formatDate,
  formatDateTime,
  initials,
  isPending,
  legLabel,
  matchStatusLabel,
  percent,
  relativeFromNow,
  roundLabel,
  signed,
  tiebreakerLabel,
} from '../src/lib/presentation.ts';

describe('signed', () => {
  it('escribe el signo de una diferencia de coronas', () => {
    expect(signed(3)).toBe('+3');
    expect(signed(0)).toBe('0');
    // Signo menos tipográfico, no un guion.
    expect(signed(-2)).toBe('−2');
  });
});

describe('countsForStandings', () => {
  it('solo cuenta un partido finalizado', () => {
    expect(countsForStandings('COMPLETED')).toBe(true);
  });

  it('no cuenta lo aplazado, lo disputado ni lo cancelado', () => {
    expect(countsForStandings('POSTPONED')).toBe(false);
    expect(countsForStandings('DISPUTED')).toBe(false);
    expect(countsForStandings('CANCELLED')).toBe(false);
    expect(countsForStandings('SCHEDULED')).toBe(false);
    expect(countsForStandings('LIVE')).toBe(false);
  });
});

describe('isPending', () => {
  it('reconoce los estados sin marcador que enseñar', () => {
    expect(isPending('SCHEDULED')).toBe(true);
    expect(isPending('POSTPONED')).toBe(true);
    expect(isPending('COMPLETED')).toBe(false);
  });
});

describe('etiquetas', () => {
  it('usa el vocabulario del dominio, no uno propio', () => {
    expect(matchStatusLabel('POSTPONED')).toBe('Aplazado');
    expect(matchStatusLabel('DISPUTED')).toBe('En disputa');
  });

  it('numera las jornadas con dos cifras', () => {
    expect(roundLabel(1)).toBe('Jornada 01');
    expect(roundLabel(18)).toBe('Jornada 18');
  });

  it('distingue ida y vuelta', () => {
    expect(legLabel(1)).toBe('Ida');
    expect(legLabel(2)).toBe('Vuelta');
  });

  it('traduce los criterios de desempate y deja pasar los que no conoce', () => {
    expect(tiebreakerLabel('crownDiff')).toBe('Diferencia de coronas');
    expect(tiebreakerLabel('DESCONOCIDO')).toBe('DESCONOCIDO');
  });
});

describe('fechas', () => {
  it('dice «Sin fecha» en lugar de inventar una', () => {
    expect(formatDate(null)).toBe('Sin fecha');
    expect(formatDateTime(null)).toBe('Sin fecha');
    expect(formatDate('no es una fecha')).toBe('Sin fecha');
  });

  it('formatea una fecha real', () => {
    expect(formatDate('2026-10-08T22:00:00.000Z')).toMatch(/2026/);
  });

  it('cuenta cuánto hace que se actualizó un dato', () => {
    const now = new Date('2026-10-08T22:00:00.000Z');
    expect(relativeFromNow(new Date('2026-10-08T21:59:52.000Z'), now)).toMatch(/8/);
    expect(relativeFromNow(new Date('2026-10-08T21:57:00.000Z'), now)).toMatch(/3/);
  });
});

describe('percent', () => {
  it('convierte una proporción en porcentaje entero', () => {
    expect(percent(0)).toBe(0);
    expect(percent(0.075)).toBe(8);
    expect(percent(1)).toBe(100);
  });

  it('no se sale del rango aunque el dato venga raro', () => {
    expect(percent(-1)).toBe(0);
    expect(percent(4)).toBe(100);
  });
});

describe('initials', () => {
  it('saca como mucho dos letras del nombre', () => {
    expect(initials('Nimaben')).toBe('NI');
    expect(initials('TEST_PLAYER_01')).toBe('TP');
    expect(initials('Leon SB')).toBe('LS');
  });

  it('aguanta un nombre vacío', () => {
    expect(initials('   ')).toBe('??');
  });
});
