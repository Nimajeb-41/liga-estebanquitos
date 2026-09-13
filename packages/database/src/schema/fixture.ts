/** Calendario oficial: jornadas, partidos y auditoria del sorteo. */

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { matchStatusEnum } from './enums.ts';
import { players } from './players.ts';
import { tournaments } from './tournaments.ts';
import { adminUsers } from './admin.ts';

export const rounds = pgTable(
  'rounds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    /** Jornada 1..18. */
    number: integer('number').notNull(),
    /** 1 = ida, 2 = vuelta. */
    leg: integer('leg').notNull(),
    label: text('label'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('rounds_tournament_number_key').on(table.tournamentId, table.number),
    check('rounds_number_positive', sql`${table.number} >= 1`),
    check('rounds_leg_range', sql`${table.leg} between 1 and 2`),
  ],
);

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    /** Orden del partido dentro de la jornada (1..5). */
    orderInRound: integer('order_in_round').notNull(),
    homePlayerId: uuid('home_player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    awayPlayerId: uuid('away_player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    status: matchStatusEnum('status').notNull().default('SCHEDULED'),
    /** Fecha vigente. Cambia al reprogramar. */
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    /**
     * Primera fecha que tuvo el partido. Se fija una vez y NUNCA se sobrescribe:
     * es lo que permite decir "esto era de la jornada 7, del dia 1 de octubre".
     */
    originalScheduledAt: timestamp('original_scheduled_at', { withTimezone: true }),
    /** Cuantas veces se aplazo. Derivable del historial; se cachea para listar. */
    postponementCount: integer('postponement_count').notNull().default(0),
    playedAt: timestamp('played_at', { withTimezone: true }),
    /** Enlace a la transmision en directo, cuando el partido se emite. */
    streamUrl: text('stream_url'),
    /** Enlace al VOD una vez terminada la emision. */
    vodUrl: text('vod_url'),
    /** Plataforma de emision (Twitch, YouTube...). Texto libre a proposito. */
    streamPlatform: text('stream_platform'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('matches_round_order_key').on(table.roundId, table.orderInRound),
    // Cada enfrentamiento con la misma condicion de local ocurre una sola vez.
    uniqueIndex('matches_oriented_pair_key').on(
      table.tournamentId,
      table.homePlayerId,
      table.awayPlayerId,
    ),
    index('matches_tournament_status_idx').on(table.tournamentId, table.status),
    index('matches_home_player_idx').on(table.homePlayerId),
    index('matches_away_player_idx').on(table.awayPlayerId),
    check('matches_distinct_players', sql`${table.homePlayerId} <> ${table.awayPlayerId}`),
    check('matches_order_positive', sql`${table.orderInRound} >= 1`),
  ],
);

/**
 * Auditoria del sorteo: cada vez que se genera (o regenera) el fixture queda
 * registrado con que semilla, que algoritmo y con que participantes.
 */
export const fixtureGenerations = pgTable(
  'fixture_generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    algorithm: text('algorithm').notNull().default('CIRCLE_METHOD'),
    seed: text('seed').notNull(),
    legs: integer('legs').notNull(),
    /** Orden efectivo de los participantes tras el barajado. */
    playerOrder: jsonb('player_order').notNull(),
    generatedByAdminId: uuid('generated_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('fixture_generations_tournament_idx').on(table.tournamentId)],
);
