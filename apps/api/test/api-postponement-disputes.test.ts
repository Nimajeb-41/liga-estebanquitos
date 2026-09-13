/**
 * Aplazamientos, reprogramaciones, disputas y auditoria.
 *
 * Es la parte del reglamento que mas facil seria hacer mal: un aplazamiento no
 * puede convertirse en derrota, no puede mover el partido de jornada y no puede
 * borrar la fecha original.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, createTestApp, startCompetition, type TestApp } from './helpers.ts';

let test: TestApp;

interface MatchView {
  id: string;
  status: string;
  roundNumber: number;
  scheduledAt: string | null;
  originalScheduledAt: string | null;
  postponementCount: number;
  home: { id: string; displayName: string };
  away: { id: string; displayName: string };
  result: { homeCrowns: number; awayCrowns: number } | null;
  history: {
    postponements: {
      event: string;
      roundNumber: number;
      previousScheduledAt: string | null;
      newScheduledAt: string | null;
      reason: string;
    }[];
    reportCount: number;
  };
}

async function matchDetail(id: string): Promise<MatchView> {
  return (await test.app.inject({ method: 'GET', url: `/api/v1/matches/${id}` })).json();
}

async function standings() {
  return (await test.app.inject({ method: 'GET', url: '/api/v1/standings' })).json();
}

async function firstMatches(): Promise<
  { id: string; home: { id: string }; away: { id: string } }[]
> {
  const fixture = (await test.app.inject({ method: 'GET', url: '/api/v1/fixture' })).json();
  return fixture.rounds[0].matches;
}

beforeAll(async () => {
  test = await createTestApp({ withTestPlayers: true });
  await startCompetition(test, 'semilla-aplazamientos');
});

afterAll(async () => {
  await test.close();
});

describe('partidos pospuestos', () => {
  let matchId: string;

  it('fija la fecha prevista del partido', async () => {
    const matches = await firstMatches();
    matchId = (matches[0] as { id: string }).id;

    const response = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/schedule`, {
      scheduledAt: '2026-10-08T22:00:00.000Z',
    });
    expect(response.statusCode).toBe(200);

    const match = await matchDetail(matchId);
    expect(match.scheduledAt).toBe('2026-10-08T22:00:00.000Z');
    expect(match.originalScheduledAt).toBe('2026-10-08T22:00:00.000Z');
  });

  it('pospone el partido con motivo y responsable', async () => {
    const response = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/postpone`, {
      reason: 'CONNECTION',
      notes: 'Corte de internet confirmado por captura',
    });
    expect(response.statusCode).toBe(200);

    const match = await matchDetail(matchId);
    expect(match.status).toBe('POSTPONED');
    expect(match.postponementCount).toBe(1);
  });

  it('no cuenta como jugado ni reparte puntos o coronas', async () => {
    const match = await matchDetail(matchId);
    const table = await standings();
    for (const playerId of [match.home.id, match.away.id]) {
      const row = table.rows.find((item: { playerId: string }) => item.playerId === playerId);
      expect(row.played).toBe(0);
      expect(row.points).toBe(0);
      expect(row.crownsFor).toBe(0);
      expect(row.crownsAgainst).toBe(0);
    }
  });

  it('conserva su jornada y su fecha original', async () => {
    const match = await matchDetail(matchId);
    expect(match.roundNumber).toBe(1);
    expect(match.originalScheduledAt).toBe('2026-10-08T22:00:00.000Z');
    expect(match.history.postponements[0]).toMatchObject({
      event: 'POSTPONED',
      roundNumber: 1,
      previousScheduledAt: '2026-10-08T22:00:00.000Z',
      reason: 'CONNECTION',
    });
  });

  it('rechaza un aplazamiento sin motivo', async () => {
    const matches = await firstMatches();
    const other = (matches[1] as { id: string }).id;
    const response = await asAdmin(test).post(`/api/v1/admin/matches/${other}/postpone`, {
      reason: 'OTHER',
      notes: '  ',
    });
    expect(response.statusCode).toBe(400);
  });

  it('no admite resultado mientras esta pospuesto', async () => {
    const response = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/result`, {
      homeCrowns: 3,
      awayCrowns: 0,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('MATCH_NOT_PLAYABLE');
  });

  it('se reprograma y vuelve a SCHEDULED sin cambiar de jornada', async () => {
    const response = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/reschedule`, {
      newScheduledAt: '2026-10-15T22:00:00.000Z',
      notes: 'Nueva fecha acordada entre ambos jugadores',
    });
    expect(response.statusCode).toBe(200);

    const match = await matchDetail(matchId);
    expect(match.status).toBe('SCHEDULED');
    expect(match.scheduledAt).toBe('2026-10-15T22:00:00.000Z');
    expect(match.originalScheduledAt).toBe('2026-10-08T22:00:00.000Z');
    expect(match.roundNumber).toBe(1);
    expect(match.history.postponements).toHaveLength(2);
    expect(match.history.postponements[1]).toMatchObject({
      event: 'RESCHEDULED',
      newScheduledAt: '2026-10-15T22:00:00.000Z',
    });
  });

  it('se juega despues y entonces si actualiza la clasificacion', async () => {
    const response = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/result`, {
      homeCrowns: 3,
      awayCrowns: 1,
    });
    expect(response.statusCode).toBe(200);

    const match = await matchDetail(matchId);
    expect(match.status).toBe('COMPLETED');

    const table = await standings();
    const winner = table.rows.find((item: { playerId: string }) => item.playerId === match.home.id);
    expect(winner.played).toBe(1);
    expect(winner.points).toBe(4);
    expect(winner.crownDiff).toBe(2);
  });

  it('sigue explicando que venia de la jornada 1 y de que fecha', async () => {
    const match = await matchDetail(matchId);
    expect(match.roundNumber).toBe(1);
    expect(match.originalScheduledAt).toBe('2026-10-08T22:00:00.000Z');
    expect(match.postponementCount).toBe(1);
  });
});

describe('reporte de resultados y disputas', () => {
  it('valida el resultado cuando los dos jugadores reportan lo mismo', async () => {
    const admin = asAdmin(test);
    const matches = await firstMatches();
    const match = matches[1] as { id: string; home: { id: string }; away: { id: string } };

    const first = await admin.post(`/api/v1/admin/matches/${match.id}/report-result`, {
      playerId: match.home.id,
      homeCrowns: 3,
      awayCrowns: 1,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe('AWAITING_OPPONENT');

    const second = await admin.post(`/api/v1/admin/matches/${match.id}/report-result`, {
      playerId: match.away.id,
      homeCrowns: 3,
      awayCrowns: 1,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().status).toBe('AGREED');

    const detail = await matchDetail(match.id);
    expect(detail.status).toBe('COMPLETED');
    expect(detail.result).toMatchObject({ homeCrowns: 3, awayCrowns: 1 });
    expect(detail.history.reportCount).toBe(2);
  });

  it('marca DISPUTED cuando los reportes se contradicen', async () => {
    const admin = asAdmin(test);
    const matches = await firstMatches();
    const match = matches[2] as { id: string; home: { id: string }; away: { id: string } };

    await admin.post(`/api/v1/admin/matches/${match.id}/report-result`, {
      playerId: match.home.id,
      homeCrowns: 3,
      awayCrowns: 1,
    });
    const conflict = await admin.post(`/api/v1/admin/matches/${match.id}/report-result`, {
      playerId: match.away.id,
      homeCrowns: 2,
      awayCrowns: 3,
    });
    expect(conflict.json().status).toBe('CONFLICT');

    const detail = await matchDetail(match.id);
    expect(detail.status).toBe('DISPUTED');
    expect(detail.result).toBeNull();
  });

  it('un partido en disputa no puntua hasta que se resuelve', async () => {
    const matches = await firstMatches();
    const match = matches[2] as { id: string; home: { id: string } };
    const table = await standings();
    const row = table.rows.find((item: { playerId: string }) => item.playerId === match.home.id);
    expect(row.played).toBe(0);
  });

  it('el administrador resuelve la disputa y la tabla se actualiza', async () => {
    const matches = await firstMatches();
    const match = matches[2] as { id: string; home: { id: string } };

    const response = await asAdmin(test).post(`/api/v1/admin/matches/${match.id}/result`, {
      homeCrowns: 3,
      awayCrowns: 1,
      notes: 'Resuelto tras revisar la captura de ambos',
    });
    expect(response.statusCode).toBe(200);

    const detail = await matchDetail(match.id);
    expect(detail.status).toBe('COMPLETED');

    const table = await standings();
    const row = table.rows.find((item: { playerId: string }) => item.playerId === match.home.id);
    expect(row.played).toBe(1);
    expect(row.points).toBe(4);
  });

  it('rechaza el reporte de alguien que no juega el partido', async () => {
    const matches = await firstMatches();
    const match = matches[3] as { id: string };
    const other = matches[4] as { home: { id: string } };

    const response = await asAdmin(test).post(`/api/v1/admin/matches/${match.id}/report-result`, {
      playerId: other.home.id,
      homeCrowns: 3,
      awayCrowns: 0,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('REPORT_NOT_ALLOWED');
  });
});

describe('auditoria', () => {
  it('registra todas las operaciones que cambian la competicion', async () => {
    const audit = await asAdmin(test).get('/api/v1/admin/audit');
    const actions = new Set(audit.json().map((row: { action: string }) => row.action));

    for (const expected of [
      'TOURNAMENT_STATUS_CHANGED',
      'FIXTURE_GENERATED',
      'MATCH_SCHEDULED',
      'MATCH_POSTPONED',
      'MATCH_RESCHEDULED',
      'MATCH_RESULT_REPORTED',
      'MATCH_RESULT_APPROVED',
      'MATCH_DISPUTED',
    ]) {
      expect(actions).toContain(expected);
    }
  });

  it('guarda quien hizo cada cosa y con que datos', async () => {
    const audit = await asAdmin(test).get('/api/v1/admin/audit');
    const postponement = audit
      .json()
      .find((row: { action: string }) => row.action === 'MATCH_POSTPONED');

    expect(postponement.actor).toBe('Administrador');
    expect(postponement.payload.reason).toBe('CONNECTION');
    expect(postponement.payload.roundNumber).toBe(1);
  });

  it('no expone la auditoria a quien no ha iniciado sesion', async () => {
    const response = await test.app.inject({ method: 'GET', url: '/api/v1/admin/audit' });
    expect(response.statusCode).toBe(401);
  });
});

/* ========================================================================== */
/* Cancelacion y transmision                                                   */
/* ========================================================================== */

/**
 * Cancelar es la unica operacion irreversible del calendario.
 *
 * Lo que se prueba aqui no es que el estado cambie —eso es trivial— sino sus
 * dos consecuencias: que el partido deja de contar para los dos jugadores, y
 * que de CANCELLED no se sale por ninguna puerta.
 */
describe('cancelar un partido', () => {
  let matchId: string;

  beforeAll(async () => {
    const rounds = (await test.app.inject({ method: 'GET', url: '/api/v1/fixture' })).json().rounds;
    // Una jornada avanzada, para no pisar los partidos de los otros escenarios.
    matchId = rounds[5].matches[0].id;
  });

  it('exige un motivo', async () => {
    const response = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/cancel`, {
      reason: '',
    });
    expect(response.statusCode).toBe(400);
  });

  it('exige sesion', async () => {
    const response = await test.app.inject({
      method: 'POST',
      url: `/api/v1/admin/matches/${matchId}/cancel`,
      payload: { reason: 'sin sesion' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('cancela con motivo y lo deja en auditoria', async () => {
    const before = await standings();

    const response = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/cancel`, {
      reason: 'Un participante se retiro de la competicion.',
    });
    expect(response.statusCode).toBe(200);

    const match = await matchDetail(matchId);
    expect(match.status).toBe('CANCELLED');
    // No cuenta para nadie: la tabla no se mueve ni un punto.
    const after = await standings();
    expect(after.rows.map((row: { points: number }) => row.points)).toEqual(
      before.rows.map((row: { points: number }) => row.points),
    );

    const audit = await asAdmin(test).get('/api/v1/admin/audit');
    const entry = audit
      .json()
      .find(
        (row: { action: string; entityId: string }) =>
          row.action === 'MATCH_CANCELLED' && row.entityId === matchId,
      );
    expect(entry).toBeDefined();
    expect(entry.payload.reason).toContain('se retiro');
    expect(entry.actor).toBe('Administrador');
  });

  it('un partido cancelado no admite ninguna operacion', async () => {
    const detail = (await asAdmin(test).get(`/api/v1/admin/matches/${matchId}`)).json();

    expect(detail.actions.allowedTransitions).toEqual([]);
    expect(detail.actions.acceptsResult).toBe(false);
    expect(detail.actions.canCancel).toBe(false);

    // Y el backend lo hace cumplir, no solo lo anuncia.
    const result = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/result`, {
      homeCrowns: 3,
      awayCrowns: 1,
    });
    expect(result.statusCode).toBeGreaterThanOrEqual(400);

    const live = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/live`);
    expect(live.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('no se puede cancelar dos veces', async () => {
    const response = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/cancel`, {
      reason: 'otra vez',
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('enlaces de transmision', () => {
  let matchId: string;

  beforeAll(async () => {
    const rounds = (await test.app.inject({ method: 'GET', url: '/api/v1/fixture' })).json().rounds;
    matchId = rounds[6].matches[0].id;
  });

  it('guarda directo, repeticion y plataforma', async () => {
    const response = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/stream`, {
      streamUrl: 'https://twitch.tv/liga',
      vodUrl: 'https://youtube.com/watch?v=abc',
      platform: 'Twitch',
    });
    expect(response.statusCode).toBe(200);

    const match = (
      await test.app.inject({ method: 'GET', url: `/api/v1/matches/${matchId}` })
    ).json();
    expect(match.stream.url).toBe('https://twitch.tv/liga');
    expect(match.stream.vodUrl).toBe('https://youtube.com/watch?v=abc');
    expect(match.stream.platform).toBe('Twitch');
  });

  it('rechaza cualquier esquema que no sea http o https', async () => {
    // Un `javascript:` aqui acabaria pegado en un href de la ficha publica.
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd']) {
      const response = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/stream`, {
        streamUrl: url,
        vodUrl: null,
        platform: null,
      });
      expect(response.statusCode).toBe(400);
    }

    // Y no ha tocado lo que ya estaba guardado.
    const match = (
      await test.app.inject({ method: 'GET', url: `/api/v1/matches/${matchId}` })
    ).json();
    expect(match.stream.url).toBe('https://twitch.tv/liga');
  });

  it('vaciar un campo borra ese enlace', async () => {
    await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/stream`, {
      streamUrl: null,
      vodUrl: 'https://youtube.com/watch?v=abc',
      platform: null,
    });

    const match = (
      await test.app.inject({ method: 'GET', url: `/api/v1/matches/${matchId}` })
    ).json();
    expect(match.stream.url).toBeNull();
    expect(match.stream.vodUrl).toBe('https://youtube.com/watch?v=abc');
  });

  it('no cambia el estado del partido', async () => {
    const match = (
      await test.app.inject({ method: 'GET', url: `/api/v1/matches/${matchId}` })
    ).json();
    expect(match.status).toBe('SCHEDULED');
    expect(match.result).toBeNull();
  });

  it('exige sesion', async () => {
    const response = await test.app.inject({
      method: 'POST',
      url: `/api/v1/admin/matches/${matchId}/stream`,
      payload: { streamUrl: null, vodUrl: null, platform: null },
    });
    expect(response.statusCode).toBe(401);
  });
});

/* ========================================================================== */
/* Auditoria filtrable y metricas                                              */
/* ========================================================================== */

/**
 * La auditoria tiene que poder responder preguntas concretas.
 *
 * «¿Quien aplazo este partido?», «¿que paso en esta peticion?», «¿que se toco
 * ayer?». Un registro que solo sabe devolver las ultimas doscientas entradas
 * sirve para mirarlo, no para investigar.
 *
 * Y filtrar tiene que ocurrir en la base de datos: si el navegador tuviera que
 * filtrar, habria que mandarle antes el registro entero, con los motivos de
 * cada correccion y las notas internas de cada aplazamiento dentro.
 */
describe('auditoria filtrable', () => {
  it('filtra por accion', async () => {
    const response = await asAdmin(test).get('/api/v1/admin/audit?action=MATCH_POSTPONED');

    expect(response.statusCode).toBe(200);
    const rows = response.json();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.action).toBe('MATCH_POSTPONED');
  });

  it('filtra por tipo de entidad', async () => {
    const rows = (await asAdmin(test).get('/api/v1/admin/audit?entityType=match')).json();

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.entityType).toBe('match');
  });

  it('guarda la peticion que provoco cada entrada, y deja filtrar por ella', async () => {
    const todas = (await asAdmin(test).get('/api/v1/admin/audit')).json();
    const conPeticion = todas.find((row: { requestId: string | null }) => row.requestId !== null);

    expect(conPeticion).toBeDefined();

    const mismas = (
      await asAdmin(test).get(
        `/api/v1/admin/audit?requestId=${encodeURIComponent(conPeticion.requestId)}`,
      )
    ).json();

    expect(mismas.length).toBeGreaterThan(0);
    for (const row of mismas) expect(row.requestId).toBe(conPeticion.requestId);
  });

  it('filtra por rango de fechas', async () => {
    const futuro = new Date(Date.now() + 86_400_000).toISOString();
    const vacio = (await asAdmin(test).get(`/api/v1/admin/audit?since=${futuro}`)).json();
    expect(vacio).toEqual([]);

    const pasado = new Date(Date.now() - 86_400_000).toISOString();
    const lleno = (await asAdmin(test).get(`/api/v1/admin/audit?since=${pasado}`)).json();
    expect(lleno.length).toBeGreaterThan(0);
  });

  it('respeta el tope de entradas', async () => {
    const rows = (await asAdmin(test).get('/api/v1/admin/audit?limit=2')).json();
    expect(rows.length).toBeLessThanOrEqual(2);
  });

  it('rechaza un filtro con forma invalida en vez de ignorarlo', async () => {
    // Ignorarlo devolveria un resultado que no es el que se pidio, y quien lo
    // lea creera que es la respuesta a su pregunta.
    const response = await asAdmin(test).get('/api/v1/admin/audit?actorAdminId=no-es-un-uuid');
    expect(response.statusCode).toBe(400);
  });

  it('ofrece de que se puede filtrar, segun lo registrado', async () => {
    const body = (await asAdmin(test).get('/api/v1/admin/audit?facets=true')).json();

    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.facets.actions.length).toBeGreaterThan(0);
    // Son las acciones que han ocurrido de verdad, no la lista de constantes.
    for (const action of body.facets.actions) {
      expect(action.total).toBeGreaterThan(0);
    }
    expect(body.facets.entityTypes).toContain('match');
  });

  it('sigue exigiendo sesion con filtros', async () => {
    const response = await test.app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit?action=MATCH_POSTPONED',
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('metricas de operacion', () => {
  it('cuenta partidos por estado sin inventar categorias', async () => {
    const response = await asAdmin(test).get('/api/v1/admin/metrics');

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.matches.total).toBeGreaterThan(0);
    const suma = Object.values(body.matches.byStatus as Record<string, number>).reduce(
      (total, value) => total + value,
      0,
    );
    expect(suma).toBe(body.matches.total);
  });

  it('separa lo que necesita atencion de lo que no', async () => {
    const body = (await asAdmin(test).get('/api/v1/admin/metrics')).json();

    expect(body.attention).toHaveProperty('postponed');
    expect(body.attention).toHaveProperty('disputed');
    expect(body.attention).toHaveProperty('pendingCandidates');
    expect(body.attention).toHaveProperty('battlesNeedingReview');
    // Coinciden con el recuento por estado: no son dos verdades distintas.
    expect(body.attention.postponed).toBe(body.matches.byStatus.POSTPONED ?? 0);
  });

  it('dice «nunca» en vez de fingir una sincronizacion', async () => {
    const body = (await asAdmin(test).get('/api/v1/admin/metrics')).json();
    // En esta suite no hay integracion externa: lo honesto es null, no una fecha.
    expect(body.evidence.lastSyncAt).toBeNull();
    expect(body.evidence.storedBattles).toBe(0);
  });

  it('no filtra nada del token', async () => {
    const response = await asAdmin(test).get('/api/v1/admin/metrics');
    expect(response.body).not.toContain('Bearer');
    expect(response.body.toLowerCase()).not.toContain('token');
  });

  it('exige sesion', async () => {
    const response = await test.app.inject({ method: 'GET', url: '/api/v1/admin/metrics' });
    expect(response.statusCode).toBe(401);
  });
});

/* ========================================================================== */
/* Incomparecencia (P-01)                                                      */
/* ========================================================================== */

/**
 * El flujo completo de una incomparecencia.
 *
 * Lo que se prueba aqui no es que se sumen tres puntos, sino las cuatro cosas
 * que harian que este partido dejara de distinguirse de una victoria jugada:
 * un marcador inventado, cuatro puntos en vez de tres, coronas que muevan la
 * diferencia, y un contador de victorias por tres coronas que suba.
 */
describe('incomparecencia', () => {
  let matchId: string;
  let homeId: string;
  let awayId: string;
  const scheduledAt = '2026-10-01T21:00:00.000Z';

  beforeAll(async () => {
    const rounds = (await test.app.inject({ method: 'GET', url: '/api/v1/fixture' })).json().rounds;
    const match = rounds[8].matches[0];
    matchId = match.id;
    homeId = match.home.id;
    awayId = match.away.id;

    await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/schedule`, { scheduledAt });
  });

  it('no se puede declarar antes de que pase la tolerancia', async () => {
    test.clock.current = new Date('2026-10-01T21:10:00.000Z');

    const response = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/walkover`, {
      absentPlayerId: awayId,
      reason: 'No aparecio',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('TOLERANCE_NOT_ELAPSED');
    // Y dice desde cuando se puede, que es lo util.
    expect(response.json().error.details.toleranceMinutes).toBe(15);
    expect(response.json().error.details.canDeclareFrom).toBe('2026-10-01T21:15:00.000Z');
  });

  it('exige decir quien no se presento', async () => {
    test.clock.current = new Date('2026-10-01T21:30:00.000Z');

    const response = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/walkover`, {
      reason: 'No aparecio',
    });
    expect(response.statusCode).toBe(400);
  });

  it('exige un motivo por escrito', async () => {
    const response = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/walkover`, {
      absentPlayerId: awayId,
      reason: '',
    });
    expect(response.statusCode).toBe(400);
  });

  it('exige sesion', async () => {
    const response = await test.app.inject({
      method: 'POST',
      url: `/api/v1/admin/matches/${matchId}/walkover`,
      payload: { absentPlayerId: awayId, reason: 'sin sesion' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('el ausente tiene que ser uno de los dos', async () => {
    const otro = (await test.app.inject({ method: 'GET', url: '/api/v1/players' }))
      .json()
      .players.find((player: { id: string }) => player.id !== homeId && player.id !== awayId);

    const response = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/walkover`, {
      absentPlayerId: otro.id,
      reason: 'Confundido',
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('ABSENT_PLAYER_NOT_IN_MATCH');
  });

  it('pasada la tolerancia, el presente gana sin coronas', async () => {
    const before = await standings();
    const antesGanador = before.rows.find((row: { playerId: string }) => row.playerId === homeId);

    const response = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/walkover`, {
      absentPlayerId: awayId,
      reason: 'No se presento pasados los 15 minutos de tolerancia.',
    });
    expect(response.statusCode).toBe(200);

    const match = await matchDetail(matchId);
    expect(match.status).toBe('COMPLETED');
    // Cero coronas: no hubo batalla. Un 3-0 inventado moveria la diferencia de
    // coronas, que es el primer desempate despues de los puntos.
    expect(match.result?.homeCrowns).toBe(0);
    expect(match.result?.awayCrowns).toBe(0);

    const after = await standings();
    const ganador = after.rows.find((row: { playerId: string }) => row.playerId === homeId);
    const ausente = after.rows.find((row: { playerId: string }) => row.playerId === awayId);

    expect(ganador.points).toBe((antesGanador?.points ?? 0) + 3);
    expect(ganador.crownDiff).toBe(antesGanador?.crownDiff ?? 0);
    expect(ganador.played).toBe((antesGanador?.played ?? 0) + 1);
    expect(ganador.wins).toBe((antesGanador?.wins ?? 0) + 1);
    // Y no sube el recuento de victorias por tres coronas: esa hay que jugarla.
    expect(ganador.maxCrownWins).toBe(antesGanador?.maxCrownWins ?? 0);
    expect(ausente.losses).toBeGreaterThan(0);
  });

  it('no es una victoria de tres coronas', async () => {
    const detail = (await asAdmin(test).get(`/api/v1/admin/matches/${matchId}`)).json();

    expect(detail.result.victoryType).toBe('WALKOVER');
    expect(detail.result.resolution).toBe('WALKOVER');
    expect(detail.result.points.home).toBe(3);
    expect(detail.result.points.home).not.toBe(4);
  });

  it('la auditoria guarda quien falto y desde cuando se contaba', async () => {
    const entries = (
      await asAdmin(test).get('/api/v1/admin/audit?action=WALKOVER_DECLARED')
    ).json();
    const entry = entries.find((row: { entityId: string }) => row.entityId === matchId);

    expect(entry).toBeDefined();
    expect(entry.payload.absentPlayerId).toBe(awayId);
    expect(entry.payload.winnerId).toBe(homeId);
    expect(entry.payload.scheduledAt).toBe(scheduledAt);
    expect(entry.payload.toleranceMinutes).toBe(15);
    expect(entry.payload.reason).toContain('tolerancia');
    expect(entry.actor).toBe('Administrador');
    expect(entry.requestId).not.toBeNull();
  });

  it('no se declara dos veces', async () => {
    const response = await asAdmin(test).post(`/api/v1/admin/matches/${matchId}/walkover`, {
      absentPlayerId: awayId,
      reason: 'Otra vez',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('RESULT_ALREADY_RECORDED');
  });

  it('un partido sin hora prevista no admite incomparecencia', async () => {
    const rounds = (await test.app.inject({ method: 'GET', url: '/api/v1/fixture' })).json().rounds;
    const sinFecha = rounds[9].matches[0];

    const response = await asAdmin(test).post(`/api/v1/admin/matches/${sinFecha.id}/walkover`, {
      absentPlayerId: sinFecha.away.id,
      reason: 'No aparecio',
    });

    // Sin hora prevista no hay desde cuando contar la tolerancia.
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('MATCH_NOT_SCHEDULED');
  });
});
