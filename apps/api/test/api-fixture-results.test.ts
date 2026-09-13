/** Fixture oficial, resultados, puntuacion y clasificacion, contra PostgreSQL. */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, createTestApp, type TestApp } from './helpers.ts';

let test: TestApp;

interface MatchView {
  id: string;
  status: string;
  home: { id: string; displayName: string };
  away: { id: string; displayName: string };
  result: { homeCrowns: number; awayCrowns: number; version: number } | null;
}

async function fixture(): Promise<{
  rounds: { number: number; leg: number; matches: MatchView[] }[];
  seed: string;
  generated: boolean;
}> {
  return (await test.app.inject({ method: 'GET', url: '/api/v1/fixture' })).json();
}

interface StandingsRowView {
  playerId: string;
  played: number;
  wins: number;
  losses: number;
  crownsFor: number;
  crownsAgainst: number;
  crownDiff: number;
  matchPoints: number;
  sanctionPoints: number;
  points: number;
}

async function standings(): Promise<{ rows: StandingsRowView[] }> {
  return (await test.app.inject({ method: 'GET', url: '/api/v1/standings' })).json();
}

function rowOf(
  table: { rows: StandingsRowView[] },
  playerId: string,
): StandingsRowView | undefined {
  return table.rows.find((row) => row.playerId === playerId);
}

beforeAll(async () => {
  test = await createTestApp({ withTestPlayers: true });
});

afterAll(async () => {
  await test.close();
});

describe('generacion del fixture', () => {
  it('no genera nada mientras el torneo no este cerrado', async () => {
    const response = await asAdmin(test).post('/api/v1/admin/fixture/generate', {});
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('OPERATION_NOT_ALLOWED_IN_STATUS');
  });

  it('cierra la plantilla con exactamente 10 confirmados', async () => {
    const players = (await test.app.inject({ method: 'GET', url: '/api/v1/players' })).json();
    expect(players.summary.confirmed).toBe(10);
    const response = await asAdmin(test).post('/api/v1/admin/tournament/status', {
      status: 'READY',
    });
    expect(response.statusCode).toBe(200);
  });

  it('genera 18 jornadas, 5 partidos por jornada y 90 partidos', async () => {
    const response = await asAdmin(test).post('/api/v1/admin/fixture/generate', {
      seed: 'sorteo-de-prueba',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ rounds: 18, matches: 90, seed: 'sorteo-de-prueba' });

    const data = await fixture();
    expect(data.rounds).toHaveLength(18);
    for (const round of data.rounds) expect(round.matches).toHaveLength(5);
    expect(data.rounds.flatMap((round) => round.matches)).toHaveLength(90);
  });

  it('deja el torneo en SCHEDULED y guarda la semilla', async () => {
    const tournament = (await test.app.inject({ method: 'GET', url: '/api/v1/tournament' })).json();
    expect(tournament.status).toBe('SCHEDULED');
    expect(tournament.fixture.seed).toBe('sorteo-de-prueba');
    expect(tournament.fixture.matches).toBe(90);
  });

  it('enfrenta a cada pareja dos veces, una en cada condicion', async () => {
    const data = await fixture();
    const oriented = new Set<string>();
    const pairs = new Map<string, number>();
    for (const round of data.rounds) {
      for (const match of round.matches) {
        oriented.add(`${match.home.id}>${match.away.id}`);
        const key = [match.home.id, match.away.id].sort().join('|');
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
    expect(oriented.size).toBe(90);
    expect(pairs.size).toBe(45);
    for (const count of pairs.values()) expect(count).toBe(2);
  });

  it('no permite regenerar el calendario por accidente', async () => {
    const response = await asAdmin(test).post('/api/v1/admin/fixture/generate', {});
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('FIXTURE_ALREADY_EXISTS');
  });

  it('registra como se genero, para poder auditarlo', async () => {
    const audit = await asAdmin(test).get('/api/v1/admin/audit');
    const entry = audit
      .json()
      .find((row: { action: string }) => row.action === 'FIXTURE_GENERATED');
    expect(entry).toBeDefined();
    expect(entry.payload.seed).toBe('sorteo-de-prueba');
    expect(entry.payload.matches).toBe(90);
  });
  it('no borra a quien ya figura en el calendario', async () => {
    /*
      Borrarlo dejaria partidos apuntando a un participante inexistente: la
      jornada dejaria de entenderse y la clasificacion —que se deriva— pasaria
      a calcularse sobre un calendario incompleto sin decirlo.
    */
    const players = (await test.app.inject({ method: 'GET', url: '/api/v1/players' })).json();
    const target = players.players.find((row: { slot: number | null }) => row.slot === 1);

    const response = await asAdmin(test).delete(`/api/v1/admin/players/${target.id}`);

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('PLAYER_HAS_MATCHES');
  });
});

describe('resultados y puntuacion', () => {
  it('arranca la competicion', async () => {
    const response = await asAdmin(test).post('/api/v1/admin/tournament/status', {
      status: 'LIVE',
    });
    expect(response.statusCode).toBe(200);
  });

  it('da 4 puntos por victoria con 3 coronas (3-0, 3-1 y 3-2)', async () => {
    const admin = asAdmin(test);
    const data = await fixture();
    const round = data.rounds[0] as { matches: MatchView[] };

    const scores: [number, number][] = [
      [3, 0],
      [3, 1],
      [3, 2],
    ];
    for (const [index, score] of scores.entries()) {
      const match = round.matches[index] as MatchView;
      const response = await admin.post(`/api/v1/admin/matches/${match.id}/result`, {
        homeCrowns: score[0],
        awayCrowns: score[1],
      });
      expect(response.statusCode).toBe(200);
    }

    const table = await standings();
    for (const [index] of scores.entries()) {
      const match = round.matches[index] as MatchView;
      expect(rowOf(table, match.home.id)?.points).toBe(4);
      expect(rowOf(table, match.away.id)?.points).toBe(0);
    }
  });

  it('da 3 puntos por victoria normal (2-0 y 2-1)', async () => {
    const admin = asAdmin(test);
    const data = await fixture();
    const round = data.rounds[0] as { matches: MatchView[] };

    const cases: [number, [number, number]][] = [
      [3, [2, 0]],
      [4, [2, 1]],
    ];
    for (const [index, score] of cases) {
      const match = round.matches[index] as MatchView;
      const response = await admin.post(`/api/v1/admin/matches/${match.id}/result`, {
        homeCrowns: score[0],
        awayCrowns: score[1],
      });
      expect(response.statusCode).toBe(200);
    }

    const table = await standings();
    for (const [index] of cases) {
      const match = round.matches[index] as MatchView;
      expect(rowOf(table, match.home.id)?.points).toBe(3);
      expect(rowOf(table, match.away.id)?.points).toBe(0);
    }
  });

  it('actualiza PJ, coronas y diferencia de coronas', async () => {
    const data = await fixture();
    const match = (data.rounds[0] as { matches: MatchView[] }).matches[0] as MatchView;
    const table = await standings();
    const winner = rowOf(table, match.home.id);
    const loser = rowOf(table, match.away.id);

    expect(winner?.played).toBe(1);
    expect(winner?.wins).toBe(1);
    expect(winner?.crownsFor).toBe(3);
    expect(winner?.crownsAgainst).toBe(0);
    expect(winner?.crownDiff).toBe(3);
    expect(loser?.losses).toBe(1);
    expect(loser?.crownDiff).toBe(-3);
  });

  it('rechaza un marcador imposible y un empate', async () => {
    const admin = asAdmin(test);
    const data = await fixture();
    const match = (data.rounds[1] as { matches: MatchView[] }).matches[0] as MatchView;

    const both3 = await admin.post(`/api/v1/admin/matches/${match.id}/result`, {
      homeCrowns: 3,
      awayCrowns: 3,
    });
    expect(both3.statusCode).toBe(422);
    expect(both3.json().error.code).toBe('INVALID_CROWNS');

    const draw = await admin.post(`/api/v1/admin/matches/${match.id}/result`, {
      homeCrowns: 2,
      awayCrowns: 2,
    });
    expect(draw.statusCode).toBe(422);
    expect(draw.json().error.code).toBe('DRAW_NOT_ALLOWED');

    const outOfRange = await admin.post(`/api/v1/admin/matches/${match.id}/result`, {
      homeCrowns: 9,
      awayCrowns: 0,
    });
    expect(outOfRange.statusCode).toBe(422);
  });

  it('no deja colar un walkover por la puerta del marcador', async () => {
    const data = await fixture();
    const match = (data.rounds[1] as { matches: MatchView[] }).matches[1] as MatchView;
    const response = await asAdmin(test).post(`/api/v1/admin/matches/${match.id}/result`, {
      homeCrowns: 3,
      awayCrowns: 0,
      resolution: 'WALKOVER',
    });
    // Una incomparecencia no tiene marcador. Se declara por su propia via,
    // que exige tolerancia cumplida, quien falto y motivo.
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('ABSENT_PLAYER_REQUIRED');
  });

  it('corrige un resultado conservando el anterior y rehaciendo la tabla', async () => {
    const admin = asAdmin(test);
    const data = await fixture();
    const match = (data.rounds[0] as { matches: MatchView[] }).matches[0] as MatchView;

    const before = rowOf(await standings(), match.home.id);
    expect(before?.points).toBe(4);

    const corrected = await admin.post(`/api/v1/admin/matches/${match.id}/correct-result`, {
      homeCrowns: 0,
      awayCrowns: 3,
      reason: 'Se cargo invertido al transcribir la captura',
    });
    expect(corrected.statusCode).toBe(200);
    expect(corrected.json().revision).toBe(2);

    const after = rowOf(await standings(), match.home.id);
    expect(after?.points).toBe(0);
    expect(after?.crownDiff).toBe(-3);
    expect(rowOf(await standings(), match.away.id)?.points).toBe(4);

    // El motivo de una correccion solo se ve desde administracion: si se
    // publica, y como, lo decide P-10.
    const detail = (await asAdmin(test).get(`/api/v1/admin/matches/${match.id}`)).json();
    expect(detail.history.revisions).toHaveLength(2);
    expect(detail.history.revisions[1].previousValue).toMatchObject({
      homeCrowns: 3,
      awayCrowns: 0,
    });
    expect(detail.history.revisions[1].reason).toContain('invertido');
    expect(detail.result.version).toBe(2);
  });

  it('exige motivo para corregir', async () => {
    const data = await fixture();
    const match = (data.rounds[0] as { matches: MatchView[] }).matches[0] as MatchView;
    const response = await asAdmin(test).post(`/api/v1/admin/matches/${match.id}/correct-result`, {
      homeCrowns: 1,
      awayCrowns: 0,
      reason: '',
    });
    expect(response.statusCode).toBe(400);
  });

  it('no deja editar la clasificacion: no existe endpoint para ello', async () => {
    const response = await asAdmin(test).post('/api/v1/admin/standings', { rows: [] });
    expect(response.statusCode).toBe(404);
  });
});

describe('sanciones', () => {
  it('descuenta 2 puntos y deja la sancion auditada', async () => {
    const admin = asAdmin(test);
    const data = await fixture();
    const match = (data.rounds[0] as { matches: MatchView[] }).matches[1] as MatchView;

    const before = rowOf(await standings(), match.home.id);
    const created = await admin.post('/api/v1/admin/sanctions', {
      playerId: match.home.id,
      type: 'BM',
      reason: 'Spam deliberado de emotes tras cada torre, validado por el administrador',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().points).toBe(-2);

    const after = rowOf(await standings(), match.home.id);
    expect(after?.points).toBe((before?.points ?? 0) - 2);
    expect(after?.matchPoints).toBe(before?.matchPoints);
    expect(after?.sanctionPoints).toBe(-2);

    const audit = await admin.get('/api/v1/admin/audit');
    expect(audit.json().some((row: { action: string }) => row.action === 'SANCTION_CREATED')).toBe(
      true,
    );
  });

  it('anula una sancion sin borrarla y devuelve los puntos', async () => {
    const admin = asAdmin(test);
    const sanctions = (await test.app.inject({ method: 'GET', url: '/api/v1/sanctions' })).json();
    const sanction = sanctions[0];
    const before = rowOf(await standings(), sanction.playerId);

    const response = await admin.post(`/api/v1/admin/sanctions/${sanction.id}/revoke`, {
      reason: 'Revisada la evidencia, no constituye BM',
    });
    expect(response.statusCode).toBe(200);

    const after = rowOf(await standings(), sanction.playerId);
    expect(after?.points).toBe((before?.points ?? 0) + 2);

    const stored = (await test.app.inject({ method: 'GET', url: '/api/v1/sanctions' })).json();
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('REVOKED');
    // El motivo de la anulacion es informacion administrativa: no se publica.
    expect(Object.keys(stored[0])).not.toContain('revokedReason');

    const internal = (await admin.get('/api/v1/admin/sanctions')).json();
    expect(internal[0].revokedReason).toContain('no constituye BM');
  });

  it('rechaza una sancion que sume puntos', async () => {
    const data = await fixture();
    const match = (data.rounds[0] as { matches: MatchView[] }).matches[0] as MatchView;
    const response = await asAdmin(test).post('/api/v1/admin/sanctions', {
      playerId: match.home.id,
      type: 'BM',
      reason: 'intento de sumar puntos',
      points: 3,
    });
    expect(response.statusCode).toBe(400);
  });
});
