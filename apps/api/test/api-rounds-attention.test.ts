/**
 * Operacion de jornada y centro de accion.
 *
 * Las dos piezas que convierten «la plataforma funciona» en «se puede operar
 * una liga con ella»: programar un dia entero de una vez, y ver que espera una
 * decision sin ir partido por partido.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, createTestApp, type TestApp } from './helpers.ts';

let test: TestApp;

interface MatchView {
  id: string;
  status: string;
  scheduledAt: string | null;
  originalScheduledAt: string | null;
}

async function roundMatches(number: number): Promise<MatchView[]> {
  const response = await test.app.inject({ method: 'GET', url: `/api/v1/rounds/${number}` });
  return response.json().matches;
}

beforeAll(async () => {
  test = await createTestApp({ withTestPlayers: true });
  await asAdmin(test).post('/api/v1/admin/tournament/status', { status: 'READY' });
  await asAdmin(test).post('/api/v1/admin/fixture/generate', { seed: 'jornadas' });
});

afterAll(async () => {
  await test.close();
});

describe('programar una jornada', () => {
  it('reparte las horas con el intervalo pedido', async () => {
    const response = await asAdmin(test).post('/api/v1/admin/rounds/1/schedule', {
      startAt: '2026-10-10T18:00:00.000Z',
      intervalMinutes: 30,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.scheduled).toBe(5);
    expect(body.skipped).toBe(0);

    const matches = await roundMatches(1);
    const times = matches
      .map((match) => match.scheduledAt)
      .filter((value): value is string => value !== null)
      .sort();
    expect(times).toHaveLength(5);
    expect(times[0]).toBe('2026-10-10T18:00:00.000Z');
    expect(times[4]).toBe('2026-10-10T20:00:00.000Z');
  });

  it('fija la fecha original y no la vuelve a tocar', async () => {
    // Es lo que permite decir «esto era del dia 10» despues de tres aplazos.
    const before = await roundMatches(1);
    const originals = before.map((match) => match.originalScheduledAt);

    await asAdmin(test).post('/api/v1/admin/rounds/1/schedule', {
      startAt: '2026-10-17T18:00:00.000Z',
      intervalMinutes: 0,
      overwrite: true,
    });

    const after = await roundMatches(1);
    expect(after.map((match) => match.originalScheduledAt)).toEqual(originals);
    // La vigente si cambia, y con intervalo 0 van todos a la misma hora.
    expect(new Set(after.map((match) => match.scheduledAt))).toEqual(
      new Set(['2026-10-17T18:00:00.000Z']),
    );
  });

  it('no pisa fechas ya puestas si no se lo piden', async () => {
    const response = await asAdmin(test).post('/api/v1/admin/rounds/1/schedule', {
      startAt: '2026-10-24T18:00:00.000Z',
      intervalMinutes: 30,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NOTHING_TO_SCHEDULE');
  });

  it('rechaza una jornada que no existe', async () => {
    const response = await asAdmin(test).post('/api/v1/admin/rounds/199/schedule', {
      startAt: '2026-10-24T18:00:00.000Z',
      intervalMinutes: 30,
    });

    expect(response.statusCode).toBe(404);
  });

  it('rechaza un intervalo negativo antes de tocar nada', async () => {
    const response = await asAdmin(test).post('/api/v1/admin/rounds/2/schedule', {
      startAt: '2026-10-24T18:00:00.000Z',
      intervalMinutes: -5,
    });

    expect(response.statusCode).toBe(400);
    const matches = await roundMatches(2);
    expect(matches.every((match) => match.scheduledAt === null)).toBe(true);
  });

  it('exige sesion', async () => {
    const response = await test.app.inject({
      method: 'POST',
      url: '/api/v1/admin/rounds/2/schedule',
      payload: { startAt: '2026-10-24T18:00:00.000Z', intervalMinutes: 30 },
    });
    expect(response.statusCode).toBe(401);
  });

  it('queda en la auditoria con lo que se hizo', async () => {
    const audit = await asAdmin(test).get('/api/v1/admin/audit');
    const entry = audit.json().find((row: { action: string }) => row.action === 'ROUND_SCHEDULED');

    expect(entry).toBeDefined();
    expect(entry.payload.roundNumber).toBe(1);
    expect(entry.payload.scheduled).toBeGreaterThan(0);
  });
});

describe('centro de accion', () => {
  it('enumera lo que espera decision, no solo cuanto hay', async () => {
    const response = await asAdmin(test).get('/api/v1/admin/attention');
    expect(response.statusCode).toBe(200);

    const report = response.json();
    expect(report.total).toBe(report.items.length);
    // 90 partidos: 5 con fecha en la jornada 1, el resto sin programar.
    expect(report.byKind.UNSCHEDULED).toBe(85);
    for (const item of report.items) {
      expect(typeof item.href).toBe('string');
      expect(item.href.startsWith('/admin/')).toBe(true);
    }
  });

  it('un partido en disputa aparece con su enlace', async () => {
    const matches = await roundMatches(1);
    const target = matches[0]!;
    // Poner un partido en juego exige que la competicion lo este.
    await asAdmin(test).post('/api/v1/admin/tournament/status', { status: 'LIVE' });
    const live = await asAdmin(test).post(`/api/v1/admin/matches/${target.id}/live`, {});
    expect(live.statusCode).toBe(200);

    const report = (await asAdmin(test).get('/api/v1/admin/attention')).json();
    const item = report.items.find((row: { matchId: string | null }) => row.matchId === target.id);

    expect(item.kind).toBe('LIVE');
    expect(item.href).toBe(`/admin/matches/${target.id}`);
    expect(item.since).not.toBeNull();
  });

  it('lo que no tiene fecha va al final, no al principio', async () => {
    // No es que sea reciente: es que no hay nada honesto que ordenar.
    const report = (await asAdmin(test).get('/api/v1/admin/attention')).json();
    const firstUndated = report.items.findIndex(
      (row: { since: string | null }) => row.since === null,
    );
    const lastDated = report.items.reduce(
      (last: number, row: { since: string | null }, index: number) =>
        row.since === null ? last : index,
      -1,
    );

    expect(firstUndated).toBeGreaterThan(lastDated);
  });

  it('exige sesion', async () => {
    const response = await test.app.inject({ method: 'GET', url: '/api/v1/admin/attention' });
    expect(response.statusCode).toBe(401);
  });
});

describe('sondeo en directo', () => {
  it('la revision sube cuando el partido cambia, y solo entonces', async () => {
    const admin = asAdmin(test);
    const matches = await roundMatches(1);
    const target = matches[0]!;
    const url = `/api/v1/matches/${target.id}/live`;

    const before = (await test.app.inject({ method: 'GET', url })).json();
    // Sondear no cambia nada: dos lecturas seguidas dan la misma revision.
    const again = (await test.app.inject({ method: 'GET', url })).json();
    expect(again.revision).toBe(before.revision);

    await admin.post(`/api/v1/admin/matches/${target.id}/result`, {
      homeCrowns: 3,
      awayCrowns: 1,
    });

    const after = (await test.app.inject({ method: 'GET', url })).json();
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(after.status).toBe('COMPLETED');
  });

  it('un cambio en otro partido no mueve esta revision', async () => {
    const matches = await roundMatches(1);
    const mine = matches[1]!;
    const other = matches[2]!;

    const before = (
      await test.app.inject({ method: 'GET', url: `/api/v1/matches/${mine.id}/live` })
    ).json();

    await asAdmin(test).post(`/api/v1/admin/matches/${other.id}/result`, {
      homeCrowns: 2,
      awayCrowns: 0,
    });

    const after = (
      await test.app.inject({ method: 'GET', url: `/api/v1/matches/${mine.id}/live` })
    ).json();
    expect(after.revision).toBe(before.revision);
  });

  it('es publico y no filtra nada interno', async () => {
    const matches = await roundMatches(2);
    const response = await test.app.inject({
      method: 'GET',
      url: `/api/v1/matches/${matches[0]!.id}/live`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    // Ni acciones de administracion, ni notas, ni evidencia.
    expect(body.actions).toBeUndefined();
    expect(body.history).toBeUndefined();
    expect(Object.keys(body).sort()).toEqual([
      'fetchedAt',
      'id',
      'playedAt',
      'result',
      'revision',
      'scheduledAt',
      'status',
      'stream',
    ]);
  });
});
