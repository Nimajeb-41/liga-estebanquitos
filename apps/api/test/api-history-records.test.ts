/**
 * Evolucion de la tabla, cara a cara y records, de punta a punta.
 *
 * Lo que se comprueba aqui no es el calculo —eso es del dominio y tiene sus
 * propios tests— sino que lo que sale por HTTP sea coherente con la
 * clasificacion que se publica en la misma temporada.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, createTestApp, type TestApp } from './helpers.ts';

let test: TestApp;

interface MatchView {
  id: string;
  home: { id: string; slug: string };
  away: { id: string; slug: string };
}

async function round(number: number): Promise<MatchView[]> {
  return (await test.app.inject({ method: 'GET', url: `/api/v1/rounds/${number}` })).json().matches;
}

beforeAll(async () => {
  test = await createTestApp({ withTestPlayers: true });
  const admin = asAdmin(test);
  await admin.post('/api/v1/admin/tournament/status', { status: 'READY' });
  await admin.post('/api/v1/admin/fixture/generate', { seed: 'historia' });
  await admin.post('/api/v1/admin/tournament/status', { status: 'LIVE' });

  // Dos jornadas jugadas: suficiente para que haya evolucion que mirar.
  const one = await round(1);
  const scores: [number, number][] = [
    [3, 0],
    [3, 1],
    [2, 1],
    [1, 2],
    [0, 3],
  ];
  for (const [index, score] of scores.entries()) {
    await admin.post(`/api/v1/admin/matches/${one[index]!.id}/result`, {
      homeCrowns: score[0],
      awayCrowns: score[1],
    });
  }

  const two = await round(2);
  for (const match of two.slice(0, 3)) {
    await admin.post(`/api/v1/admin/matches/${match.id}/result`, {
      homeCrowns: 2,
      awayCrowns: 0,
    });
  }
});

afterAll(async () => {
  await test.close();
});

describe('evolucion de la clasificacion', () => {
  it('solo lista las jornadas en las que se jugo algo', async () => {
    const response = await test.app.inject({ method: 'GET', url: '/api/v1/standings/history' });

    expect(response.statusCode).toBe(200);
    expect(response.json().rounds).toEqual([1, 2]);
  });

  it('la ultima jornada coincide con la tabla publicada', async () => {
    // Si discreparan, una de las dos pantallas estaria mintiendo.
    const history = (
      await test.app.inject({ method: 'GET', url: '/api/v1/standings/history' })
    ).json();
    const table = (await test.app.inject({ method: 'GET', url: '/api/v1/standings' })).json();

    for (const row of table.rows) {
      const series = history.players.find(
        (entry: { playerId: string }) => entry.playerId === row.playerId,
      );
      const last = series.points[series.points.length - 1];
      expect(last.position).toBe(row.position);
      expect(last.points).toBe(row.points);
    }
  });

  it('viaja la version del reglamento con la que se calculo', async () => {
    // Dos graficas con versiones distintas no son comparables.
    const history = (
      await test.app.inject({ method: 'GET', url: '/api/v1/standings/history' })
    ).json();
    const rules = (await test.app.inject({ method: 'GET', url: '/api/v1/rules' })).json();

    expect(history.rulesVersion).toBe(rules.rulesVersion);
  });

  it('es publica: no hace falta sesion', async () => {
    const response = await test.app.inject({ method: 'GET', url: '/api/v1/standings/history' });
    expect(response.statusCode).toBe(200);
  });
});

describe('cara a cara', () => {
  it('acepta slugs y devuelve a los dos en el mismo orden que se piden', async () => {
    const [match] = await round(1);
    const response = await test.app.inject({
      method: 'GET',
      url: `/api/v1/head-to-head/${match!.home.slug}/${match!.away.slug}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.players[0].slug).toBe(match!.home.slug);
    expect(body.players[1].slug).toBe(match!.away.slug);
    expect(body.played).toBe(1);
    expect(body.wins).toEqual([1, 0]);
    expect(body.crowns).toEqual([3, 0]);
  });

  it('invertir el orden invierte el marcador, no lo cambia', async () => {
    const [match] = await round(1);
    const directo = (
      await test.app.inject({
        method: 'GET',
        url: `/api/v1/head-to-head/${match!.home.slug}/${match!.away.slug}`,
      })
    ).json();
    const inverso = (
      await test.app.inject({
        method: 'GET',
        url: `/api/v1/head-to-head/${match!.away.slug}/${match!.home.slug}`,
      })
    ).json();

    expect(inverso.wins).toEqual([directo.wins[1], directo.wins[0]]);
    expect(inverso.crowns).toEqual([directo.crowns[1], directo.crowns[0]]);
    expect(inverso.leaderId).toBe(directo.leaderId);
  });

  it('rechaza compararse consigo mismo', async () => {
    const [match] = await round(1);
    const response = await test.app.inject({
      method: 'GET',
      url: `/api/v1/head-to-head/${match!.home.slug}/${match!.home.slug}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('SAME_PLAYER');
  });

  it('404 si uno de los dos no existe', async () => {
    const [match] = await round(1);
    const response = await test.app.inject({
      method: 'GET',
      url: `/api/v1/head-to-head/${match!.home.slug}/no-existe`,
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('records de temporada', () => {
  it('publica los cuatro con su codigo estable', async () => {
    const response = await test.app.inject({ method: 'GET', url: '/api/v1/records' });

    expect(response.statusCode).toBe(200);
    const codes = response.json().records.map((record: { code: string }) => record.code);
    expect(codes).toEqual([
      'BIGGEST_WIN',
      'MOST_CROWNS_IN_MATCH',
      'LONGEST_WIN_STREAK',
      'MOST_MAX_CROWN_WINS',
    ]);
  });

  it('la mayor diferencia nombra a quien la hizo', async () => {
    const records = (await test.app.inject({ method: 'GET', url: '/api/v1/records' })).json();
    const biggest = records.records.find(
      (record: { code: string }) => record.code === 'BIGGEST_WIN',
    );

    expect(biggest.value).toBe(3);
    expect(biggest.players).toHaveLength(1);
    expect(biggest.matchId).not.toBeNull();
    expect(biggest.roundNumber).toBe(1);
  });
});
