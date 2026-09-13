/**
 * Conformidad con el contrato.
 *
 * `@liga/contracts` define la forma de cada respuesta y el frontend deriva sus
 * tipos de ahí. Estos tests comprueban que lo que devuelve la API encaja
 * exactamente en ese contrato: si alguien cambia una respuesta sin actualizar el
 * contrato, esto falla antes de que lo descubra el frontend.
 */

import {
  auditEntrySchema,
  adminMatchDetailSchema,
  adminPlayersResponseSchema,
  adminSanctionSchema,
  apiErrorSchema,
  fixtureSchema,
  matchDetailSchema,
  matchSchema,
  playersResponseSchema,
  publicSanctionSchema,
  roundSchema,
  rulesSchema,
  standingsSchema,
  statsSchema,
  tournamentOverviewSchema,
} from '@liga/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { asAdmin, createTestApp, startCompetition, type TestApp } from './helpers.ts';

let test: TestApp;

async function get(url: string): Promise<unknown> {
  const response = await test.app.inject({ method: 'GET', url });
  expect(response.statusCode, `${url} devolvio ${response.statusCode}: ${response.body}`).toBe(200);
  return response.json();
}

function check<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `${label} no cumple el contrato:\n${result.error.issues
        .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
        .join('\n')}`,
    );
  }
  return result.data;
}

beforeAll(async () => {
  test = await createTestApp({ withTestPlayers: true });
  await startCompetition(test, 'semilla-contratos');

  // Un poco de vida real: un resultado, un aplazamiento y una sancion.
  const admin = asAdmin(test);
  const fixture = (await get('/api/v1/fixture')) as {
    rounds: { matches: { id: string; home: { id: string } }[] }[];
  };
  const round = fixture.rounds[0] as { matches: { id: string; home: { id: string } }[] };
  const first = round.matches[0] as { id: string; home: { id: string } };
  const second = round.matches[1] as { id: string };

  await admin.post(`/api/v1/admin/matches/${first.id}/result`, {
    homeCrowns: 3,
    awayCrowns: 1,
  });
  await admin.post(`/api/v1/admin/matches/${second.id}/postpone`, {
    reason: 'CONNECTION',
    notes: 'Corte de internet confirmado',
  });
  await admin.post('/api/v1/admin/sanctions', {
    playerId: first.home.id,
    type: 'BM',
    reason: 'Provocacion repetida tras cada torre',
  });
});

afterAll(async () => {
  await test.close();
});

describe('contrato de las respuestas publicas', () => {
  it('GET /api/v1/tournament', async () => {
    const overview = check(tournamentOverviewSchema, await get('/api/v1/tournament'), 'tournament');
    expect(overview.progress.total).toBe(90);
    expect(overview.progress.completed).toBe(1);
    expect(overview.progress.postponed).toBe(1);
    expect(overview.progress.currentRound).toBe(1);
  });

  it('GET /api/v1/rules', async () => {
    const rules = check(rulesSchema, await get('/api/v1/rules'), 'rules');
    // Los empates siguen sin admitirse; la incomparecencia ya esta decidida
    // (P-01, 10 de septiembre de 2026).
    expect(rules.pending.draws).toBe(true);
    expect(rules.pending.walkovers).toBe(false);
    expect(rules.scoring.walkoverWin).toBe(3);
    // Tres puntos, no cuatro: no es una victoria de tres coronas.
    expect(rules.scoring.walkoverWin).not.toBe(rules.scoring.winWithMaxCrowns);
    expect(rules.scoring.walkoverCrowns).toEqual([0, 0]);
  });

  it('GET /api/v1/players', async () => {
    const players = check(playersResponseSchema, await get('/api/v1/players'), 'players');
    expect(players.players.length).toBeGreaterThan(0);
    // La proyeccion publica no lleva notas internas.
    expect(Object.keys(players.players[0] as object)).not.toContain('notes');
  });

  it('GET /api/v1/fixture', async () => {
    const fixture = check(fixtureSchema, await get('/api/v1/fixture'), 'fixture');
    expect(fixture.rounds).toHaveLength(18);
    expect(fixture.rounds.flatMap((round) => round.matches)).toHaveLength(90);
  });

  it('GET /api/v1/rounds y /rounds/:numero', async () => {
    check(z.array(roundSchema), await get('/api/v1/rounds'), 'rounds');
    const round = check(
      roundSchema.extend({ matches: z.array(matchSchema) }),
      await get('/api/v1/rounds/1'),
      'round',
    );
    expect(round.number).toBe(1);
    expect(round.matches).toHaveLength(5);
  });

  it('GET /api/v1/matches y /matches/:id', async () => {
    const matches = check(z.array(matchSchema), await get('/api/v1/matches'), 'matches');
    const completed = matches.find((match) => match.status === 'COMPLETED');
    expect(completed?.result?.outcome).toBe('HOME_WIN');
    expect(completed?.result?.victoryType).toBe('MAX_CROWNS');
    expect(completed?.result?.points).toEqual({ home: 4, away: 0 });
    expect(completed?.result?.crownDiff).toEqual({ home: 2, away: -2 });

    const id = (completed as { id: string }).id;

    const detail = check(matchDetailSchema, await get(`/api/v1/matches/${id}`), 'matchDetail');
    expect(detail.history.corrections).toHaveLength(1);
    // La proyeccion publica no lleva reportes ni motivos: solo el recuento.
    expect(detail.history).not.toHaveProperty('reports');
    expect(detail.history).not.toHaveProperty('revisions');

    const admin = await asAdmin(test).get(`/api/v1/admin/matches/${id}`);
    expect(admin.statusCode).toBe(200);
    const full = check(adminMatchDetailSchema, admin.json(), 'adminMatchDetail');
    expect(full.history.revisions).toHaveLength(1);
  });

  it('la ficha publica de un partido no filtra datos administrativos', async () => {
    const matches = check(z.array(matchSchema), await get('/api/v1/matches'), 'matches');
    const completed = matches.find((match) => match.status === 'COMPLETED');
    const raw = (await get(`/api/v1/matches/${(completed as { id: string }).id}`)) as {
      history: { postponements: unknown[] };
    };
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toContain('evidenceUrl');
    expect(serialized).not.toContain('"notes"');
    expect(serialized).not.toContain('"reason"');
  });

  it('la ficha completa de un partido exige sesion', async () => {
    const matches = check(z.array(matchSchema), await get('/api/v1/matches'), 'matches');
    const id = (matches[0] as { id: string }).id;
    const response = await test.app.inject({ method: 'GET', url: `/api/v1/admin/matches/${id}` });
    expect(response.statusCode).toBe(401);
  });

  it('GET /api/v1/standings', async () => {
    const standings = check(standingsSchema, await get('/api/v1/standings'), 'standings');
    expect(standings.rows).toHaveLength(10);
    expect(standings.upToRound).toBe(1);

    const leader = standings.rows[0];
    expect(leader?.form).toEqual(['W']);
    expect(leader?.currentStreak).toEqual({ type: 'W', length: 1 });
    expect(leader?.positionChange).toBeNull();
  });

  it('GET /api/v1/stats', async () => {
    const stats = check(statsSchema, await get('/api/v1/stats'), 'stats');
    expect(stats.mostWins.length).toBeGreaterThan(0);
    // Las metricas que dependen de una regla pendiente se declaran, no se
    // inventan. P-01 ya no esta ahi: se decidio.
    const reglas = stats.unavailable.map((item) => item.rule);
    expect(reglas).not.toContain('P-01');
    expect(reglas).toContain('R-01');
  });

  it('GET /api/v1/sanctions no expone evidencia ni notas internas', async () => {
    const sanctions = check(
      z.array(publicSanctionSchema),
      await get('/api/v1/sanctions'),
      'sanctions',
    );
    expect(sanctions).toHaveLength(1);
    const keys = Object.keys(sanctions[0] as object);
    expect(keys).not.toContain('evidenceUrl');
    expect(keys).not.toContain('notes');
    expect(keys).not.toContain('revokedReason');
  });
});

describe('contrato de las respuestas de administracion', () => {
  it('GET /api/v1/admin/players incluye las notas internas', async () => {
    const response = await asAdmin(test).get('/api/v1/admin/players');
    expect(response.statusCode).toBe(200);
    const players = check(adminPlayersResponseSchema, response.json(), 'adminPlayers');
    expect(Object.keys(players.players[0] as object)).toContain('notes');
  });

  it('GET /api/v1/admin/sanctions incluye evidencia y observaciones', async () => {
    const response = await asAdmin(test).get('/api/v1/admin/sanctions');
    expect(response.statusCode).toBe(200);
    check(z.array(adminSanctionSchema), response.json(), 'adminSanctions');
  });

  it('GET /api/v1/admin/audit', async () => {
    const response = await asAdmin(test).get('/api/v1/admin/audit');
    check(z.array(auditEntrySchema), response.json(), 'audit');
  });

  it('los errores tambien cumplen su contrato', async () => {
    const response = await test.app.inject({ method: 'GET', url: '/api/v1/no-existe' });
    check(apiErrorSchema, response.json(), 'error');
  });
});
