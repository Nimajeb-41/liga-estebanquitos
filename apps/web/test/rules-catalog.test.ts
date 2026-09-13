/**
 * La página del reglamento lee `docs/pending-rules.md`. Si el documento cambia
 * de forma y el parser deja de entenderlo, la web presentaría las reglas mal, o
 * peor: una pendiente como si estuviera decidida. Estos tests lo evitan.
 */

import { describe, expect, it } from 'vitest';

import { parseRules, parseUpdatedAt, RULES } from '../src/lib/rules-catalog.ts';

describe('catálogo de reglas', () => {
  it('encuentra las nueve reglas decididas del documento real', () => {
    const decided = RULES.filter((rule) => rule.status === 'DECIDED').map((rule) => rule.id);

    // R-09 cerro P-01 (incomparecencias) el 10 de septiembre de 2026. Las
    // reglas salen del documento en el orden en que estan escritas.
    expect(decided).toEqual([
      'R-01',
      'R-02',
      'R-03',
      'R-09',
      'R-04',
      'R-05',
      'R-06',
      'R-07',
      'R-08',
    ]);
  });

  it('encuentra las diez reglas pendientes que siguen abiertas', () => {
    const pending = RULES.filter((rule) => rule.status === 'PENDING').map((rule) => rule.id);

    // P-01 ya no esta: se cerro como R-09.
    expect(pending).toEqual([
      'P-02',
      'P-03',
      'P-04',
      'P-05',
      'P-06',
      'P-07',
      'P-08',
      'P-09',
      'P-10',
      'P-11',
    ]);
  });

  it('ninguna pendiente se cuela como decidida', () => {
    for (const rule of RULES) {
      if (rule.id.startsWith('P-')) expect(rule.status).toBe('PENDING');
      if (rule.id.startsWith('R-')) expect(rule.status).toBe('DECIDED');
    }
  });

  it('agrupa las pendientes por urgencia', () => {
    const formato = RULES.find((rule) => rule.id === 'P-03');

    expect(formato?.group).toMatch(/bloqueantes/i);
  });

  it('recoge la fecha en la que se cerró una regla', () => {
    const draws = RULES.find((rule) => rule.id === 'R-01');

    expect(draws?.decidedOn).toBe('2026-09-08');
    // Y la fecha no se queda pegada al título.
    expect(draws?.title).not.toMatch(/decidida el/i);
  });

  it('conserva el texto de cada regla en párrafos y listas', () => {
    const abandono = RULES.find((rule) => rule.id === 'P-05');

    // Las opciones abiertas van en lista; el estado del motor, en párrafo.
    expect(abandono?.blocks.some((block) => block.kind === 'list')).toBe(true);
    expect(
      abandono?.blocks.some(
        (block) =>
          block.kind === 'list' && (block.items ?? []).some((item) => item.includes('sustituto')),
      ),
    ).toBe(true);
    expect(abandono?.blocks.some((block) => (block.text ?? '').includes('PENDING_RULE'))).toBe(
      true,
    );
  });

  it('limpia el formato de Markdown del texto visible', () => {
    const parsed = parseRules(
      [
        '## Reglas decididas',
        '',
        '### R-99 · Una **regla** de prueba — decidida el 2026-01-02',
        '',
        'Con `código`, un [enlace](https://ejemplo) y *énfasis*.',
        '',
        '- Un punto de la lista',
      ].join('\n'),
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.title).toBe('Una regla de prueba');
    expect(parsed[0]?.decidedOn).toBe('2026-01-02');
    expect(parsed[0]?.blocks[0]?.text).toBe('Con código, un enlace y énfasis.');
    expect(parsed[0]?.blocks[1]?.items).toEqual(['Un punto de la lista']);
  });

  it('no confunde otros apartados del documento con reglas', () => {
    const parsed = parseRules(
      [
        '## Reglas decididas',
        '',
        '### R-01 · Primera',
        'Texto.',
        '',
        '## Cómo se cierra una regla',
        '',
        '1. Se decide y se anota aquí.',
      ].join('\n'),
    );

    expect(parsed.map((rule) => rule.id)).toEqual(['R-01']);
  });

  it('lee la fecha de última actualización que declara el documento', () => {
    expect(parseUpdatedAt('Última actualización: **8 de septiembre de 2026** · reglamento')).toBe(
      '8 de septiembre de 2026',
    );
  });
});
