/**
 * Estadisticas por HTTP.
 *
 * Lo que se prueba aqui es la frontera entre lo **oficial** y lo **observado**,
 * y que un partido que no cuenta no se cuele en ninguna cifra: un aplazado no
 * es una derrota, y un disputado no es definitivo.
 */

import { schema } from '@liga/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './helpers.ts';

let harness: TestApp;
let players: { id: string; displayName: string; slug: string }[];

const auth = () => ({ cookie: harness.cookie });
const post = (url: string, payload?: object) =>
  harness.app.inject({ method: 'POST', url, headers: auth(), ...(payload ? { payload } : {}) });
const get = (url: string) => harness.app.inject({ method: 'GET', url });

/**
 * Los partidos del calendario entre dos participantes, en orden estable.
 *
 * `findMany` no garantiza ningun orden, y sin ordenar aqui el test elegiria un
 * partido distinto en cada ejecucion.
 */
async function matchesBetween(first: string, second: string) {
  const rows = await harness.db.query.matches.findMany();
  return rows
    .filter(
      (row) =>
        (row.homePlayerId === first && row.awayPlayerId === second) ||
        (row.homePlayerId === second && row.awayPlayerId === first),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

beforeAll(async () => {
  harness = await createTestApp({ withTestPlayers: true });
  players = await harness.db.query.players.findMany({
    columns: { id: true, displayName: true, slug: true },
  });

  await post('/api/v1/admin/tournament/status', { status: 'READY' });
  await post('/api/v1/admin/fixture/generate', { seed: 'statistics-test' });
  await post('/api/v1/admin/tournament/status', { status: 'LIVE' });
}, 120_000);

afterAll(async () => {
  await harness.close();
});

describe('/api/v1/statistics', () => {
  it('es publica y se declara oficial', async () => {
    const response = await get('/api/v1/statistics');

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.source).toBe('OFFICIAL');
    for (const row of body.players) expect(row.source).toBe('OFFICIAL');
  });

  it('sin partidos jugados, los porcentajes son null y no cero', () => {
    // Cero diria «lo intento y fallo siempre». La verdad es que no jugo.
    return get('/api/v1/statistics').then((response) => {
      const row = response.json().players[0];
      expect(row.played).toBe(0);
      expect(row.winRate).toBeNull();
      expect(row.averageCrownsFor).toBeNull();
    });
  });

  it('la actividad separa lo jugado de lo que no cuenta', async () => {
    const activity = (await get('/api/v1/statistics')).json().activity;

    expect(activity.total).toBe(90);
    expect(activity.completed).toBe(0);
    expect(activity.scheduled).toBe(90);
    // Categorias propias, no sumadas a «completados».
    expect(activity).toHaveProperty('postponed');
    expect(activity).toHaveProperty('disputed');
  });

  it('sin datos no hay lideres inventados', async () => {
    const boards = (await get('/api/v1/statistics')).json().leaderboards;

    const winRate = boards.find((board: { metric: string }) => board.metric === 'winRate');
    expect(winRate.value).toBeNull();
    expect(winRate.leaders).toEqual([]);
  });
});

describe('cuando ya se jugaron partidos', () => {
  let matchId: string;

  beforeAll(async () => {
    const [first] = await matchesBetween(players[0]!.id, players[1]!.id);
    matchId = first!.id;
    // 3-1: victoria con el maximo de coronas.
    await post(`/api/v1/admin/matches/${matchId}/result`, { homeCrowns: 3, awayCrowns: 1 });
  });

  it('cuenta el partido y reparte los puntos del reglamento', async () => {
    const home = (await harness.db.query.matches.findFirst())!;
    void home;

    const players_ = (await get('/api/v1/statistics')).json().players;
    const played = players_.filter((row: { played: number }) => row.played > 0);

    expect(played).toHaveLength(2);
    const winner = played.find((row: { wins: number }) => row.wins === 1);
    expect(winner.points).toBe(4); // R-02
    expect(winner.maxCrownWins).toBe(1);
    expect(winner.winRate).toBe(1);
  });

  it('la media de coronas sale de los partidos que cuentan', async () => {
    const players_ = (await get('/api/v1/statistics')).json().players;
    const winner = players_.find((row: { wins: number }) => row.wins === 1);

    expect(winner.averageCrownsFor).toBe(3);
    expect(winner.averageCrownsAgainst).toBe(1);
  });

  it('separa el rendimiento local del visitante', async () => {
    const players_ = (await get('/api/v1/statistics')).json().players;
    const winner = players_.find((row: { wins: number }) => row.wins === 1);

    expect(winner.home.played + winner.away.played).toBe(winner.played);
  });

  it('los lideres incluyen a todos los empatados', async () => {
    const boards = (await get('/api/v1/statistics')).json().leaderboards;
    const points = boards.find((board: { metric: string }) => board.metric === 'points');

    expect(points.value).toBe(4);
    expect(points.leaders.length).toBeGreaterThanOrEqual(1);
    for (const leader of points.leaders) expect(leader.slug).toBeTypeOf('string');
  });

  it('la metrica defensiva se marca como «menos es mejor»', async () => {
    const boards = (await get('/api/v1/statistics')).json().leaderboards;
    const defensive = boards.find(
      (board: { metric: string }) => board.metric === 'averageCrownsAgainst',
    );
    expect(defensive.lowerIsBetter).toBe(true);
  });
});

describe('/api/v1/players/:id/statistics', () => {
  it('acepta el slug y devuelve estadisticas e historial', async () => {
    const response = await get(`/api/v1/players/${players[0]!.slug}/statistics`);

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.statistics.source).toBe('OFFICIAL');
    expect(body.statistics.slug).toBe(players[0]!.slug);
    // 18 partidos: todo su calendario, jugados o no.
    expect(body.history).toHaveLength(18);
  });

  it('el historial trae el rival, la condicion y la jornada', async () => {
    const history = (await get(`/api/v1/players/${players[0]!.slug}/statistics`)).json().history;

    for (const row of history) {
      expect(row.opponentName).toBeTypeOf('string');
      expect(row.isHome).toBeTypeOf('boolean');
      expect(row.roundNumber).toBeGreaterThan(0);
    }
  });

  it('un partido sin jugar llega sin marcador, no como 0-0', async () => {
    const history = (await get(`/api/v1/players/${players[0]!.slug}/statistics`)).json().history;
    const pending = history.find((row: { status: string }) => row.status === 'SCHEDULED');

    expect(pending.crownsFor).toBeNull();
    expect(pending.crownsAgainst).toBeNull();
    expect(pending.points).toBeNull();
    expect(pending.outcome).toBeNull();
  });

  it('un partido jugado si trae su resultado', async () => {
    const history = (await get(`/api/v1/players/${players[0]!.slug}/statistics`)).json().history;
    const played = history.find((row: { status: string }) => row.status === 'COMPLETED');

    expect(played.crownsFor).toBeTypeOf('number');
    expect(played.outcome).toMatch(/^[WLD]$/);
  });

  it('un identificador inventado da 404', async () => {
    expect((await get('/api/v1/players/no-existe/statistics')).statusCode).toBe(404);
  });

  it('rechaza un identificador con forma de ataque', async () => {
    const response = await get('/api/v1/players/..%2F..%2Fadmin/statistics');
    expect([400, 404]).toContain(response.statusCode);
  });
});

describe('un partido aplazado no ensucia las estadisticas', () => {
  beforeAll(async () => {
    const pending = (await matchesBetween(players[0]!.id, players[1]!.id)).find(
      (row) => row.status === 'SCHEDULED',
    );
    const response = await post(`/api/v1/admin/matches/${pending!.id}/postpone`, {
      reason: 'CONNECTION',
      notes: 'Prueba de que un aplazado no cuenta.',
    });
    // Si el aplazamiento falla, los tests de abajo mentirian sobre el motivo.
    if (response.statusCode !== 200) {
      throw new Error(`No se pudo aplazar: ${response.statusCode} ${response.body}`);
    }
  });

  it('no aumenta los partidos jugados', async () => {
    const players_ = (await get('/api/v1/statistics')).json().players;
    const affected = players_.find((row: { playerId: string }) => row.playerId === players[0]!.id);
    // Sigue con el unico partido que si se jugo.
    expect(affected.played).toBe(1);
  });

  it('no lo cuenta como derrota de nadie', async () => {
    const players_ = (await get('/api/v1/statistics')).json().players;
    const total = players_.reduce((sum: number, row: { losses: number }) => sum + row.losses, 0);
    expect(total).toBe(1); // solo la del 3-1
  });

  it('aparece en la actividad, en su propia casilla', async () => {
    const activity = (await get('/api/v1/statistics')).json().activity;
    expect(activity.postponed).toBe(1);
    expect(activity.completed).toBe(1);
    expect(activity.postponementEvents).toBeGreaterThan(0);
  });

  it('en el historial llega como aplazado y sin marcador', async () => {
    const history = (await get(`/api/v1/players/${players[0]!.slug}/statistics`)).json().history;
    const postponed = history.find((row: { status: string }) => row.status === 'POSTPONED');

    expect(postponed).toBeDefined();
    expect(postponed.outcome).toBeNull();
    expect(postponed.points).toBeNull();
  });
});

describe('estadisticas observadas', () => {
  it('se declaran observadas y traen el tamaño de la muestra', async () => {
    const response = await get('/api/v1/cards');

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.source).toBe('OBSERVED');
    expect(body.provider).toBe('CLASH_ROYALE');
    expect(body.sampleSize).toBeTypeOf('number');
  });

  it('sin batallas importadas, la muestra es cero y la lista vacia', async () => {
    const body = (await get('/api/v1/cards')).json();
    expect(body.sampleSize).toBe(0);
    expect(body.value.cards).toEqual([]);
    expect(body.value.battles).toBe(0);
  });

  it('los mazos de un participante tambien se declaran observados', async () => {
    const body = (await get(`/api/v1/players/${players[0]!.slug}/decks`)).json();

    expect(body.source).toBe('OBSERVED');
    expect(body.sampleSize).toBe(0);
    expect(body.value.decks).toEqual([]);
  });

  it('lo observado no se mezcla con lo oficial en ninguna respuesta', async () => {
    const oficial = (await get('/api/v1/statistics')).json();
    const observado = (await get('/api/v1/cards')).json();

    expect(oficial.source).toBe('OFFICIAL');
    expect(observado.source).toBe('OBSERVED');
    // La respuesta oficial no lleva nada de Clash Royale.
    expect(JSON.stringify(oficial)).not.toContain('OBSERVED');
    expect(JSON.stringify(oficial).toLowerCase()).not.toContain('clash');
  });
});

/* ========================================================================== */
/* Mazos observados                                                            */
/* ========================================================================== */

/**
 * Lo que aqui se prueba no es que se dibujen ocho cartas, sino **de quien se
 * publica el tag**.
 *
 * El tag de un participante es publico porque el mismo lo declaro al
 * inscribirse. El de cualquier otra persona que aparezca en una batalla
 * observada, no: nadie le pidio permiso. Un `select *` descuidado en el
 * servicio lo publicaria entero, y ningun test lo notaria si solo mirara las
 * cartas.
 */
describe('mazos observados de un participante', () => {
  const STRANGER = '#QQ9WXY7Z2';
  const OWN_TAG = '#PP1AA2BB3';
  const RIVAL_TAG = '#RR4CC5DD6';

  /** Un mazo cualquiera. Los ids no importan; el catalogo si. */
  const DECK = [
    { cardId: 26_000_000, name: 'Caballero', elixirCost: 3 },
    { cardId: 26_000_001, name: 'Arqueras', elixirCost: 3 },
    { cardId: 26_000_002, name: 'Gigante', elixirCost: 5 },
    { cardId: 26_000_003, name: 'Duende', elixirCost: 2 },
    { cardId: 26_000_004, name: 'Esbirros', elixirCost: 3 },
    { cardId: 26_000_005, name: 'Mosquetera', elixirCost: 4 },
    { cardId: 26_000_006, name: 'Mago', elixirCost: 5 },
    { cardId: 26_000_007, name: 'Bola de fuego', elixirCost: 4 },
  ];

  /**
   * Mismo mazo con otros identificadores. Sirve para probar el caso en que el
   * catalogo no conoce todas las cartas: si las dos batallas compartieran ids,
   * sembrar la segunda completaria el catalogo de la primera.
   */
  const UNKNOWN_DECK = DECK.map((card, index) => ({
    ...card,
    cardId: 27_000_000 + index,
    name: card.name + ' (variante)',
  }));

  async function seedBattle(options: {
    tag: string;
    rivalTag: string;
    playerId: string;
    matchId: string;
    fingerprint: string;
    battleTime: string;
    deck: typeof DECK;
    /** Cuantas cartas conoce el catalogo. Con menos de ocho no hay media. */
    catalogued: number;
  }) {
    const [battle] = await harness.db
      .insert(schema.externalBattles)
      .values({
        tournamentId: harness.tournamentId,
        fingerprint: options.fingerprint,
        battleTime: new Date(options.battleTime),
        battleType: 'friendly',
      })
      .returning({ id: schema.externalBattles.id });

    const battleId = battle!.id;

    await harness.db.insert(schema.externalBattleSides).values([
      {
        battleId,
        side: 1,
        clashTag: options.tag,
        clashName: 'nombre en clash',
        crowns: 3,
        playerId: options.playerId,
      },
      { battleId, side: 2, clashTag: options.rivalTag, clashName: 'rival', crowns: 1 },
    ]);

    await harness.db.insert(schema.externalBattleCards).values(
      options.deck.map((card, index) => ({
        battleId,
        side: 1,
        slot: index + 1,
        isSupport: false,
        cardId: card.cardId,
        cardName: card.name,
        level: 14,
        evolutionLevel: index === 0 ? 1 : 0,
      })),
    );

    await harness.db.insert(schema.battleCandidates).values({
      tournamentId: harness.tournamentId,
      externalBattleId: battleId,
      matchId: options.matchId,
      status: 'CONFIRMED',
      confidence: 100,
    });

    // El catalogo se siembra parcialmente a proposito en un caso: sin el coste
    // de las ocho cartas no puede haber media.
    for (const card of options.deck.slice(0, options.catalogued)) {
      await harness.db
        .insert(schema.cards)
        .values({
          id: card.cardId,
          name: card.name,
          elixirCost: card.elixirCost,
          iconUrl: `https://api-assets.clashroyale.com/cards/300/${card.cardId}.png`,
        })
        .onConflictDoNothing();
    }

    return battleId;
  }

  let ownerSlug: string;
  let resultsBefore: number;

  beforeAll(async () => {
    resultsBefore = (await harness.db.query.matchResults.findMany()).length;
    const owner = players[0]!;
    const rival = players[1]!;
    ownerSlug = owner.slug;

    await harness.db
      .update(schema.players)
      .set({ clashTag: OWN_TAG })
      .where(eq(schema.players.id, owner.id));
    await harness.db
      .update(schema.players)
      .set({ clashTag: RIVAL_TAG })
      .where(eq(schema.players.id, rival.id));

    const between = await matchesBetween(owner.id, rival.id);

    // Batalla contra alguien que no juega la liga, con el catalogo incompleto.
    await seedBattle({
      tag: OWN_TAG,
      rivalTag: STRANGER,
      playerId: owner.id,
      matchId: between[0]!.id,
      fingerprint: 'test-fingerprint-desconocido',
      battleTime: '2026-10-02T20:00:00.000Z',
      deck: UNKNOWN_DECK,
      catalogued: 5,
    });

    // Batalla contra un participante, con el catalogo completo.
    await seedBattle({
      tag: OWN_TAG,
      rivalTag: RIVAL_TAG,
      playerId: owner.id,
      matchId: between[1]!.id,
      fingerprint: 'test-fingerprint-participante',
      battleTime: '2026-10-03T20:00:00.000Z',
      deck: DECK,
      catalogued: 8,
    });
  }, 60_000);

  it('el tag de quien no juega la liga NO se publica entero', async () => {
    const response = await get(`/api/v1/players/${ownerSlug}/decks`);
    const body = response.json();

    const deck = body.value.decks.find(
      (entry: { battleTime: string }) => entry.battleTime === '2026-10-02T20:00:00.000Z',
    );

    expect(deck.opponent.isParticipant).toBe(false);
    expect(deck.opponent.displayName).toBeNull();
    expect(deck.opponent.tag).not.toBe(STRANGER);
    // Ni ahi ni en ningun otro rincon de la respuesta.
    expect(response.body).not.toContain(STRANGER);
    // Queda lo justo para reconocer repeticiones.
    expect(deck.opponent.tag.endsWith('7Z2')).toBe(true);
  });

  it('a un participante se le nombra, porque su tag ya es publico', async () => {
    const body = (await get(`/api/v1/players/${ownerSlug}/decks`)).json();

    const deck = body.value.decks.find(
      (entry: { battleTime: string }) => entry.battleTime === '2026-10-03T20:00:00.000Z',
    );

    expect(deck.opponent.isParticipant).toBe(true);
    expect(deck.opponent.displayName).toBe(players[1]!.displayName);
    expect(deck.opponent.slug).toBe(players[1]!.slug);
    expect(deck.opponent.tag).toBe(RIVAL_TAG);
  });

  it('sin el coste de las ocho cartas no hay media de elixir', async () => {
    const body = (await get(`/api/v1/players/${ownerSlug}/decks`)).json();

    const incompleto = body.value.decks.find(
      (entry: { battleTime: string }) => entry.battleTime === '2026-10-02T20:00:00.000Z',
    );
    const completo = body.value.decks.find(
      (entry: { battleTime: string }) => entry.battleTime === '2026-10-03T20:00:00.000Z',
    );

    // Una media con huecos no es una media: se dice que no se sabe.
    expect(incompleto.averageElixir).toBeNull();
    expect(completo.averageElixir).toBe(3.6);
  });

  it('la muestra viaja con los datos y los mazos llegan completos', async () => {
    const body = (await get(`/api/v1/players/${ownerSlug}/decks`)).json();

    expect(body.source).toBe('OBSERVED');
    expect(body.sampleSize).toBe(2);
    for (const deck of body.value.decks) expect(deck.cards).toHaveLength(8);
  });

  it('un mazo observado no crea ningun resultado oficial', async () => {
    // Confirmar la correspondencia batalla-partido es cosa del panel y pasa por
    // el motor de resultados. Sembrar candidatos en la base —aunque digan
    // CONFIRMED— no puede mover la clasificacion por si solo.
    expect(await harness.db.query.matchResults.findMany()).toHaveLength(resultsBefore);
  });
});
