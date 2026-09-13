/**
 * Integracion con Clash Royale, de extremo a extremo.
 *
 * PostgreSQL real (PGlite) y la API entera, con **un cliente de Clash Royale
 * falso** alimentado por las fixtures del spike. `npm test` no toca internet.
 *
 * Lo que se comprueba aqui no es que el codigo corra: es que la evidencia
 * externa **no pueda** convertirse en resultado sin que una persona lo decida,
 * y que cuando lo decide, el resultado pase por el motor de siempre.
 *
 * El archivo se lee como una historia y se ejecuta en orden, igual que el resto
 * de suites de integracion del proyecto: vincular, sincronizar, revisar,
 * confirmar. Cada escenario usa su propia pareja de participantes para no
 * pisarse con los demas.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { schema } from '@liga/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ClashRoyaleClient } from '../src/integrations/clash-royale/client.ts';
import { ClashRoyaleError, type ClashBattle } from '../src/integrations/clash-royale/types.ts';
import { createTestApp, type TestApp } from './helpers.ts';

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'clash-royale',
);
const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8')) as T;

const FRIENDLY = fixture<ClashBattle>('friendly-battle.json');
const CARDS = fixture<{ items: { id: number }[] }>('cards.json');

/**
 * Etiquetas de prueba.
 *
 * Las dos primeras son las reales de la amistosa del spike. Las demas se
 * derivan para poder montar varios escenarios independientes: la **estructura**
 * de la batalla sigue siendo la que devolvio la API, solo cambian identidades y
 * horas.
 */
const TAGS = ['#CCC8UQU8Y', '#VUJLVYR8R', '#TAGC0001', '#TAGD0002', '#TAGE0003', '#TAGF0004'];

/** Clona la batalla real cambiando quienes juegan, cuando y con que marcador. */
function battleBetween(
  homeTag: string,
  awayTag: string,
  when: string,
  crowns: [number, number] = [1, 0],
  type = 'friendly',
): ClashBattle {
  const clone = structuredClone(FRIENDLY) as ClashBattle & {
    team: { tag: string; crowns: number }[];
    opponent: { tag: string; crowns: number }[];
    battleTime: string;
    type: string;
  };
  clone.battleTime = when;
  clone.type = type;
  clone.team[0]!.tag = homeTag;
  clone.team[0]!.crowns = crowns[0];
  clone.opponent[0]!.tag = awayTag;
  clone.opponent[0]!.crowns = crowns[1];
  return clone;
}

/** La misma batalla vista desde el otro historial: lados intercambiados. */
function mirror(battle: ClashBattle): ClashBattle {
  return {
    ...battle,
    ...(battle.opponent === undefined ? {} : { team: battle.opponent }),
    ...(battle.team === undefined ? {} : { opponent: battle.team }),
  };
}

/**
 * Cliente falso y mutable.
 *
 * Se le cambian los historiales y se le encolan fallos sin reconstruir la
 * aplicacion. Levantar una base de datos por escenario hacia esta suite
 * insoportablemente lenta.
 */
function fakeClient() {
  const state = {
    battlelogs: new Map<string, ClashBattle[]>(),
    playerError: null as unknown,
    battlelogError: null as unknown,
    cardsError: null as unknown,
    calls: [] as string[],
  };

  const client = {
    async getPlayer(tag: string) {
      state.calls.push(`getPlayer:${tag}`);
      if (state.playerError !== null) throw state.playerError;
      return { tag, name: `Cuenta ${tag.slice(1, 4)}` };
    },
    async getBattleLog(tag: string) {
      state.calls.push(`getBattleLog:${tag}`);
      if (state.battlelogError !== null) throw state.battlelogError;
      return state.battlelogs.get(tag) ?? [];
    },
    async getCards() {
      state.calls.push('getCards');
      if (state.cardsError !== null) throw state.cardsError;
      return { cards: CARDS.items, supportCards: [{ id: 159000000, name: 'Tower Princess' }] };
    },
  };

  return { client: client as unknown as ClashRoyaleClient, state };
}

/* -------------------------------------------------------------------------- */

let harness: TestApp;
let fake: ReturnType<typeof fakeClient>;
let players: { id: string; displayName: string }[];

const auth = () => ({ cookie: harness.cookie });
const post = (url: string, payload?: object) =>
  harness.app.inject({ method: 'POST', url, headers: auth(), ...(payload ? { payload } : {}) });
const get = (url: string, authenticated = true) =>
  harness.app.inject({ method: 'GET', url, ...(authenticated ? { headers: auth() } : {}) });

/** Vincula la etiqueta `index` al participante `index`. */
const link = (index: number) =>
  post(`/api/v1/admin/clash-royale/links/${players[index]!.id}`, { clashTag: TAGS[index]! });

const sync = (index: number) => post(`/api/v1/admin/clash-royale/sync/${players[index]!.id}`);

const candidatesFor = async (matchId: string) => {
  const all = (await get('/api/v1/admin/clash-royale/candidates')).json();
  return all.filter((entry: { match: { id: string } }) => entry.match.id === matchId);
};

/** Los partidos del calendario entre dos participantes (ida y vuelta). */
async function matchesBetween(first: string, second: string) {
  const rows = await harness.db.query.matches.findMany();
  return rows.filter(
    (row) =>
      (row.homePlayerId === first && row.awayPlayerId === second) ||
      (row.homePlayerId === second && row.awayPlayerId === first),
  );
}

beforeAll(async () => {
  fake = fakeClient();
  harness = await createTestApp({ withTestPlayers: true, clashRoyaleClient: fake.client });
  players = await harness.db.query.players
    .findMany({ columns: { id: true, displayName: true } })
    .then((rows) => rows.slice(0, TAGS.length));

  await post('/api/v1/admin/tournament/status', { status: 'READY' });
  await post('/api/v1/admin/fixture/generate', { seed: 'clash-royale-test' });
  await post('/api/v1/admin/tournament/status', { status: 'LIVE' });
}, 120_000);

afterAll(async () => {
  await harness.close();
});

/* ========================================================================== */
/* Vinculacion                                                                 */
/* ========================================================================== */

describe('vinculacion de etiquetas', () => {
  it('vincula una cuenta y la deja como NO verificada', async () => {
    const response = await link(0);

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.clashTag).toBe(TAGS[0]);
    // Vincular no es verificar. P-11 sigue abierta.
    expect(body.linkStatus).toBe('UNVERIFIED');
    expect(body.clashName).toBeTypeOf('string');
  });

  it('nunca marca una vinculacion como verificada', async () => {
    const row = await harness.db.query.players.findFirst({
      where: eq(schema.players.id, players[0]!.id),
    });

    expect(row?.clashLinkStatus).toBe('UNVERIFIED');
    // La columna de verificacion se queda vacia a proposito.
    expect(row?.clashTagVerifiedAt).toBeNull();
  });

  it('el nombre de Clash Royale no sustituye al de la liga', async () => {
    const row = await harness.db.query.players.findFirst({
      where: eq(schema.players.id, players[0]!.id),
    });
    expect(row?.clashName).not.toBe(row?.displayName);

    // El publico sigue viendo el nombre del torneo.
    const publicPlayer = (await get(`/api/v1/players/${players[0]!.id}`, false)).json();
    expect(publicPlayer.displayName).toBe(players[0]!.displayName);
  });

  it('no deja que dos participantes reclamen la misma etiqueta', async () => {
    const response = await post(`/api/v1/admin/clash-royale/links/${players[1]!.id}`, {
      clashTag: TAGS[0]!,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('CLASH_TAG_TAKEN');
  });

  it('rechaza una etiqueta con forma de ataque sin llamar a la API', async () => {
    const before = fake.state.calls.length;
    const response = await post(`/api/v1/admin/clash-royale/links/${players[1]!.id}`, {
      clashTag: '#ABC/../clans',
    });

    expect(response.statusCode).toBe(400);
    expect(fake.state.calls.length).toBe(before);
  });

  it('rechaza una etiqueta que no existe en Clash Royale', async () => {
    fake.state.playerError = new ClashRoyaleError('NOT_FOUND', 'no existe', 404, 'notFound');
    const response = await post(`/api/v1/admin/clash-royale/links/${players[1]!.id}`, {
      clashTag: '#ZZZZZZ',
    });
    fake.state.playerError = null;

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('CLASH_TAG_NOT_FOUND');
  });

  it('exige sesion', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/admin/clash-royale/links/${players[1]!.id}`,
      payload: { clashTag: TAGS[1]! },
    });
    expect(response.statusCode).toBe(401);
  });

  it('vincula al resto de participantes del escenario', async () => {
    for (let index = 1; index < TAGS.length; index += 1) {
      expect((await link(index)).statusCode).toBe(200);
    }

    const links = (await get('/api/v1/admin/clash-royale/links')).json();
    const linked = links.filter((entry: { clashTag: string | null }) => entry.clashTag !== null);
    expect(linked).toHaveLength(TAGS.length);
  });
});

/* ========================================================================== */
/* Catalogo de cartas                                                          */
/* ========================================================================== */

describe('catalogo de cartas', () => {
  it('sincroniza cartas y tropas de torre', async () => {
    const response = await post('/api/v1/admin/clash-royale/cards/sync');

    expect(response.statusCode).toBe(200);
    const report = response.json();
    expect(report.cards).toBe(CARDS.items.length);
    expect(report.supportCards).toBe(1);

    const stored = await harness.db.query.cards.findMany();
    expect(stored).toHaveLength(report.total);
    expect(stored.some((card) => card.isSupport)).toBe(true);
  });

  it('sincronizar dos veces no duplica', async () => {
    const before = (await post('/api/v1/admin/clash-royale/cards/sync')).json().total;
    const after = (await post('/api/v1/admin/clash-royale/cards/sync')).json().total;
    expect(after).toBe(before);
  });

  it('traduce un fallo de la API sin filtrar el token', async () => {
    fake.state.cardsError = new ClashRoyaleError('THROTTLED', 'limitado', 429, 'requestThrottled');
    const response = await post('/api/v1/admin/clash-royale/cards/sync');
    fake.state.cardsError = null;

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('CLASH_ROYALE_THROTTLED');
    expect(response.body).not.toContain('Bearer');
  });
});

/* ========================================================================== */
/* Sincronizacion                                                              */
/* ========================================================================== */

describe('sincronizacion del historial', () => {
  beforeAll(() => {
    const battle = battleBetween(TAGS[0]!, TAGS[1]!, '20261001T190000.000Z', [1, 0]);
    fake.state.battlelogs.set(TAGS[0]!, [battle]);
    fake.state.battlelogs.set(TAGS[1]!, [mirror(battle)]);
  });

  it('importa la batalla y propone candidatos', async () => {
    const response = await sync(0);

    expect(response.statusCode).toBe(200);
    const report = response.json();
    expect(report.fetched).toBe(1);
    expect(report.imported).toBe(1);
    expect(report.candidatesCreated).toBeGreaterThan(0);
  });

  it('la misma batalla desde los dos historiales se guarda UNA vez', async () => {
    const second = await sync(1);

    // El segundo historial trae la misma batalla con los lados al reves.
    expect(second.json().duplicates).toBe(1);
    expect(second.json().imported).toBe(0);
    expect(await harness.db.query.externalBattles.findMany()).toHaveLength(1);
  });

  it('reimportar no multiplica candidatos', async () => {
    const before = (await get('/api/v1/admin/clash-royale/candidates')).json().length;
    await sync(0);
    const after = (await get('/api/v1/admin/clash-royale/candidates')).json().length;

    expect(after).toBe(before);
  });

  it('guarda los mazos de los dos lados', async () => {
    const cards = await harness.db.query.externalBattleCards.findMany();
    const deck = cards.filter((card) => !card.isSupport);

    expect(deck).toHaveLength(16); // ocho por lado
    expect(cards.some((card) => card.isSupport)).toBe(true);
  });

  it('propone la ida y la vuelta, porque la pareja se enfrenta dos veces', async () => {
    // No es un fallo: la misma pareja juega dos partidos en la temporada y el
    // calendario generado no lleva fechas, asi que no hay forma honesta de
    // elegir. Se proponen los dos, marcados como ambiguos, y decide alguien.
    expect(await matchesBetween(players[0]!.id, players[1]!.id)).toHaveLength(2);

    const all = (await get('/api/v1/admin/clash-royale/candidates')).json();
    expect(all).toHaveLength(2);
    for (const candidate of all) {
      expect(candidate.ambiguities).toContain('MULTIPLE_MATCHES_POSSIBLE');
      expect(candidate.ambiguities).toContain('MATCH_HAS_NO_SCHEDULE');
    }
  });

  it('un candidato llega con motivos, marcador y mazos', async () => {
    const candidate = (await get('/api/v1/admin/clash-royale/candidates')).json()[0];

    expect(candidate.reasons).toContain('BOTH_PLAYERS_LINKED');
    expect(candidate.reasons).toContain('FRIENDLY_BATTLE');
    expect(candidate.confidence).toBeGreaterThan(0);
    expect(candidate.battle.home.crowns).toBeTypeOf('number');
    expect(candidate.battle.away.crowns).toBeTypeOf('number');
    expect(candidate.battle.home.deck).toHaveLength(8);
  });

  it('se niega a sincronizar a quien no tiene cuenta vinculada', async () => {
    const rows = await harness.db.query.players.findMany({ columns: { id: true } });
    const linkedIds = new Set(players.map((player) => player.id));
    const unlinked = rows.find((row) => !linkedIds.has(row.id))!;

    const response = await post(`/api/v1/admin/clash-royale/sync/${unlinked.id}`);

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('CLASH_TAG_NOT_LINKED');
  });

  it('deja rastro en la auditoria', async () => {
    const actions = (await get('/api/v1/admin/audit'))
      .json()
      .map((entry: { action: string }) => entry.action);

    expect(actions).toContain('CLASH_BATTLELOG_SYNCED');
    expect(actions).toContain('CLASH_TAG_LINKED');
    expect(actions).toContain('CLASH_CARDS_SYNCED');
  });
});

/* ========================================================================== */
/* Errores de la API externa                                                   */
/* ========================================================================== */

describe('cuando la API externa falla', () => {
  const cases = [
    { kind: 'FORBIDDEN' as const, status: 403, code: 'CLASH_FORBIDDEN' },
    { kind: 'THROTTLED' as const, status: 429, code: 'CLASH_ROYALE_THROTTLED' },
    { kind: 'UPSTREAM' as const, status: 503, code: 'CLASH_UPSTREAM' },
    { kind: 'UNREACHABLE' as const, status: null, code: 'CLASH_UNREACHABLE' },
  ];

  for (const entry of cases) {
    it(`traduce ${entry.kind} a un error que se entiende`, async () => {
      fake.state.battlelogError = new ClashRoyaleError(
        entry.kind,
        'fallo externo',
        entry.status,
        'x',
      );
      const response = await sync(0);
      fake.state.battlelogError = null;

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe(entry.code);
      // Nada del token en la respuesta.
      expect(response.body).not.toContain('Bearer');
    });
  }

  it('un fallo externo no deja nada a medias', async () => {
    const before = (await harness.db.query.externalBattles.findMany()).length;

    fake.state.battlelogError = new ClashRoyaleError('UPSTREAM', 'roto', 500, 'x');
    await sync(0);
    fake.state.battlelogError = null;

    expect(await harness.db.query.externalBattles.findMany()).toHaveLength(before);
  });
});

/* ========================================================================== */
/* Revision administrativa                                                     */
/* ========================================================================== */

describe('revision administrativa', () => {
  let matchId: string;
  let candidateId: string;

  beforeAll(async () => {
    const [first] = await matchesBetween(players[0]!.id, players[1]!.id);
    matchId = first!.id;
    candidateId = (await candidatesFor(matchId))[0].id;
  });

  it('un candidato sin confirmar NO produce resultado', async () => {
    expect(await harness.db.query.matchResults.findMany()).toHaveLength(0);
    expect((await get(`/api/v1/matches/${matchId}`, false)).json().result).toBeNull();
  });

  it('un candidato sin confirmar NO se publica como evidencia', async () => {
    expect((await get(`/api/v1/matches/${matchId}/evidence`, false)).json()).toBeNull();
  });

  it('la cola exige sesion', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/clash-royale/candidates',
    });
    expect(response.statusCode).toBe(401);
  });

  it('confirmar registra el resultado por el motor de siempre', async () => {
    const candidate = (await candidatesFor(matchId))[0];
    const response = await post(`/api/v1/admin/clash-royale/candidates/${candidateId}/confirm`, {
      note: 'Comprobado con la grabacion.',
    });

    expect(response.statusCode).toBe(200);

    const result = (await get(`/api/v1/matches/${matchId}`, false)).json().result;
    expect(result).not.toBeNull();
    // El marcador es el de la batalla, en el orden del partido.
    expect(result.homeCrowns).toBe(candidate.battle.home.crowns);
    expect(result.awayCrowns).toBe(candidate.battle.away.crowns);
    // 1-0: victoria normal, tres puntos segun el reglamento vigente. La
    // puntuacion la calcula el dominio, no esta integracion.
    expect(result.victoryType).toBe('NORMAL');
    expect(result.points.home + result.points.away).toBe(3);
  });

  it('la clasificacion se ha movido', async () => {
    const played = (await get('/api/v1/standings', false))
      .json()
      .rows.reduce((sum: number, row: { played: number }) => sum + row.played, 0);
    expect(played).toBe(2);
  });

  it('tras confirmar, la evidencia si es publica', async () => {
    const body = (await get(`/api/v1/matches/${matchId}/evidence`, false)).json();

    expect(body.candidateStatus).toBe('CONFIRMED');
    expect(body.battleType).toBe('friendly');
    expect(body.home.deck).toHaveLength(8);
    // Los iconos salen del catalogo ya sincronizado.
    expect(body.home.deck.some((card: { iconUrl: string | null }) => card.iconUrl !== null)).toBe(
      true,
    );
  });

  it('confirmar deja auditoria con quien, cuando y con que', async () => {
    const entries = (await get('/api/v1/admin/audit')).json();
    const confirmation = entries.find(
      (entry: { action: string }) => entry.action === 'BATTLE_CANDIDATE_CONFIRMED',
    );

    expect(confirmation).toBeDefined();
    expect(confirmation.actor).not.toBeNull();
    // El resultado deja ademas su propia entrada, la de siempre.
    expect(entries.map((entry: { action: string }) => entry.action)).toContain(
      'MATCH_RESULT_APPROVED',
    );
  });

  it('la otra propuesta de esa batalla queda apartada, no confirmada', async () => {
    // Una batalla no puede ser dos partidos.
    const statuses = (await get('/api/v1/admin/clash-royale/candidates'))
      .json()
      .map((entry: { status: string }) => entry.status);

    expect(statuses.filter((status: string) => status === 'CONFIRMED')).toHaveLength(1);
    expect(statuses).not.toContain('PENDING');
    expect(statuses).toContain('NEEDS_REVIEW');
  });

  it('no se puede confirmar dos veces', async () => {
    const response = await post(`/api/v1/admin/clash-royale/candidates/${candidateId}/confirm`);

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('CANDIDATE_ALREADY_RESOLVED');
  });
});

/* ========================================================================== */
/* Rechazo y apartado                                                          */
/* ========================================================================== */

describe('rechazo y apartado', () => {
  let matchId: string;

  beforeAll(async () => {
    // Escenario nuevo con otra pareja, para no arrastrar el anterior.
    fake.state.battlelogs.set(TAGS[2]!, [
      battleBetween(TAGS[2]!, TAGS[3]!, '20261002T190000.000Z', [3, 1]),
    ]);
    await sync(2);

    const [first] = await matchesBetween(players[2]!.id, players[3]!.id);
    matchId = first!.id;
  });

  it('rechazar no registra ningun resultado', async () => {
    const before = (await harness.db.query.matchResults.findMany()).length;
    const candidate = (await candidatesFor(matchId))[0];

    const response = await post(`/api/v1/admin/clash-royale/candidates/${candidate.id}/reject`, {
      note: 'Era una partida de picar, no el partido.',
    });

    expect(response.statusCode).toBe(204);
    expect(await harness.db.query.matchResults.findMany()).toHaveLength(before);
    expect((await get(`/api/v1/matches/${matchId}`, false)).json().result).toBeNull();
  });

  it('un candidato rechazado no se puede confirmar despues', async () => {
    const rejected = (await get('/api/v1/admin/clash-royale/candidates?status=REJECTED')).json();
    const response = await post(`/api/v1/admin/clash-royale/candidates/${rejected[0].id}/confirm`);

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('CANDIDATE_ALREADY_RESOLVED');
  });

  it('apartar para revision tampoco registra nada', async () => {
    const before = (await harness.db.query.matchResults.findMany()).length;
    const others = await matchesBetween(players[2]!.id, players[3]!.id).then((rows) =>
      rows.filter((row) => row.id !== matchId),
    );
    const candidate = (await candidatesFor(others[0]!.id))[0];

    const response = await post(`/api/v1/admin/clash-royale/candidates/${candidate.id}/review`, {
      note: 'Preguntar a los jugadores.',
    });

    expect(response.statusCode).toBe(204);
    expect(await harness.db.query.matchResults.findMany()).toHaveLength(before);
  });

  it('la cola se filtra por estado', async () => {
    const rejected = (await get('/api/v1/admin/clash-royale/candidates?status=REJECTED')).json();
    const confirmed = (await get('/api/v1/admin/clash-royale/candidates?status=CONFIRMED')).json();

    expect(rejected.length).toBeGreaterThan(0);
    expect(confirmed).toHaveLength(1);
    for (const entry of rejected) expect(entry.status).toBe('REJECTED');
  });
});

/* ========================================================================== */
/* Ambiguedades                                                                */
/* ========================================================================== */

describe('ambiguedades', () => {
  it('una batalla que no es amistosa se propone con menos confianza', async () => {
    fake.state.battlelogs.set(TAGS[4]!, [
      battleBetween(TAGS[4]!, TAGS[5]!, '20261003T190000.000Z', [2, 1], 'PvP'),
    ]);
    await sync(4);

    const [first] = await matchesBetween(players[4]!.id, players[5]!.id);
    const candidate = (await candidatesFor(first!.id))[0];

    expect(candidate.ambiguities).toContain('NOT_A_FRIENDLY_BATTLE');
    expect(candidate.confidence).toBeLessThan(60);
  });

  it('un empate de coronas se aparta: el reglamento no lo admite', async () => {
    fake.state.battlelogs.set(TAGS[4]!, [
      battleBetween(TAGS[4]!, TAGS[5]!, '20261004T190000.000Z', [1, 1]),
    ]);
    await sync(4);

    const [first] = await matchesBetween(players[4]!.id, players[5]!.id);
    const withDraw = (await candidatesFor(first!.id)).find((entry: { ambiguities: string[] }) =>
      entry.ambiguities.includes('EQUAL_CROWNS'),
    );

    expect(withDraw).toBeDefined();
    expect(withDraw.status).toBe('NEEDS_REVIEW');
  });

  it('confirmar un empate lo rechaza el motor, no la integracion', async () => {
    const [first] = await matchesBetween(players[4]!.id, players[5]!.id);
    const withDraw = (await candidatesFor(first!.id)).find((entry: { ambiguities: string[] }) =>
      entry.ambiguities.includes('EQUAL_CROWNS'),
    );

    const response = await post(`/api/v1/admin/clash-royale/candidates/${withDraw.id}/confirm`);

    // R-01: el reglamento no admite empates. Lo dice el dominio de siempre.
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('DRAW_NOT_ALLOWED');
  });

  it('resuelve el lado que se vinculó DESPUÉS de importar la batalla', async () => {
    // El bug que este test fija: `player_id` se guarda al importar, asi que
    // sincronizar a uno antes de vincular al otro dejaba ese lado huerfano y su
    // marcador salia como «—». Manda la vinculacion vigente, no la foto.
    const rows = await harness.db.query.players.findMany({
      columns: { id: true, displayName: true },
    });
    const linkedIds = new Set(players.map((player) => player.id));
    const [late, other] = rows.filter((row) => !linkedIds.has(row.id));
    if (late === undefined || other === undefined) return;

    const lateTag = '#LATE0001';
    const otherTag = '#LATE0002';

    // Se vincula solo a uno y se sincroniza: el rival aun no tiene etiqueta.
    await post(`/api/v1/admin/clash-royale/links/${other.id}`, { clashTag: otherTag });
    fake.state.battlelogs.set(otherTag, [
      battleBetween(otherTag, lateTag, '20261006T190000.000Z', [3, 0]),
    ]);
    await post(`/api/v1/admin/clash-royale/sync/${other.id}`);

    // Ahora se vincula al rezagado.
    const linked = await post(`/api/v1/admin/clash-royale/links/${late.id}`, {
      clashTag: lateTag,
    });
    expect(linked.statusCode).toBe(200);

    const [match] = await matchesBetween(other.id, late.id);
    const candidate = (await candidatesFor(match!.id))[0];

    // Los dos lados resuelven, y las coronas se ven.
    expect(candidate.battle.home).not.toBeNull();
    expect(candidate.battle.away).not.toBeNull();
    expect(candidate.battle.home.crowns).toBeTypeOf('number');
    expect(candidate.battle.away.crowns).toBeTypeOf('number');
  });

  it('una batalla entre gente sin vincular no propone nada', async () => {
    fake.state.battlelogs.set(TAGS[5]!, [
      battleBetween('#NOLINK01', '#NOLINK02', '20261005T190000.000Z'),
    ]);

    const response = await sync(5);

    expect(response.json().imported).toBe(1);
    expect(response.json().candidatesCreated).toBe(0);
  });
});

/* ========================================================================== */
/* Sincronizacion automatica                                                   */
/* ========================================================================== */

/**
 * El planificador.
 *
 * Lo que se prueba no es que sincronice —eso ya esta cubierto— sino sus tres
 * limites: que este apagado por defecto, que no se pase de peticiones, y que
 * se corte solo cuando la API falla. Un planificador sin freno contra una API
 * que no publica sus limites es la forma mas rapida de perder el acceso.
 *
 * Y sobre todo: que **no confirme nada**. La ruta hacia un resultado oficial
 * pasa por un administrador, tambien cuando quien trae los datos es un
 * temporizador.
 */
describe('planificador de sincronizacion', () => {
  const scheduler = () => harness.app.clashSyncScheduler;

  it('esta apagado salvo que se pida explicitamente', () => {
    const status = scheduler().status();

    expect(status.enabled).toBe(false);
    expect(status.running).toBe(false);
    // La razon esta documentada: la retencion real del historial no se midio.
    expect(status.breaker).toBe('CLOSED');
  });

  it('lo publica en /health sin filtrar nada del token', async () => {
    const body = (await harness.app.inject({ method: 'GET', url: '/health' })).json();

    expect(body.sync.enabled).toBe(false);
    expect(body.clashRoyale).toBe('disabled');
    expect(JSON.stringify(body)).not.toContain('token');
    expect(JSON.stringify(body)).not.toContain('Bearer');
  });

  it('/readiness responde que el servicio sirve', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/readiness' });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ready');
    expect(response.json().database).toBe('ok');
  });

  it('la integracion externa no decide si el servicio esta listo', async () => {
    // La liga funciona entera sin Clash Royale: solo aporta evidencia.
    const body = (await harness.app.inject({ method: 'GET', url: '/readiness' })).json();
    expect(body.clashRoyale).toBe('disabled');
    expect(body.status).toBe('ready');
  });

  it('una vuelta no consulta mas participantes de los configurados', async () => {
    fake.state.calls.length = 0;
    const report = await scheduler().runOnce();

    const configured = scheduler().status().maxPlayersPerRun;
    expect(report.players).toBeLessThanOrEqual(configured);
    expect(report.skipped).toBe(false);

    const consultas = fake.state.calls.filter((call) => call.startsWith('getBattleLog'));
    expect(consultas.length).toBeLessThanOrEqual(configured);
  });

  it('empieza por quien lleva mas tiempo sin consultarse', async () => {
    const stamp = (value: Date | null): number => (value === null ? -Infinity : value.getTime());
    const snapshot = async () =>
      new Map(
        (
          await harness.db.query.players.findMany({
            columns: { id: true, clashSyncedAt: true, clashTag: true },
          })
        )
          .filter((row) => row.clashTag !== null)
          .map((row) => [row.id, stamp(row.clashSyncedAt)] as const),
      );

    const before = await snapshot();
    await scheduler().runOnce();
    const after = await snapshot();

    const tocados = [...before.keys()].filter((id) => before.get(id) !== after.get(id));
    const intactos = [...before.keys()].filter((id) => before.get(id) === after.get(id));

    // La propiedad de verdad: nadie se queda atras mientras se consulta a
    // alguien mas reciente. Quien no se ha consultado nunca va el primero.
    for (const tocado of tocados) {
      for (const intacto of intactos) {
        expect(before.get(tocado)!).toBeLessThanOrEqual(before.get(intacto)!);
      }
    }
  });

  it('la auditoria dice que lo hizo el sistema, no una persona', async () => {
    await scheduler().runOnce();

    const entries = (await get('/api/v1/admin/audit')).json();
    const automatica = entries.find(
      (row: { action: string; actor: string | null }) =>
        row.action === 'CLASH_BATTLELOG_SYNCED' && row.actor === null,
    );

    // No se inventa un responsable: sin persona detras, el actor es nulo.
    expect(automatica).toBeDefined();
  });

  it('una vuelta automatica NO produce ningun resultado oficial', async () => {
    const before = await harness.db.query.matchResults.findMany();
    await scheduler().runOnce();
    const after = await harness.db.query.matchResults.findMany();

    // Trae candidatos a la cola; confirmarlos sigue siendo cosa de un humano.
    expect(after).toHaveLength(before.length);
  });

  it('se corta sola cuando la API falla repetidas veces', async () => {
    fake.state.battlelogError = new ClashRoyaleError(
      'FORBIDDEN',
      'acceso denegado',
      403,
      'accessDenied.invalidIp',
    );

    // Suficientes vueltas para superar el umbral configurado.
    const umbral = 5;
    for (let vuelta = 0; vuelta < umbral; vuelta += 1) await scheduler().runOnce();

    const status = scheduler().status();
    expect(status.breaker).toBe('OPEN');
    expect(status.openUntil).not.toBeNull();
    // El motivo se guarda como codigo, sin mensajes ni nada del token.
    expect(status.lastRun?.failureCodes.join(' ') ?? '').not.toContain('Bearer');
  });

  it('con el cortacircuitos abierto no vuelve a pedir nada', async () => {
    fake.state.calls.length = 0;
    const report = await scheduler().runOnce();

    expect(report.skipped).toBe(true);
    expect(fake.state.calls).toHaveLength(0);

    fake.state.battlelogError = null;
  });

  it('el estado se consulta desde el panel, con sesion', async () => {
    const response = await get('/api/v1/admin/clash-royale/sync');
    expect(response.statusCode).toBe(200);
    expect(response.json().breaker).toBe('OPEN');

    const sinSesion = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/clash-royale/sync',
    });
    expect(sinSesion.statusCode).toBe(401);
  });

  it('la vuelta a mano tambien exige sesion', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/admin/clash-royale/sync-run',
    });
    expect(response.statusCode).toBe(401);
  });
});
