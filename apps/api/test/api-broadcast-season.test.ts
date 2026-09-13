/**
 * Directo real y programacion de la temporada.
 *
 * Dos cosas que la Fase 6 cambio de raiz:
 *
 * 1. El aviso de directo ya no depende de que alguien marque un partido: exige
 *    que el canal este emitiendo Clash Royale **y** que haya partidos en juego.
 * 2. La temporada se programa en sesiones —tres jornadas cada sabado— en vez de
 *    jornada por jornada.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { KickClient } from '../src/integrations/kick/client.ts';
import { getBroadcastStatus } from '../src/services/broadcast.ts';
import { asAdmin, createTestApp, type TestApp } from './helpers.ts';

let test: TestApp;
let tournamentId: string;

/** Un Kick de mentira con la respuesta que haga falta. */
function kickSaying(body: unknown): KickClient {
  const fetchImpl = vi.fn(
    async () => new Response(JSON.stringify(body), { status: 200 }),
  ) as unknown as typeof fetch;
  return new KickClient({ slug: 'canal', fetchImpl, cacheSeconds: 0 });
}

const LIVE_CLASH = { livestream: { categories: [{ name: 'Clash Royale' }] } };
const LIVE_OTHER = { livestream: { categories: [{ name: 'Fortnite' }] } };
const OFFLINE = { livestream: null };

async function broadcast(kick: KickClient | undefined) {
  return getBroadcastStatus(
    { db: test.db, config: test.config, now: () => test.clock.current },
    tournamentId,
    {
      channelName: 'EsstebannPluss',
      channelUrl: 'https://kick.com/esstebannpluss',
      kick,
    },
  );
}

beforeAll(async () => {
  test = await createTestApp({ withTestPlayers: true });
  const admin = asAdmin(test);
  await admin.post('/api/v1/admin/tournament/status', { status: 'READY' });
  await admin.post('/api/v1/admin/fixture/generate', { seed: 'fase-6' });
  await admin.post('/api/v1/admin/tournament/status', { status: 'LIVE' });

  tournamentId = test.tournamentId;
});

afterAll(async () => {
  await test.close();
});

describe('cuando se anuncia un directo', () => {
  it('no basta con que el canal este emitiendo Clash Royale', async () => {
    // Sin partidos en juego no hay liga que ver, aunque el canal este abierto.
    const status = await broadcast(kickSaying(LIVE_CLASH));

    expect(status.live).toBe(false);
    expect(status.reason).toBe('NO_MATCHES_LIVE');
  });

  it('tampoco basta con que haya partidos en juego', async () => {
    const round = (await test.app.inject({ method: 'GET', url: '/api/v1/rounds/1' })).json();
    await asAdmin(test).post(`/api/v1/admin/matches/${round.matches[0].id}/live`, {});

    const status = await broadcast(kickSaying(OFFLINE));

    expect(status.live).toBe(false);
    expect(status.reason).toBe('CHANNEL_OFFLINE');
    // El partido se reconoce: lo que falta es el canal.
    expect(status.matches).toHaveLength(1);
  });

  it('emitir otro juego no es retransmitir la liga', async () => {
    const status = await broadcast(kickSaying(LIVE_OTHER));

    expect(status.live).toBe(false);
    expect(status.reason).toBe('CHANNEL_OTHER_GAME');
    expect(status.channel.category).toBe('Fortnite');
  });

  it('con las dos cosas si', async () => {
    const status = await broadcast(kickSaying(LIVE_CLASH));

    expect(status.live).toBe(true);
    expect(status.reason).toBe('LIVE');
    expect(status.matches[0]?.home).toBeTruthy();
  });

  it('si no se puede comprobar el canal, no se anuncia nada', async () => {
    /*
      Ante la duda la web no afirma que hay directo. Es la misma regla que la
      liga aplica a Supercell: se dice lo que se puede comprobar.
    */
    const roto = kickSaying({ forma: 'inesperada' });
    const status = await broadcast(roto);

    expect(status.live).toBe(false);
    expect(status.reason).toBe('CHANNEL_UNKNOWN');
  });

  it('sin comprobacion configurada tampoco', async () => {
    const status = await broadcast(undefined);

    expect(status.live).toBe(false);
    expect(status.reason).toBe('NOT_CONFIGURED');
    expect(status.channel.state).toBe('UNKNOWN');
  });

  it('el endpoint publico responde sin sesion', async () => {
    const response = await test.app.inject({ method: 'GET', url: '/api/v1/broadcast' });
    expect(response.statusCode).toBe(200);
    expect(typeof response.json().live).toBe('boolean');
  });
});

interface FixtureView {
  rounds: { matches: { scheduledAt: string | null }[] }[];
}

/**
 * Hora del primer partido de una jornada.
 *
 * Se ignoran los partidos sin fecha: un partido en juego o aplazado no se
 * reprograma, y eso es lo correcto. Meterlos en el calculo solo arrastraria un
 * `NaN` y ocultaria lo que se quiere medir.
 */
function startOf(fixture: FixtureView, index: number): number {
  const times = fixture.rounds[index]!.matches.map((match) => match.scheduledAt)
    .filter((value): value is string => value !== null)
    .map((value) => Date.parse(value));
  return Math.min(...times);
}

describe('tres jornadas cada sabado', () => {
  it('reparte las dieciocho jornadas en seis sesiones', async () => {
    const response = await asAdmin(test).post('/api/v1/admin/rounds/schedule-season', {
      startAt: '2026-10-10T20:00:00.000Z',
      roundsPerSession: 3,
      daysBetweenSessions: 7,
      intervalMinutes: 30,
      roundGapMinutes: 15,
      overwrite: true,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.sessions).toHaveLength(6);
    expect(body.sessions[0].rounds).toEqual([1, 2, 3]);
    expect(body.sessions[5].rounds).toEqual([16, 17, 18]);
  });

  it('cada sesion cae una semana despues', async () => {
    const fixture = (await test.app.inject({ method: 'GET', url: '/api/v1/fixture' })).json();

    const days = (startOf(fixture, 3) - startOf(fixture, 0)) / (24 * 60 * 60 * 1000);
    expect(days).toBe(7);
  });

  it('dentro de una sesion las jornadas van seguidas, no a la vez', async () => {
    const fixture = (await test.app.inject({ method: 'GET', url: '/api/v1/fixture' })).json();

    // Jornada de 5 partidos cada 30 min = 120 min de recorrido, mas 15 de
    // descanso: la siguiente empieza 135 min despues.
    expect((startOf(fixture, 1) - startOf(fixture, 0)) / 60_000).toBe(135);
    expect((startOf(fixture, 2) - startOf(fixture, 1)) / 60_000).toBe(135);
  });

  it('sin calendario no hay nada que programar', async () => {
    const otra = await createTestApp({ withTestPlayers: true });
    const response = await asAdmin(otra).post('/api/v1/admin/rounds/schedule-season', {
      startAt: '2026-10-10T20:00:00.000Z',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('FIXTURE_NOT_GENERATED');
    await otra.close();
  });

  it('exige sesion', async () => {
    const response = await test.app.inject({
      method: 'POST',
      url: '/api/v1/admin/rounds/schedule-season',
      payload: { startAt: '2026-10-10T20:00:00.000Z' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('queda en la auditoria con el formato elegido', async () => {
    const audit = await asAdmin(test).get('/api/v1/admin/audit');
    const entry = audit.json().find((row: { action: string }) => row.action === 'SEASON_SCHEDULED');

    expect(entry).toBeDefined();
    expect(entry.payload.roundsPerSession).toBe(3);
    expect(entry.payload.daysBetweenSessions).toBe(7);
  });
});

describe('renombrar con la liga en marcha', () => {
  it('se puede cambiar el nombre aunque ya haya calendario', async () => {
    /*
      Quien compite queda fijado en cuanto hay calendario. Como se llama, no:
      es una etiqueta que no mueve un solo partido ni un solo punto, y en una
      liga de amigos los apodos cambian a mitad de temporada.
    */
    const players = (await test.app.inject({ method: 'GET', url: '/api/v1/players' })).json();
    const target = players.players.find((row: { slot: number | null }) => row.slot === 1);

    const response = await asAdmin(test).patch(`/api/v1/admin/players/${target.id}`, {
      displayName: 'Nombre Nuevo',
    });

    expect(response.statusCode).toBe(200);
    const after = (await test.app.inject({ method: 'GET', url: '/api/v1/players' })).json();
    expect(after.players.find((row: { id: string }) => row.id === target.id).displayName).toBe(
      'Nombre Nuevo',
    );
  });

  it('pero seguir dando de alta a gente sigue bloqueado', async () => {
    // Anadir a alguien con el calendario hecho dejaria un torneo incoherente.
    const response = await asAdmin(test).post('/api/v1/admin/players', {
      displayName: 'Tarde Para Esto',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('OPERATION_NOT_ALLOWED_IN_STATUS');
  });

  it('el cambio de nombre queda auditado', async () => {
    const audit = await asAdmin(test).get('/api/v1/admin/audit');
    const entry = audit.json().find((row: { action: string }) => row.action === 'PLAYER_UPDATED');

    expect(entry).toBeDefined();
    expect(entry.payload.patch.displayName).toBe('Nombre Nuevo');
  });
});
