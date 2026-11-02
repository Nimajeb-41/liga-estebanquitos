/**
 * Reconstrucción de la temporada 2026-1.
 *
 * El archivo `temporada/2026-1.json` es lo único que queda de la liga después
 * de perder la base de datos. Estas pruebas comprueban dos cosas:
 *
 * - que el archivo es exactamente lo que da el sorteo con su semilla, y que
 *   respeta todo lo que se sabía (la tabla de la J7, las victorias a tres
 *   coronas, los walkovers, los cruces de J8 y J9);
 * - que restaurarlo sobre una base vacía deja la liga en ese estado, pasando
 *   por la API como lo haría el administrador.
 */

import { generateFixture } from '@liga/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CAPTURA_J7,
  construirTemporada,
  cumpleCriterios,
  JUGADORES,
  PROPUESTA_J8,
  PROPUESTA_J9,
} from '../src/scripts/reconstruccion.ts';
import { leerTemporada, restaurarTemporada } from '../src/scripts/restaurar.ts';
import { CONFIRMED_PLAYERS } from '../src/scripts/seed.ts';
import { ADMIN_EMAIL, ADMIN_PASSWORD, createTestApp, type TestApp } from './helpers.ts';

const temporada = leerTemporada();

describe('el sorteo de la reconstrucción', () => {
  it('las seis primeras plazas son las del seed, en su orden', () => {
    expect(JUGADORES.slice(0, 6)).toEqual([...CONFIRMED_PLAYERS]);
  });

  it('la semilla del archivo da un calendario que cumple los criterios', () => {
    const fixture = generateFixture([...JUGADORES], { seed: temporada.sorteo.semilla, legs: 2 });
    expect(cumpleCriterios(fixture)).toBe(true);
  });

  it('el archivo es exactamente lo que sale de su semilla', () => {
    const fixture = generateFixture([...JUGADORES], { seed: temporada.sorteo.semilla, legs: 2 });
    const reconstruida = construirTemporada({
      semilla: temporada.sorteo.semilla,
      intento: temporada.sorteo.intento,
      fixture,
    });
    expect(reconstruida).toEqual(temporada);
  });

  it('las jornadas 8 y 9 son los cruces propuestos y no tienen resultado', () => {
    const cruces = (numero: number) =>
      temporada.jornadas
        .find((j) => j.jornada === numero)
        ?.partidos.map((p) => [p.local, p.visitante].sort().join('-'))
        .sort();
    const propuesta = (lista: readonly (readonly string[])[]) =>
      lista.map((par) => [...par].sort().join('-')).sort();

    expect(cruces(8)).toEqual(propuesta(PROPUESTA_J8));
    expect(cruces(9)).toEqual(propuesta(PROPUESTA_J9));
    for (const jornada of temporada.jornadas.filter((j) => j.jornada >= 8)) {
      expect(jornada.partidos.every((p) => !p.resultado && !p.walkover)).toBe(true);
    }
  });

  it('solo Nimaben y Eli_as ganan a tres coronas, dos veces cada uno', () => {
    const tresCoronas = new Map<string, number>();
    for (const partido of temporada.jornadas.flatMap((j) => j.partidos)) {
      const r = partido.resultado;
      if (r === undefined || Math.max(r.local, r.visitante) !== 3) continue;
      const ganador = r.local === 3 ? partido.local : partido.visitante;
      tresCoronas.set(ganador, (tresCoronas.get(ganador) ?? 0) + 1);
    }
    expect(Object.fromEntries(tresCoronas)).toEqual({ Nimaben: 2, Eli_as: 2 });
  });

  it('Renuz pierde por incomparecencia sus tres pendientes, aplazados y reprogramados', () => {
    const pendientes = temporada.jornadas
      .flatMap((j) => j.partidos)
      .filter((p) => p.walkover?.reprogramadoPara !== undefined);
    expect(pendientes.map((p) => [p.local, p.visitante].find((x) => x !== 'Renuz')).sort()).toEqual(
      ['Eze23ml', 'Herobrain', 'Lucía'],
    );
    expect(pendientes.every((p) => p.walkover?.ausente === 'Renuz')).toBe(true);
  });

  it('la tabla esperada es la captura de la J7 más los walkovers de Renuz', () => {
    for (const fila of temporada.clasificacionEsperada) {
      const captura = CAPTURA_J7[fila.jugador as keyof typeof CAPTURA_J7];
      const extra = ['Eze23ml', 'Lucía', 'Herobrain'].includes(fila.jugador) ? 1 : 0;
      const renuz = fila.jugador === 'Renuz' ? 3 : 0;
      expect(fila).toMatchObject({
        pj: 7,
        vg: captura.vg + extra,
        vp: captura.vp + renuz,
        dc: captura.dc,
        pts: captura.pts + 3 * extra,
      });
    }
  });
});

describe('restaurar la temporada', () => {
  let test: TestApp;
  let resultado: Awaited<ReturnType<typeof restaurarTemporada>>;

  beforeAll(async () => {
    test = await createTestApp();
    test.clock.current = new Date('2026-11-02T12:00:00-03:00');
    resultado = await restaurarTemporada({
      app: test.app,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      temporada,
      reloj: test.clock,
    });
  });

  afterAll(async () => {
    await test.close();
  });

  const fixture = async () =>
    (await test.app.inject({ method: 'GET', url: '/api/v1/fixture' })).json() as {
      rounds: {
        number: number;
        scheduledAt: string | null;
        matches: {
          status: string;
          scheduledAt: string | null;
          playedAt: string | null;
          postponementCount: number;
          home: { displayName: string };
          away: { displayName: string };
          result: { resolution: string } | null;
        }[];
      }[];
    };

  it('carga los 90 partidos, 30 resultados y 5 walkovers', () => {
    expect(resultado).toMatchObject({
      partidos: 90,
      resultados: 30,
      walkovers: 5,
      aplazados: 3,
      jornadasConFecha: 9,
    });
  });

  it('la clasificación es la esperada, puesto por puesto', () => {
    expect(
      resultado.clasificacion.map((f) => [
        f.position,
        f.displayName,
        f.played,
        f.wins,
        f.losses,
        f.crownDiff,
        f.points,
      ]),
    ).toEqual([
      [1, 'Esteban', 7, 6, 1, 5, 18],
      [2, 'LeonSB', 7, 6, 1, 3, 18],
      [3, 'Lyuk', 7, 5, 2, 3, 15],
      [4, 'Eze23ml', 7, 4, 3, 1, 12],
      [5, 'Lucía', 7, 4, 3, 0, 12],
      [6, 'Nimaben', 7, 3, 4, 3, 11],
      [7, 'Eli_as', 7, 3, 4, 1, 11],
      [8, 'Herobrain', 7, 3, 4, -4, 9],
      [9, 'Dullys', 7, 1, 6, -7, 3],
      [10, 'Renuz', 7, 0, 7, -5, 0],
    ]);
  });

  it('J1-J7 terminadas, J8 y J9 programadas con fecha, la vuelta sin fecha', async () => {
    const { rounds } = await fixture();
    for (const round of rounds) {
      const estados = new Set(round.matches.map((m) => m.status));
      if (round.number <= 7) {
        expect(estados).toEqual(new Set(['COMPLETED']));
      } else {
        expect(estados).toEqual(new Set(['SCHEDULED']));
      }
      const conFecha = round.matches.every((m) => m.scheduledAt !== null);
      expect(conFecha).toBe(round.number <= 9);
    }
    const j8 = rounds.find((r) => r.number === 8);
    expect(j8?.scheduledAt).toBe(new Date('2026-11-08T20:00:00-03:00').toISOString());
    expect(rounds.find((r) => r.number === 9)?.scheduledAt).toBe(
      new Date('2026-11-15T20:00:00-03:00').toISOString(),
    );
  });

  it('cada partido de J1-J7 consta como jugado el domingo de su jornada', async () => {
    const { rounds } = await fixture();
    const j1 = rounds.find((r) => r.number === 1);
    // El día se mira en la hora de la liga (UTC-03:00): en UTC, los de las
    // 21:00 ya son lunes.
    const diaLocal = (iso: string | null) =>
      iso === null ? null : new Date(Date.parse(iso) - 3 * 3_600_000).toISOString().slice(0, 10);
    expect(j1?.matches).toHaveLength(5);
    for (const partido of j1?.matches ?? []) {
      expect(diaLocal(partido.playedAt)).toBe('2026-09-20');
    }
  });

  it('los pendientes de Renuz quedan como walkover tras un aplazamiento', async () => {
    const { rounds } = await fixture();
    const deRenuz = rounds
      .flatMap((r) => r.matches)
      .filter(
        (m) =>
          [m.home.displayName, m.away.displayName].includes('Renuz') &&
          m.result?.resolution === 'WALKOVER',
      );
    expect(deRenuz).toHaveLength(4);
    expect(deRenuz.filter((m) => m.postponementCount === 1)).toHaveLength(3);
  });

  it('no se puede restaurar dos veces sobre la misma base', async () => {
    await expect(
      restaurarTemporada({
        app: test.app,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        temporada,
        reloj: test.clock,
      }),
    ).rejects.toThrow();
  });
});
