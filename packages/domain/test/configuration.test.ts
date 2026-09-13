/**
 * Qué se puede cambiar del reglamento, y cuándo.
 *
 * La clasificación se deriva: cambiar `scoring.win` reescribe la tabla hacia
 * atrás, incluidas las jornadas ya jugadas. Eso es deseable —corregir un error
 * de configuración no obliga a tocar históricos— y a la vez el riesgo más
 * silencioso del sistema. Lo que se prueba aquí son las dos barreras que lo
 * hacen manejable.
 */

import { describe, expect, it } from 'vitest';

import { assertSettingsChangeAllowed, nextRulesVersion } from '../src/tournament/configuration.ts';
import { expectDomainError } from './helpers.ts';

describe('cambios de configuración', () => {
  it('antes del calendario se puede cambiar el formato', () => {
    for (const status of ['DRAFT', 'REGISTRATION', 'READY'] as const) {
      const verdict = assertSettingsChangeAllowed(status, ['rosterSize', 'legs']);
      expect(verdict.allowed).toEqual(['rosterSize', 'legs']);
      // El formato no repuntúa nada: todavía no hay nada jugado.
      expect(verdict.recalculatesStandings).toBe(false);
    }
  });

  it('con calendario generado el formato queda fijado', () => {
    for (const status of ['SCHEDULED', 'LIVE'] as const) {
      const error = expectDomainError(
        () => assertSettingsChangeAllowed(status, ['rosterSize']),
        'SETTINGS_LOCKED_BY_FIXTURE',
      );
      // Dice cuál, no un «no se puede» a secas.
      expect(error.details['blocked']).toEqual(['rosterSize']);
    }
  });

  it('la puntuación sí se puede cambiar en marcha, y lo avisa', () => {
    const verdict = assertSettingsChangeAllowed('LIVE', ['scoring']);

    expect(verdict.recalculatesStandings).toBe(true);
  });

  it('los plazos no recalculan nada de lo jugado', () => {
    const verdict = assertSettingsChangeAllowed('LIVE', ['disputes', 'noShow']);

    expect(verdict.recalculatesStandings).toBe(false);
  });

  it('un cambio mixto se rechaza entero, no a medias', () => {
    // Aplicar «lo que se pueda» dejaría una configuración que nadie pidió.
    expectDomainError(
      () => assertSettingsChangeAllowed('LIVE', ['scoring', 'rosterSize']),
      'SETTINGS_LOCKED_BY_FIXTURE',
    );
  });

  for (const status of ['FINISHED', 'CANCELLED'] as const) {
    it(`el reglamento de un torneo ${status} es historia`, () => {
      expectDomainError(
        () => assertSettingsChangeAllowed(status, ['disputes']),
        'OPERATION_NOT_ALLOWED_IN_STATUS',
      );
    });
  }
});

describe('versión del reglamento', () => {
  it('sube el último número', () => {
    expect(nextRulesVersion('2026-1.2')).toBe('2026-1.3');
    expect(nextRulesVersion('2026-1.9')).toBe('2026-1.10');
  });

  it('una versión sin número se amplía en vez de inventarse un formato', () => {
    // Es preferible una versión fea a dos tablas distintas con la misma
    // etiqueta.
    expect(nextRulesVersion('provisional')).toBe('provisional.1');
    // `2026-1` es «temporada 1 de 2026»: subirlo a `2026-2` diría otra
    // temporada, no otra revisión de sus reglas.
    expect(nextRulesVersion('2026-1')).toBe('2026-1.1');
  });

  it('nunca devuelve la misma versión', () => {
    for (const version of ['2026-1.2', 'provisional', 'a.b.9', '1']) {
      expect(nextRulesVersion(version)).not.toBe(version);
    }
  });
});
