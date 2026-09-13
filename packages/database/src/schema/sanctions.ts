/** Sanciones registradas por la administracion. */

import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { adminUsers } from './admin.ts';
import { sanctionStatusEnum, sanctionTypeEnum } from './enums.ts';
import { matches, rounds } from './fixture.ts';
import { players } from './players.ts';
import { tournaments } from './tournaments.ts';

export const sanctions = pgTable(
  'sanctions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** Partido en el que ocurrio, si aplica. */
    matchId: uuid('match_id').references(() => matches.id, { onDelete: 'set null' }),
    /** Jornada a la que se imputa, si aplica. */
    roundId: uuid('round_id').references(() => rounds.id, { onDelete: 'set null' }),
    type: sanctionTypeEnum('type').notNull(),
    /** Penalizacion en puntos; siempre <= 0. Por defecto -2. */
    points: integer('points').notNull().default(-2),
    reason: text('reason').notNull(),
    evidenceUrl: text('evidence_url'),
    notes: text('notes'),
    issuedByAdminId: uuid('issued_by_admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'restrict' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    status: sanctionStatusEnum('status').notNull().default('ACTIVE'),
    revokedByAdminId: uuid('revoked_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sanctions_player_status_idx').on(table.tournamentId, table.playerId, table.status),
    index('sanctions_player_idx').on(table.playerId),
    index('sanctions_match_idx').on(table.matchId),
    index('sanctions_round_idx').on(table.roundId),
    check('sanctions_points_not_positive', sql`${table.points} <= 0`),
    check('sanctions_reason_not_empty', sql`length(btrim(${table.reason})) > 0`),
  ],
);
