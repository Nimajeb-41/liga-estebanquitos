/**
 * Cliente, normalizacion y deteccion de candidatos.
 *
 * Sin red: el `fetch` se sustituye y las batallas salen de fixtures obtenidas
 * en el spike real del 10 de septiembre de 2026, seudonimizadas. `npm test`
 * nunca depende de que Supercell este disponible.
 *
 * Lo que se prueba es lo que puede hacer daño: que una batalla sin coronas no
 * proponga marcador, que el orden local-visitante no se invierta segun de quien
 * sea el historial, que la misma batalla vista desde los dos lados sea **una**,
 * y que la confianza no autorice nada por si sola.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  assertValidTag,
  ClashRoyaleClient,
  isValidTag,
  normalizeTag,
} from '../src/integrations/clash-royale/client.ts';
import {
  detectCandidates,
  type MatchForMatching,
} from '../src/integrations/clash-royale/matching.ts';
import {
  battleFingerprint,
  battlesAgree,
  normalizeBattle,
  normalizeBattlelog,
  parseBattleTime,
} from '../src/integrations/clash-royale/normalizer.ts';
import { ClashRoyaleError, type ClashBattle } from '../src/integrations/clash-royale/types.ts';

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'clash-royale',
);
const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8')) as T;

const friendly = () => fixture<ClashBattle>('friendly-battle.json');
const mirrored = () => fixture<ClashBattle>('friendly-battle-mirrored.json');
const ladder = () => fixture<ClashBattle>('ladder-battle.json');

function stubFetch(responses: readonly Response[]): typeof globalThis.fetch {
  let call = 0;
  return vi.fn(async () => {
    const response = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return response as Response;
  }) as unknown as typeof globalThis.fetch;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const client = (options: Record<string, unknown> = {}) =>
  new ClashRoyaleClient({
    baseUrl: 'https://api.clashroyale.com/v1',
    token: 'secreto',
    ...options,
  } as never);

/* ========================================================================== */
/* Cliente                                                                     */
/* ========================================================================== */

describe('normalizeTag', () => {
  it('acepta la etiqueta como la escriba la gente', () => {
    expect(normalizeTag('abc123')).toBe('#ABC123');
    expect(normalizeTag('#abc123')).toBe('#ABC123');
    expect(normalizeTag('  #AbC123  ')).toBe('#ABC123');
  });
});

describe('validacion de etiquetas', () => {
  it('acepta una etiqueta con la forma correcta', () => {
    expect(isValidTag('#2PP')).toBe(true);
    expect(isValidTag('ccc8uqu8y')).toBe(true);
  });

  it('rechaza lo que no tiene forma de etiqueta', () => {
    for (const bad of ['', '#', '#AB', `#${'A'.repeat(16)}`, '#ABC-123', '#ABC 123']) {
      expect(isValidTag(bad)).toBe(false);
    }
  });

  it('rechaza intentos de salirse de la ruta', () => {
    for (const attack of [
      '#../../clans',
      '#ABC/battlelog',
      '#ABC?limit=999',
      'https://otro-host.example/x',
    ]) {
      expect(isValidTag(attack)).toBe(false);
    }
  });

  it('el cliente no llega a llamar a la API con una etiqueta invalida', async () => {
    const fetchStub = stubFetch([json(200, {})]);
    await expect(client({ fetch: fetchStub }).getPlayer('#ABC/../clans')).rejects.toBeInstanceOf(
      ClashRoyaleError,
    );
    expect(vi.mocked(fetchStub)).not.toHaveBeenCalled();
  });

  it('assertValidTag normaliza o falla con motivo', () => {
    expect(assertValidTag('ccc8uqu8y')).toBe('#CCC8UQU8Y');
    try {
      assertValidTag('#ABC/x');
      expect.unreachable('deberia haber fallado');
    } catch (error) {
      expect(error).toMatchObject({ kind: 'BAD_REQUEST', reason: 'invalidTag' });
    }
  });
});

describe('ClashRoyaleClient', () => {
  it('manda el token en la cabecera y codifica el # de la etiqueta', async () => {
    const fetchStub = stubFetch([json(200, { tag: '#CCC8UQU8Y', name: 'Nimaben' })]);
    const player = await client({ fetch: fetchStub }).getPlayer('ccc8uqu8y');

    expect(player.name).toBe('Nimaben');
    const [url, init] = vi.mocked(fetchStub).mock.calls[0] ?? [];
    expect(url).toBe('https://api.clashroyale.com/v1/players/%23CCC8UQU8Y');
    expect((init?.headers as Record<string, string>)['authorization']).toBe('Bearer secreto');
  });

  it('explica el 403 por lo que casi siempre es: la IP no declarada', async () => {
    const c = client({ fetch: stubFetch([json(403, { reason: 'accessDenied.invalidIp' })]) });
    await expect(c.getPlayer('#CCC8UQU8Y')).rejects.toMatchObject({
      kind: 'FORBIDDEN',
      status: 403,
      reason: 'accessDenied.invalidIp',
    });
  });

  it('reintenta el 429 respetando retry-after, sin inventarse un umbral', async () => {
    const waits: number[] = [];
    const c = client({
      fetch: stubFetch([
        json(429, { reason: 'requestThrottled' }, { 'retry-after': '2' }),
        json(200, []),
      ]),
      sleep: async (ms: number) => {
        waits.push(ms);
      },
    });

    await expect(c.getBattleLog('#CCC8UQU8Y')).resolves.toEqual([]);
    expect(waits).toEqual([2000]);
  });

  it('reintenta un 5xx y acaba rindiendose', async () => {
    const c = client({
      maxRetries: 2,
      fetch: stubFetch([json(503, { reason: 'serviceUnavailable' })]),
      sleep: async () => {},
    });
    await expect(c.getBattleLog('#CCC8UQU8Y')).rejects.toMatchObject({
      kind: 'UPSTREAM',
      status: 503,
    });
  });

  it('trata el tiempo agotado como fallo de red, no como respuesta', async () => {
    const c = client({
      maxRetries: 0,
      timeoutMs: 5,
      fetch: ((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('AbortError')));
        })) as unknown as typeof globalThis.fetch,
    });
    await expect(c.getPlayer('#CCC8UQU8Y')).rejects.toMatchObject({ kind: 'UNREACHABLE' });
  });

  it('convierte un fallo de red en un error propio', async () => {
    const c = client({
      maxRetries: 0,
      fetch: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof globalThis.fetch,
    });
    await expect(c.getPlayer('#CCC8UQU8Y')).rejects.toMatchObject({ kind: 'UNREACHABLE' });
  });
});

describe('catalogo de cartas', () => {
  it('lee la forma verificada: items y supportItems', async () => {
    const catalogue = fixture<{ items: unknown[] }>('cards.json');
    const c = client({
      fetch: stubFetch([json(200, { ...catalogue, supportItems: [{ id: 1 }] })]),
    });

    const result = await c.getCards();

    expect(result.cards).toHaveLength(catalogue.items.length);
    expect(result.supportCards).toHaveLength(1);
  });

  it('aguanta un array pelado por si la forma cambiara', async () => {
    const c = client({ fetch: stubFetch([json(200, [{ id: 1, name: 'Knight' }])]) });
    await expect(c.getCards()).resolves.toMatchObject({ cards: [{ name: 'Knight' }] });
  });

  it('no se rompe si la lista viene vacia', async () => {
    const c = client({ fetch: stubFetch([json(200, {})]) });
    await expect(c.getCards()).resolves.toEqual({ cards: [], supportCards: [] });
  });
});

describe('el token no se filtra', () => {
  it('viaja en la cabecera y no en la URL', async () => {
    const fetchStub = stubFetch([json(200, { items: [] })]);
    await client({ token: 'SECRETO-QUE-NO-DEBE-SALIR', fetch: fetchStub }).getCards();

    const [url] = vi.mocked(fetchStub).mock.calls[0] ?? [];
    expect(String(url)).not.toContain('SECRETO-QUE-NO-DEBE-SALIR');
  });

  it('tampoco aparece en el mensaje de un error', async () => {
    const c = client({
      token: 'SECRETO-QUE-NO-DEBE-SALIR',
      maxRetries: 0,
      fetch: stubFetch([json(403, { reason: 'accessDenied.invalidIp' })]),
    });

    try {
      await c.getCards();
      expect.unreachable('deberia haber fallado');
    } catch (error) {
      const failure = error as ClashRoyaleError;
      const serialized = JSON.stringify({
        message: failure.message,
        kind: failure.kind,
        status: failure.status,
        reason: failure.reason,
      });
      expect(serialized).not.toContain('SECRETO-QUE-NO-DEBE-SALIR');
    }
  });
});

/* ========================================================================== */
/* Normalizacion                                                               */
/* ========================================================================== */

describe('parseBattleTime', () => {
  it('entiende el formato compacto que usa la API', () => {
    expect(parseBattleTime('20260910T050249.000Z')?.toISOString()).toBe('2026-09-10T05:02:49.000Z');
  });

  it('devuelve null en lugar de una fecha inventada', () => {
    expect(parseBattleTime(undefined)).toBeNull();
    expect(parseBattleTime('')).toBeNull();
    expect(parseBattleTime('ayer por la tarde')).toBeNull();
  });
});

describe('normalizeBattle', () => {
  it('normaliza la amistosa real del spike', () => {
    const result = normalizeBattle(friendly());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.battle.type).toBe('friendly');
    expect(result.battle.isFriendly).toBe(true);
    expect(result.battle.gameModeName).toBe('Friendly');
    expect(result.battle.deckSelection).toBe('collection');
    expect(result.battle.battleTime.toISOString()).toBe('2026-09-10T05:02:49.000Z');
    expect(result.battle.sides).toHaveLength(2);
  });

  it('recoge las coronas de los dos lados', () => {
    const result = normalizeBattle(friendly());
    if (!result.ok) throw new Error('deberia normalizar');
    const crowns = result.battle.sides.map((side) => side.crowns).sort();
    expect(crowns).toEqual([0, 1]);
  });

  it('recoge los ocho de cada mazo, con nivel y evolucion', () => {
    const result = normalizeBattle(friendly());
    if (!result.ok) throw new Error('deberia normalizar');

    for (const side of result.battle.sides) {
      expect(side.deck).toHaveLength(8);
      for (const card of side.deck) {
        expect(card.cardId).toBeTypeOf('number');
        expect(card.name).toBeTypeOf('string');
      }
    }
    // La evolucion se observo de verdad en la batalla del spike.
    const evolved = result.battle.sides
      .flatMap((side) => side.deck)
      .filter((c) => c.evolutionLevel);
    expect(evolved.length).toBeGreaterThan(0);
  });

  it('cuenta las torres que seguian en pie', () => {
    const result = normalizeBattle(friendly());
    if (!result.ok) throw new Error('deberia normalizar');
    const standing = result.battle.sides.map((side) => side.princessTowersStanding);
    // El perdedor traia una torre, el ganador dos.
    expect(standing.sort()).toEqual([1, 2]);
  });

  it('distingue una batalla de escalera de una amistosa', () => {
    const result = normalizeBattle(ladder());
    if (!result.ok) throw new Error('deberia normalizar');
    expect(result.battle.type).toBe('PvP');
    expect(result.battle.isFriendly).toBe(false);
  });

  it('descarta la que no trae coronas, en vez de suponer un cero', () => {
    expect(normalizeBattle(fixture('battle-missing-crowns.json'))).toEqual({
      ok: false,
      problem: 'MISSING_CROWNS',
    });
  });

  it('descarta la que no trae etiqueta: sin ella no se sabe de quien es', () => {
    expect(normalizeBattle(fixture('battle-missing-tag.json'))).toEqual({
      ok: false,
      problem: 'MISSING_TAG',
    });
  });

  it('acepta que falte el mazo: es contexto, no marcador', () => {
    const result = normalizeBattle(fixture('battle-missing-decks.json'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.battle.sides[0].deck).toEqual([]);
    expect(result.battle.sides[0].crowns).toBeTypeOf('number');
  });

  it('descarta la que no tiene fecha: sin ella no hay ni huella', () => {
    const { battleTime: _omitted, ...sinFecha } = friendly();
    expect(normalizeBattle(sinFecha)).toEqual({ ok: false, problem: 'MISSING_BATTLE_TIME' });
  });

  it('descarta un dos contra dos: la liga es uno contra uno', () => {
    const base = friendly();
    const dosContraDos = { ...base, team: [...(base.team ?? []), ...(base.team ?? [])] };
    expect(normalizeBattle(dosContraDos)).toEqual({ ok: false, problem: 'NOT_ONE_VS_ONE' });
  });
});

describe('normalizeBattlelog', () => {
  it('separa lo aprovechable y cuenta lo descartado por su motivo', () => {
    const log = fixture<ClashBattle[]>('battlelog.json');
    const { battles, skipped } = normalizeBattlelog([
      ...log,
      fixture<ClashBattle>('battle-missing-crowns.json'),
    ]);

    expect(battles).toHaveLength(log.length);
    expect(skipped.MISSING_CROWNS).toBe(1);
    expect(skipped.MISSING_TAG).toBe(0);
  });

  it('no asume ningun tope de entradas', () => {
    // Se observaron 30 en una cuenta y 1 en otra. El codigo no depende de eso.
    const { battles } = normalizeBattlelog([]);
    expect(battles).toEqual([]);
  });
});

/* ========================================================================== */
/* Huella y deduplicacion                                                      */
/* ========================================================================== */

describe('battleFingerprint', () => {
  it('no depende del orden de las etiquetas', () => {
    const when = new Date('2026-09-10T05:02:49.000Z');
    expect(battleFingerprint(when, ['#AAA', '#BBB'])).toBe(
      battleFingerprint(when, ['#BBB', '#AAA']),
    );
  });

  it('cambia si cambia el instante', () => {
    const tags = ['#AAA', '#BBB'];
    expect(battleFingerprint(new Date('2026-09-10T05:02:49.000Z'), tags)).not.toBe(
      battleFingerprint(new Date('2026-09-10T05:02:50.000Z'), tags),
    );
  });

  it('la misma batalla desde los dos historiales da la misma huella', () => {
    // Es la propiedad que hace posible deduplicar sin identificador de batalla.
    const desdeA = normalizeBattle(friendly());
    const desdeB = normalizeBattle(mirrored());
    if (!desdeA.ok || !desdeB.ok) throw new Error('ambas deberian normalizar');

    expect(desdeA.battle.fingerprint).toBe(desdeB.battle.fingerprint);
  });
});

describe('battlesAgree', () => {
  it('reconoce que las dos versiones de la misma batalla coinciden', () => {
    const desdeA = normalizeBattle(friendly());
    const desdeB = normalizeBattle(mirrored());
    if (!desdeA.ok || !desdeB.ok) throw new Error('ambas deberian normalizar');

    expect(battlesAgree(desdeA.battle, desdeB.battle)).toBe(true);
  });

  it('detecta que la misma huella trae coronas distintas', () => {
    const base = friendly();
    const alterada = structuredClone(base);
    (alterada.team as { crowns: number }[])[0]!.crowns = 3;

    const original = normalizeBattle(base);
    const cambiada = normalizeBattle(alterada);
    if (!original.ok || !cambiada.ok) throw new Error('ambas deberian normalizar');

    expect(original.battle.fingerprint).toBe(cambiada.battle.fingerprint);
    expect(battlesAgree(original.battle, cambiada.battle)).toBe(false);
  });
});

/* ========================================================================== */
/* Deteccion de candidatos                                                     */
/* ========================================================================== */

const HOME = 'player-nimaben';
const AWAY = 'player-esteban';

function tagsOf(battle: ClashBattle): [string, string] {
  const result = normalizeBattle(battle);
  if (!result.ok) throw new Error('deberia normalizar');
  return [result.battle.sides[0].tag, result.battle.sides[1].tag];
}

function links(battle: ClashBattle): Map<string, string> {
  const [first, second] = tagsOf(battle);
  return new Map([
    [first, HOME],
    [second, AWAY],
  ]);
}

function match(overrides: Partial<MatchForMatching> = {}): MatchForMatching {
  return {
    id: 'match-1',
    roundNumber: 3,
    status: 'SCHEDULED',
    scheduledAt: new Date('2026-09-10T05:00:00.000Z'),
    homePlayerId: HOME,
    awayPlayerId: AWAY,
    hasResult: false,
    hasConfirmedCandidate: false,
    ...overrides,
  };
}

function detect(battle: ClashBattle, matches: MatchForMatching[], linked = links(battle)) {
  const normalized = normalizeBattle(battle);
  if (!normalized.ok) throw new Error('deberia normalizar');
  return detectCandidates(normalized.battle, matches, linked);
}

describe('detectCandidates', () => {
  it('propone el partido cuando todo encaja', () => {
    const result = detect(friendly(), [match()]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.reasons).toEqual(
      expect.arrayContaining(['BOTH_PLAYERS_LINKED', 'FRIENDLY_BATTLE', 'WITHIN_TIME_WINDOW']),
    );
    expect(result.candidates[0]?.ambiguities).toEqual([]);
    expect(result.candidates[0]?.confidence).toBeGreaterThan(90);
  });

  it('escribe el marcador en el orden del partido, no en el del historial', () => {
    // El mismo enfrentamiento visto desde cada historial tiene que proponer el
    // MISMO marcador. Es lo que evita registrar un resultado del reves.
    const desdeA = detect(friendly(), [match()]);
    const desdeB = detect(mirrored(), [match()], links(friendly()));

    if (!desdeA.ok || !desdeB.ok) throw new Error('ambas deberian proponer');
    expect(desdeA.candidates[0]?.proposedScore).toEqual(desdeB.candidates[0]?.proposedScore);
  });

  it('no propone nada si alguna etiqueta no esta vinculada', () => {
    expect(detect(friendly(), [match()], new Map())).toEqual({
      ok: false,
      reason: 'PLAYERS_NOT_LINKED',
    });
  });

  it('no propone nada si las dos etiquetas son del mismo participante', () => {
    const [first, second] = tagsOf(friendly());
    const mismos = new Map([
      [first, HOME],
      [second, HOME],
    ]);
    expect(detect(friendly(), [match()], mismos)).toEqual({
      ok: false,
      reason: 'SAME_PLAYER_BOTH_SIDES',
    });
  });

  it('no propone nada si esos dos no se enfrentan en el calendario', () => {
    const otros = match({ homePlayerId: 'otro-1', awayPlayerId: 'otro-2' });
    expect(detect(friendly(), [otros])).toEqual({
      ok: false,
      reason: 'NO_MATCH_BETWEEN_PLAYERS',
    });
  });

  it('marca la ida y la vuelta como ambiguas en lugar de elegir', () => {
    // La misma pareja se enfrenta dos veces por temporada. Sin fecha no hay
    // forma honesta de saber cual es, asi que se proponen las dos.
    const ida = match({ id: 'match-ida', roundNumber: 3, scheduledAt: null });
    const vuelta = match({ id: 'match-vuelta', roundNumber: 12, scheduledAt: null });

    const result = detect(friendly(), [ida, vuelta]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates).toHaveLength(2);
    for (const candidate of result.candidates) {
      expect(candidate.ambiguities).toContain('MULTIPLE_MATCHES_POSSIBLE');
      expect(candidate.ambiguities).toContain('MATCH_HAS_NO_SCHEDULE');
    }
  });

  it('la ventana temporal desempata entre ida y vuelta', () => {
    const ida = match({
      id: 'match-ida',
      roundNumber: 3,
      scheduledAt: new Date('2026-09-10T05:00:00.000Z'),
    });
    const vuelta = match({
      id: 'match-vuelta',
      roundNumber: 12,
      scheduledAt: new Date('2026-11-20T21:00:00.000Z'),
    });

    const result = detect(friendly(), [ida, vuelta]);
    if (!result.ok) throw new Error('deberia proponer');

    expect(result.candidates[0]?.matchId).toBe('match-ida');
    expect(result.candidates[0]?.reasons).toContain('WITHIN_TIME_WINDOW');
    expect(result.candidates[1]?.ambiguities).toContain('OUTSIDE_TIME_WINDOW');
    expect(result.candidates[0]!.confidence).toBeGreaterThan(result.candidates[1]!.confidence);
  });

  it('baja la confianza de una batalla que no es amistosa', () => {
    const conAmistosa = detect(friendly(), [match()]);
    const conEscalera = detect(ladder(), [match()], links(ladder()));

    if (!conAmistosa.ok || !conEscalera.ok) throw new Error('ambas deberian proponer');
    expect(conEscalera.candidates[0]?.ambiguities).toContain('NOT_A_FRIENDLY_BATTLE');
    expect(conEscalera.candidates[0]!.confidence).toBeLessThan(
      conAmistosa.candidates[0]!.confidence,
    );
  });

  it('aparta el candidato de un partido que ya tiene resultado', () => {
    const result = detect(friendly(), [match({ status: 'COMPLETED', hasResult: true })]);
    if (!result.ok) throw new Error('deberia proponer');

    expect(result.candidates[0]?.ambiguities).toContain('MATCH_ALREADY_HAS_RESULT');
    expect(result.candidates[0]?.needsReview).toBe(true);
  });

  it('aparta el de un partido aplazado o en disputa', () => {
    for (const status of ['POSTPONED', 'DISPUTED'] as const) {
      const result = detect(friendly(), [match({ status })]);
      if (!result.ok) throw new Error('deberia proponer');
      expect(result.candidates[0]?.needsReview).toBe(true);
    }
  });

  it('aparta el de un partido que ya confirmo otra batalla', () => {
    const result = detect(friendly(), [match({ hasConfirmedCandidate: true })]);
    if (!result.ok) throw new Error('deberia proponer');

    expect(result.candidates[0]?.ambiguities).toContain('ANOTHER_BATTLE_ALREADY_CONFIRMED');
    expect(result.candidates[0]?.needsReview).toBe(true);
  });

  it('aparta un empate de coronas, que el reglamento no admite', () => {
    const empate = structuredClone(friendly());
    (empate.opponent as { crowns: number }[])[0]!.crowns = 0;

    const result = detect(empate, [match()], links(friendly()));
    if (!result.ok) throw new Error('deberia proponer');

    expect(result.candidates[0]?.ambiguities).toContain('EQUAL_CROWNS');
    expect(result.candidates[0]?.needsReview).toBe(true);
  });

  it('la confianza nunca se sale de 0..100', () => {
    const pesimo = detect(
      ladder(),
      [
        match({
          status: 'CANCELLED',
          scheduledAt: new Date('2020-01-01T00:00:00.000Z'),
          hasResult: true,
          hasConfirmedCandidate: true,
        }),
      ],
      links(ladder()),
    );
    if (!pesimo.ok) throw new Error('deberia proponer');

    expect(pesimo.candidates[0]!.confidence).toBeGreaterThanOrEqual(0);
    expect(pesimo.candidates[0]!.confidence).toBeLessThanOrEqual(100);
  });

  it('toda confianza viene acompañada de sus motivos', () => {
    // Un numero que no se puede explicar no vale para decidir nada.
    const result = detect(friendly(), [match()]);
    if (!result.ok) throw new Error('deberia proponer');
    expect(result.candidates[0]!.reasons.length).toBeGreaterThan(0);
  });
});
