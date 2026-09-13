/**
 * Tests de integracion del esquema.
 *
 * Corren contra PostgreSQL de verdad (PGlite) con las migraciones reales
 * aplicadas. Comprueban las invariantes que hace cumplir la base de datos, no
 * el codigo: si manana alguien salta el dominio y escribe directamente en SQL,
 * estas restricciones siguen protegiendo la competicion.
 */

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../src/schema/index.ts';
import { createTestDatabase, type TestDatabase } from '../src/testing.ts';

let db: TestDatabase;
let close: () => Promise<void>;
let tournamentId: string;

async function insertTournament(): Promise<string> {
  const [row] = await db
    .insert(schema.tournaments)
    .values({
      slug: `liga-test-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Liga de prueba',
      season: '2026-1',
    })
    .returning({ id: schema.tournaments.id });
  return (row as { id: string }).id;
}

async function insertPlayer(name: string, slot?: number): Promise<string> {
  const [row] = await db
    .insert(schema.players)
    .values({
      tournamentId,
      displayName: name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      ...(slot === undefined ? {} : { status: 'CONFIRMED' as const, slot }),
    })
    .returning({ id: schema.players.id });
  return (row as { id: string }).id;
}

beforeAll(async () => {
  const handle = await createTestDatabase();
  db = handle.db;
  close = handle.close;
  tournamentId = await insertTournament();
});

afterAll(async () => {
  await close();
});

describe('migraciones', () => {
  it('crea todas las tablas del modelo', async () => {
    const result = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const tables = result.rows.map((row) => row.table_name);
    for (const expected of [
      'tournaments',
      'tournament_settings',
      'players',
      'rounds',
      'matches',
      'match_results',
      'match_result_reports',
      'match_result_revisions',
      'match_postponements',
      'sanctions',
      'cards',
      'decks',
      'deck_cards',
      'admin_users',
      'admin_sessions',
      'audit_log',
      'fixture_generations',
    ]) {
      expect(tables).toContain(expected);
    }
  });

  it('deja constancia de las migraciones aplicadas', async () => {
    const result = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
    );
    expect(Number(result.rows[0]?.count ?? 0)).toBeGreaterThanOrEqual(2);
  });
});

describe('restricciones del torneo', () => {
  it('rechaza un cupo impar', async () => {
    await expect(
      db.insert(schema.tournaments).values({
        slug: 'impar',
        name: 'Impar',
        season: '2026-1',
        rosterSize: 9,
      }),
    ).rejects.toThrow();
  });

  it('rechaza dos torneos con el mismo slug', async () => {
    await db
      .insert(schema.tournaments)
      .values({ slug: 'duplicado', name: 'Uno', season: '2026-1' });
    await expect(
      db.insert(schema.tournaments).values({ slug: 'duplicado', name: 'Dos', season: '2026-1' }),
    ).rejects.toThrow();
  });
});

describe('restricciones de participantes', () => {
  it('impide que dos confirmados ocupen la misma plaza', async () => {
    await insertPlayer('Ocupa Plaza', 1);
    await expect(insertPlayer('Intruso', 1)).rejects.toThrow();
  });

  it('impide dar plaza a quien no esta confirmado', async () => {
    await expect(
      db.insert(schema.players).values({
        tournamentId,
        displayName: 'Sin confirmar',
        slug: 'sin-confirmar',
        status: 'REGISTERED',
        slot: 5,
      }),
    ).rejects.toThrow();
  });

  it('impide repetir el tag de Clash Royale dentro del torneo', async () => {
    await db.insert(schema.players).values({
      tournamentId,
      displayName: 'Con tag',
      slug: 'con-tag',
      clashTag: '#2P0LYQ0',
    });
    await expect(
      db.insert(schema.players).values({
        tournamentId,
        displayName: 'Mismo tag',
        slug: 'mismo-tag',
        clashTag: '#2P0LYQ0',
      }),
    ).rejects.toThrow();
  });

  it('permite varios participantes sin tag', async () => {
    await expect(insertPlayer('Sin tag uno')).resolves.toBeDefined();
    await expect(insertPlayer('Sin tag dos')).resolves.toBeDefined();
  });
});

describe('restricciones de partidos', () => {
  let roundId: string;
  let playerA: string;
  let playerB: string;

  beforeAll(async () => {
    const [round] = await db
      .insert(schema.rounds)
      .values({ tournamentId, number: 1, leg: 1 })
      .returning({ id: schema.rounds.id });
    roundId = (round as { id: string }).id;
    playerA = await insertPlayer('Jugador A');
    playerB = await insertPlayer('Jugador B');
  });

  it('impide que un jugador se enfrente a si mismo', async () => {
    await expect(
      db.insert(schema.matches).values({
        tournamentId,
        roundId,
        orderInRound: 1,
        homePlayerId: playerA,
        awayPlayerId: playerA,
      }),
    ).rejects.toThrow();
  });

  it('impide repetir el mismo enfrentamiento con la misma condicion de local', async () => {
    await db.insert(schema.matches).values({
      tournamentId,
      roundId,
      orderInRound: 1,
      homePlayerId: playerA,
      awayPlayerId: playerB,
    });
    const [round2] = await db
      .insert(schema.rounds)
      .values({ tournamentId, number: 2, leg: 1 })
      .returning({ id: schema.rounds.id });
    await expect(
      db.insert(schema.matches).values({
        tournamentId,
        roundId: (round2 as { id: string }).id,
        orderInRound: 1,
        homePlayerId: playerA,
        awayPlayerId: playerB,
      }),
    ).rejects.toThrow();
  });

  it('permite el mismo enfrentamiento invertido (la vuelta)', async () => {
    const [round3] = await db
      .insert(schema.rounds)
      .values({ tournamentId, number: 3, leg: 2 })
      .returning({ id: schema.rounds.id });
    await expect(
      db.insert(schema.matches).values({
        tournamentId,
        roundId: (round3 as { id: string }).id,
        orderInRound: 1,
        homePlayerId: playerB,
        awayPlayerId: playerA,
      }),
    ).resolves.toBeDefined();
  });
});

describe('restricciones de sanciones y aplazamientos', () => {
  it('impide una sancion que sume puntos', async () => {
    const adminId = (
      await db
        .insert(schema.adminUsers)
        .values({
          email: `admin-${Math.random().toString(36).slice(2, 8)}@test.local`,
          displayName: 'Admin de prueba',
          passwordHash: 'x',
        })
        .returning({ id: schema.adminUsers.id })
    )[0] as { id: string };
    const playerId = await insertPlayer('Sancionado');

    await expect(
      db.insert(schema.sanctions).values({
        tournamentId,
        playerId,
        type: 'BM',
        points: 2,
        reason: 'motivo',
        issuedByAdminId: adminId.id,
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(schema.sanctions).values({
        tournamentId,
        playerId,
        type: 'BM',
        points: -2,
        reason: '   ',
        issuedByAdminId: adminId.id,
      }),
    ).rejects.toThrow();
  });
});
