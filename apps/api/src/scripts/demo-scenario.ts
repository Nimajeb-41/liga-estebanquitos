/**
 * Escenario de demostracion.
 *
 * Deja el torneo en un estado con algo que mirar: calendario publicado, dos
 * jornadas jugadas, un partido en directo, uno aplazado, uno en disputa y una
 * sancion. Sirve para ver la interfaz y para los tests de extremo a extremo.
 *
 * Dos garantias:
 *
 * 1. Solo se ejecuta contra la base de datos efimera del servidor de
 *    demostracion. No toca datos reales.
 * 2. Todo se hace llamando a la API real, con sesion de administrador. No se
 *    escribe una fila a mano, asi que el escenario no puede llegar a un estado
 *    que la competicion no permita.
 */

import type { FastifyInstance } from 'fastify';

import { DEMO_TAGS as DEMO_CLASH_TAGS } from './demo-clash-client.ts';

export interface ScenarioOptions {
  readonly app: FastifyInstance;
  readonly email: string;
  readonly password: string;
}

export interface ScenarioResult {
  readonly completed: number;
  readonly live: number;
  readonly postponed: number;
  readonly disputed: number;
  readonly sanctions: number;
  readonly clashLinks: number;
  readonly clashCandidates: number;
}

interface MatchRow {
  readonly id: string;
  readonly home: { readonly id: string; readonly displayName: string };
  readonly away: { readonly id: string; readonly displayName: string };
}

/** Marcadores fijos: el escenario tiene que ser el mismo en cada arranque. */
const SCORES: readonly (readonly [number, number])[] = [
  [3, 1],
  [2, 0],
  [3, 0],
  [1, 3],
  [2, 1],
  [3, 2],
  [0, 3],
  [2, 0],
];

export async function applyDemoScenario(options: ScenarioOptions): Promise<ScenarioResult> {
  const { app } = options;

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: options.email, password: options.password },
  });
  const session = login.cookies.find((entry) => entry.name === 'liga_admin_session');
  if (session === undefined) throw new Error('El escenario no pudo iniciar sesion.');
  const cookie = `liga_admin_session=${session.value}`;

  // `inject` devuelve un encadenable; se espera aqui para trabajar con la
  // respuesta ya resuelta.
  const post = async (url: string, payload: object = {}) =>
    await app.inject({ method: 'POST', url, headers: { cookie }, payload });

  await post('/api/v1/admin/tournament/status', { status: 'READY' });
  await post('/api/v1/admin/fixture/generate', { seed: 'demo-2026-1' });
  await post('/api/v1/admin/tournament/status', { status: 'LIVE' });

  const fixture = (await app.inject({ method: 'GET', url: '/api/v1/fixture' })).json() as {
    rounds: { number: number; matches: MatchRow[] }[];
  };

  const first = fixture.rounds[0]?.matches ?? [];
  const second = fixture.rounds[1]?.matches ?? [];

  let completed = 0;

  // Jornada 1: cuatro resultados; el quinto se aplaza.
  for (const [index, match] of first.slice(0, 4).entries()) {
    const [homeCrowns, awayCrowns] = SCORES[index] ?? [3, 1];
    const response = await post(`/api/v1/admin/matches/${match.id}/result`, {
      homeCrowns,
      awayCrowns,
    });
    if (response.statusCode === 200 || response.statusCode === 201) completed += 1;
  }

  let postponed = 0;
  const toPostpone = first[4];
  if (toPostpone !== undefined) {
    const response = await post(`/api/v1/admin/matches/${toPostpone.id}/postpone`, {
      reason: 'CONNECTION',
      notes: 'DEMO: corte de internet de uno de los jugadores.',
    });
    if (response.statusCode === 200) postponed += 1;
  }

  // Jornada 2: tres resultados, uno en directo y uno en disputa.
  for (const [index, match] of second.slice(0, 3).entries()) {
    const [homeCrowns, awayCrowns] = SCORES[index + 4] ?? [2, 1];
    const response = await post(`/api/v1/admin/matches/${match.id}/result`, {
      homeCrowns,
      awayCrowns,
    });
    if (response.statusCode === 200 || response.statusCode === 201) completed += 1;
  }

  let live = 0;
  const toLive = second[3];
  if (toLive !== undefined) {
    const response = await post(`/api/v1/admin/matches/${toLive.id}/live`, {});
    if (response.statusCode === 200) live += 1;
  }

  // Disputa: los dos jugadores reportan marcadores distintos.
  let disputed = 0;
  const toDispute = second[4];
  if (toDispute !== undefined) {
    await post(`/api/v1/admin/matches/${toDispute.id}/report-result`, {
      playerId: toDispute.home.id,
      homeCrowns: 3,
      awayCrowns: 1,
    });
    const conflict = await post(`/api/v1/admin/matches/${toDispute.id}/report-result`, {
      playerId: toDispute.away.id,
      homeCrowns: 1,
      awayCrowns: 3,
    });
    if (conflict.statusCode === 200) disputed += 1;
  }

  // Una sancion, para que la pagina publica tenga algo que mostrar.
  let sanctions = 0;
  const sanctioned = first[0]?.away;
  if (sanctioned !== undefined) {
    const response = await post('/api/v1/admin/sanctions', {
      playerId: sanctioned.id,
      type: 'BM',
      reason: 'DEMO: spam de emotes durante la partida.',
    });
    if (response.statusCode === 201) sanctions += 1;
  }

  // Evidencia externa: cuatro cuentas vinculadas y sus batallas importadas.
  // El cliente de Clash Royale de la demostracion devuelve fixtures, asi que
  // esto funciona sin token y sin depender de que la IP siga siendo la misma.
  let clashLinks = 0;
  let clashCandidates = 0;

  const players = (await app.inject({ method: 'GET', url: '/api/v1/players' })).json() as {
    players: { id: string }[];
  };

  for (const [index, tag] of DEMO_CLASH_TAGS.entries()) {
    const player = players.players[index];
    if (player === undefined) break;
    const linked = await post(`/api/v1/admin/clash-royale/links/${player.id}`, { clashTag: tag });
    if (linked.statusCode !== 200) continue;
    clashLinks += 1;

    await post(`/api/v1/admin/clash-royale/sync/${player.id}`);
  }

  await post('/api/v1/admin/clash-royale/cards/sync');

  // Se cuentan al final y no sumando cada respuesta: un candidato puede nacer
  // al sincronizar o al vincular la etiqueta que faltaba.
  const queue = await app.inject({
    method: 'GET',
    url: '/api/v1/admin/clash-royale/candidates',
    headers: { cookie },
  });
  if (queue.statusCode === 200) clashCandidates = (queue.json() as unknown[]).length;

  return { completed, live, postponed, disputed, sanctions, clashLinks, clashCandidates };
}
