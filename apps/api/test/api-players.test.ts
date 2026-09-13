/** Seguridad, sesion y gestion de participantes, de punta a punta. */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMIN_EMAIL, ADMIN_PASSWORD, asAdmin, createTestApp, type TestApp } from './helpers.ts';

let test: TestApp;

beforeAll(async () => {
  test = await createTestApp();
});

afterAll(async () => {
  await test.close();
});

describe('seguridad', () => {
  it('deja consultar sin sesion', async () => {
    const response = await test.app.inject({ method: 'GET', url: '/api/v1/players' });
    expect(response.statusCode).toBe(200);
  });

  it('rechaza escribir sin sesion', async () => {
    const response = await test.app.inject({
      method: 'POST',
      url: '/api/v1/admin/players',
      payload: { displayName: 'Intruso' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('rechaza una cookie de sesion inventada', async () => {
    const response = await test.app.inject({
      method: 'POST',
      url: '/api/v1/admin/players',
      headers: { cookie: 'liga_admin_session=noexiste' },
      payload: { displayName: 'Intruso' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rechaza credenciales incorrectas sin decir cual falla', async () => {
    const wrongPassword = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: ADMIN_EMAIL, password: 'incorrecta' },
    });
    const wrongEmail = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'otro@liga.test', password: ADMIN_PASSWORD },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongEmail.statusCode).toBe(401);
    expect(wrongEmail.json().error.message).toBe(wrongPassword.json().error.message);
  });

  it('entrega la cookie de sesion como httpOnly', async () => {
    const response = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    const cookie = response.cookies.find((row) => row.name === 'liga_admin_session');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax');
  });

  it('identifica al administrador en sesion', async () => {
    const response = await asAdmin(test).get('/api/v1/auth/me');
    expect(response.statusCode).toBe(200);
    expect(response.json().role).toBe('OWNER');
  });

  it('valida la entrada antes de tocar nada', async () => {
    const response = await asAdmin(test).post('/api/v1/admin/players', { displayName: 'x' });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve un identificador de peticion en cada error', async () => {
    const response = await test.app.inject({ method: 'GET', url: '/api/v1/no-existe' });
    expect(response.statusCode).toBe(404);
    expect(response.json().requestId).toBeTruthy();
  });
});

describe('participantes', () => {
  it('arranca con los 6 confirmados reales y 4 plazas TBD', async () => {
    const response = await test.app.inject({ method: 'GET', url: '/api/v1/players' });
    const body = response.json();
    expect(body.summary.confirmed).toBe(6);
    expect(body.summary.pending).toBe(4);
    expect(body.players.map((player: { displayName: string }) => player.displayName)).toEqual([
      'Nimaben',
      'Lyuk',
      'Dullys',
      'Esteban',
      'Eze23ml',
      'LeonSB',
    ]);
    const free = body.slots.filter((slot: { player: unknown }) => slot.player === null);
    expect(free.map((slot: { slot: number }) => slot.slot)).toEqual([7, 8, 9, 10]);
  });

  it('crea, edita y confirma un participante', async () => {
    const admin = asAdmin(test);
    const created = await admin.post('/api/v1/admin/players', {
      displayName: 'Jugador Nuevo',
      clashTag: '#2P0LYQ0',
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();

    const updated = await admin.patch(`/api/v1/admin/players/${id}`, {
      displayName: 'Jugador Renombrado',
    });
    expect(updated.statusCode).toBe(200);

    const confirmed = await admin.post(`/api/v1/admin/players/${id}/confirm`);
    expect(confirmed.statusCode).toBe(200);

    const players = (await test.app.inject({ method: 'GET', url: '/api/v1/players' })).json();
    const player = players.players.find((row: { id: string }) => row.id === id);
    expect(player.displayName).toBe('Jugador Renombrado');
    expect(player.status).toBe('CONFIRMED');
    expect(player.slot).toBe(7);
    expect(players.summary.confirmed).toBe(7);
  });

  it('rechaza nombres duplicados', async () => {
    const response = await asAdmin(test).post('/api/v1/admin/players', {
      displayName: 'nimaben',
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('DUPLICATE_PLAYER_NAME');
  });

  it('no permite generar el fixture con menos de 10 confirmados', async () => {
    const response = await asAdmin(test).post('/api/v1/admin/fixture/generate', {});
    // El torneo esta en REGISTRATION: primero falla la capacidad.
    expect([409, 422]).toContain(response.statusCode);
  });

  it('no permite cerrar la plantilla con menos de 10 confirmados', async () => {
    const response = await asAdmin(test).post('/api/v1/admin/tournament/status', {
      status: 'READY',
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('ROSTER_INCOMPLETE');
  });

  it('no permite confirmar a un undecimo participante', async () => {
    const admin = asAdmin(test);
    for (const name of ['Relleno A', 'Relleno B', 'Relleno C']) {
      const created = await admin.post('/api/v1/admin/players', { displayName: name });
      const confirmed = await admin.post(`/api/v1/admin/players/${created.json().id}/confirm`);
      expect(confirmed.statusCode).toBe(200);
    }
    const players = (await test.app.inject({ method: 'GET', url: '/api/v1/players' })).json();
    expect(players.summary.confirmed).toBe(10);

    const extra = await admin.post('/api/v1/admin/players', { displayName: 'Undecimo' });
    const rejected = await admin.post(`/api/v1/admin/players/${extra.json().id}/confirm`);
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe('ROSTER_FULL');
  });

  it('libera la plaza al desconfirmar y la vuelve a dar al confirmar', async () => {
    const admin = asAdmin(test);
    const players = (await test.app.inject({ method: 'GET', url: '/api/v1/players' })).json();
    const target = players.players.find((row: { slot: number }) => row.slot === 10);

    const unconfirmed = await admin.post(`/api/v1/admin/players/${target.id}/unconfirm`);
    expect(unconfirmed.statusCode).toBe(200);

    const after = (await test.app.inject({ method: 'GET', url: '/api/v1/players' })).json();
    expect(after.summary.confirmed).toBe(9);
    expect(after.slots.find((slot: { slot: number }) => slot.slot === 10).player).toBeNull();

    const reconfirmed = await admin.post(`/api/v1/admin/players/${target.id}/confirm`);
    expect(reconfirmed.statusCode).toBe(200);
  });

  it('sustituye a un participante conservando su plaza y su rastro', async () => {
    const admin = asAdmin(test);
    const players = (await test.app.inject({ method: 'GET', url: '/api/v1/players' })).json();
    const outgoing = players.players.find(
      (row: { displayName: string }) => row.displayName === 'Relleno A',
    );

    const response = await admin.post(`/api/v1/admin/players/${outgoing.id}/replace`, {
      displayName: 'Sustituto Uno',
    });
    expect(response.statusCode).toBe(200);

    const after = (await test.app.inject({ method: 'GET', url: '/api/v1/players' })).json();
    const replaced = after.players.find((row: { id: string }) => row.id === outgoing.id);
    const incoming = after.players.find(
      (row: { displayName: string }) => row.displayName === 'Sustituto Uno',
    );

    expect(replaced.status).toBe('REPLACED');
    expect(replaced.slot).toBeNull();
    expect(replaced.replacedByPlayerId).toBe(incoming.id);
    expect(incoming.status).toBe('CONFIRMED');
    expect(incoming.slot).toBe(outgoing.slot);
    expect(after.summary.confirmed).toBe(10);
  });
});
