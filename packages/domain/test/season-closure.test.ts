/**
 * ¿Se puede cerrar la temporada?
 *
 * Cerrar es la operación más definitiva del sistema: de `FINISHED` no se sale y
 * la tabla de ese momento queda como el resultado de la competición. Lo que se
 * prueba aquí es que el sistema sepa **enumerar** lo que queda sin resolver, y
 * que no decida qué hacer con ello: un partido sin jugar a estas alturas puede
 * ser un abandono (P-05), una incomparecencia sin declarar (R-09) o un
 * aplazamiento sin fecha (P-08), y ninguna de las tres está decidida aquí.
 */

import { describe, expect, it } from 'vitest';

import { seasonClosureReport, type ClosureMatch } from '../src/tournament/closure.ts';

const match = (id: string, status: ClosureMatch['status']): ClosureMatch => ({ id, status });

describe('informe de cierre de temporada', () => {
  it('una temporada con todo jugado se puede cerrar', () => {
    const report = seasonClosureReport([
      match('a', 'COMPLETED'),
      match('b', 'COMPLETED'),
      match('c', 'COMPLETED'),
    ]);

    expect(report.closeable).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.completed).toBe(3);
  });

  it('un partido cancelado no impide cerrar', () => {
    // Cancelar ya es una resolución: ese partido no se va a jugar y no cuenta
    // para nadie. Es justamente la diferencia con dejarlo pendiente.
    const report = seasonClosureReport([match('a', 'COMPLETED'), match('b', 'CANCELLED')]);

    expect(report.closeable).toBe(true);
    expect(report.cancelled).toBe(1);
  });

  for (const [status, code] of [
    ['SCHEDULED', 'MATCHES_NOT_PLAYED'],
    ['LIVE', 'MATCHES_LIVE'],
    ['POSTPONED', 'MATCHES_POSTPONED'],
    ['DISPUTED', 'MATCHES_DISPUTED'],
  ] as const) {
    it(`un partido ${status} impide cerrar, y dice cuál`, () => {
      const report = seasonClosureReport([match('a', 'COMPLETED'), match('zz', status)]);

      expect(report.closeable).toBe(false);
      const blocker = report.blockers.find((entry) => entry.code === code);
      expect(blocker).toBeDefined();
      expect(blocker?.count).toBe(1);
      // Los identificadores concretos: sin ellos el aviso no sirve de nada.
      expect(blocker?.matchIds).toEqual(['zz']);
    });
  }

  it('agrupa varios partidos del mismo motivo', () => {
    const report = seasonClosureReport([
      match('b', 'POSTPONED'),
      match('a', 'POSTPONED'),
      match('c', 'DISPUTED'),
    ]);

    const postponed = report.blockers.find((entry) => entry.code === 'MATCHES_POSTPONED');
    expect(postponed?.count).toBe(2);
    // Ordenados: el informe tiene que ser igual entre ejecuciones.
    expect(postponed?.matchIds).toEqual(['a', 'b']);
    expect(report.blockers).toHaveLength(2);
  });

  it('una temporada sin calendario no se cierra: no llegó a empezar', () => {
    const report = seasonClosureReport([]);

    expect(report.closeable).toBe(false);
    expect(report.blockers.map((entry) => entry.code)).toEqual(['NO_FIXTURE']);
  });

  it('no decide qué hacer con lo que queda', () => {
    // El informe enumera; no resuelve. Un partido sin jugar puede ser P-05,
    // R-09 o P-08, y esa decisión no es del código.
    const report = seasonClosureReport([match('a', 'SCHEDULED')]);

    expect(report.blockers[0]?.code).toBe('MATCHES_NOT_PLAYED');
    expect(report).not.toHaveProperty('resolution');
    expect(report).not.toHaveProperty('suggestedAction');
  });

  it('el informe es estable entre llamadas', () => {
    const matches = [match('c', 'DISPUTED'), match('a', 'POSTPONED'), match('b', 'SCHEDULED')];

    expect(seasonClosureReport(matches)).toEqual(seasonClosureReport([...matches].reverse()));
  });
});
