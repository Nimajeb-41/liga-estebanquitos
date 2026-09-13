/**
 * Resultados.
 *
 * Se guardan UNICAMENTE los hechos: coronas de cada lado y como se resolvio el
 * partido. El ganador, el tipo de victoria y los puntos NO se almacenan: los
 * calcula @liga/domain a partir de estas filas y del reglamento vigente. Asi
 * cambiar la puntuacion no exige reescribir historicos, y no puede existir una
 * fila con ganador incoherente con su marcador.
 */

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

import { adminUsers } from './admin.ts';
import { matchResolutionEnum } from './enums.ts';
import { matches } from './fixture.ts';
import { players } from './players.ts';

export const matchResults = pgTable(
  'match_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matchId: uuid('match_id')
      .notNull()
      .unique()
      .references(() => matches.id, { onDelete: 'cascade' }),
    homeCrowns: integer('home_crowns').notNull(),
    awayCrowns: integer('away_crowns').notNull(),
    resolution: matchResolutionEnum('resolution').notNull().default('PLAYED'),
    /**
     * Quien no se presento. Solo en las incomparecencias.
     *
     * Sin esto un walkover no se puede reconstruir al leerlo: el marcador es
     * 0-0 y no dice quien gano. Antes el ganador se deducia de las coronas,
     * pero una incomparecencia no reparte ninguna a proposito.
     */
    absentPlayerId: uuid('absent_player_id').references(() => players.id, {
      onDelete: 'set null',
    }),
    /** Jugador que reporto el resultado, si lo reporto un jugador. */
    reportedByPlayerId: uuid('reported_by_player_id').references(() => players.id, {
      onDelete: 'set null',
    }),
    reportedAt: timestamp('reported_at', { withTimezone: true }),
    /** Administrador que lo dio por bueno. Sin esto el resultado no es oficial. */
    verifiedByAdminId: uuid('verified_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    evidenceUrl: text('evidence_url'),
    notes: text('notes'),
    /** Se incrementa con cada correccion; ver match_result_revisions. */
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'results_crowns_non_negative',
      sql`${table.homeCrowns} >= 0 and ${table.awayCrowns} >= 0`,
    ),
    // El limite exacto (3) vive en tournament_settings; aqui solo acotamos lo
    // absurdo para que ningun bug meta un numero disparatado.
    check('results_crowns_sane', sql`${table.homeCrowns} <= 20 and ${table.awayCrowns} <= 20`),
    index('match_results_reporter_idx').on(table.reportedByPlayerId),
    index('match_results_absent_idx').on(table.absentPlayerId),
  ],
);

/**
 * Reportes de resultado de los jugadores.
 *
 * Los dos reportan el marcador en el mismo orden, local-visitante. Si coinciden
 * el resultado queda validado; si no, el partido pasa a DISPUTED y lo resuelve
 * el administrador. Los reportes se conservan aunque despues haya correccion:
 * son la prueba de que cada uno dijo lo que dijo.
 */
export const matchResultReports = pgTable(
  'match_result_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    homeCrowns: integer('home_crowns').notNull(),
    awayCrowns: integer('away_crowns').notNull(),
    evidenceUrl: text('evidence_url'),
    notes: text('notes'),
    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Un reporte vigente por jugador y partido: rectificar sustituye.
    uniqueIndex('match_result_reports_match_player_key').on(table.matchId, table.playerId),
    index('match_result_reports_player_idx').on(table.playerId),
    check(
      'match_result_reports_crowns_non_negative',
      sql`${table.homeCrowns} >= 0 and ${table.awayCrowns} >= 0`,
    ),
  ],
);

/**
 * Historial de correcciones de un resultado.
 *
 * Corregir un resultado nunca borra nada: se guarda el estado anterior, el
 * nuevo, el motivo y quien lo hizo. Responde a "quien puede modificar
 * resultados" y "como se auditan los errores administrativos".
 */
export const matchResultRevisions = pgTable(
  'match_result_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    /** Estado anterior del resultado; NULL si es la primera carga. */
    previousValue: jsonb('previous_value'),
    newValue: jsonb('new_value').notNull(),
    reason: text('reason').notNull(),
    changedByAdminId: uuid('changed_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('result_revisions_match_revision_key').on(table.matchId, table.revision)],
);
