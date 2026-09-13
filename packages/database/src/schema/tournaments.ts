/** Torneo y su configuracion. */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { tournamentStatusEnum } from './enums.ts';

export const tournaments = pgTable(
  'tournaments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    /** Temporada, p. ej. "2026-1". */
    season: text('season').notNull(),
    status: tournamentStatusEnum('status').notNull().default('DRAFT'),
    /** Numero exacto de participantes confirmados que exige el formato. */
    rosterSize: integer('roster_size').notNull().default(10),
    /** 2 = ida y vuelta. */
    legs: integer('legs').notNull().default(2),
    /** Semilla del sorteo, guardada para poder auditar y reproducir el fixture. */
    fixtureSeed: text('fixture_seed'),
    fixtureGeneratedAt: timestamp('fixture_generated_at', { withTimezone: true }),
    /**
     * Cuando se **preve** empezar y terminar.
     *
     * Son planes, no hechos: `startedAt` y `finishedAt` guardan cuando paso de
     * verdad. Separarlos permite decir «empezo dos semanas tarde» en vez de
     * reescribir la intencion original.
     */
    plannedStartAt: timestamp('planned_start_at', { withTimezone: true }),
    plannedEndAt: timestamp('planned_end_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('tournaments_roster_size_even', sql`${table.rosterSize} % 2 = 0`),
    check('tournaments_roster_size_min', sql`${table.rosterSize} >= 4`),
    check('tournaments_legs_range', sql`${table.legs} between 1 and 2`),
  ],
);

/**
 * Reglamento vigente del torneo.
 *
 * Vive en su propia tabla porque cambia por si solo (el administrador puede
 * ajustar la puntuacion o el orden de desempate sin tocar el torneo) y porque
 * asi queda claro que la tabla de clasificacion depende de esta fila.
 */
/**
 * Instantanea de cierre de temporada.
 *
 * Una representacion reproducible de como quedo la competicion: participantes,
 * calendario, resultados oficiales, clasificacion final y estadisticas, con la
 * version del reglamento y la configuracion con la que se calculo todo.
 *
 * Existe porque la clasificacion **se deriva**: no se guarda. Eso es correcto
 * mientras la temporada esta viva —cambiar el reglamento recalcula la tabla sin
 * tocar historicos— pero significa que, sin esto, la tabla final de 2026-1
 * cambiaria el dia que alguien ajuste la puntuacion para 2026-2.
 *
 * La carga va en JSON y no en columnas porque es un documento historico, no
 * una entidad viva: no se consulta por campos ni se actualiza. Se lee entera.
 */
export const seasonSnapshots = pgTable(
  'season_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    /** Con que reglamento se calculo lo que hay dentro. */
    rulesVersion: text('rules_version').notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }).notNull(),
    /** Quien la cerro. Queda vacio si esa cuenta se borra despues. */
    closedByAdminId: uuid('closed_by_admin_id'),
    closedByName: text('closed_by_name'),
    reason: text('reason').notNull(),
    /** Si se cerro con partidos sin resolver. Cambia como se lee la tabla. */
    closedWithPending: boolean('closed_with_pending').notNull().default(false),
    /**
     * El documento completo. **Nunca** lleva tokens, sesiones ni credenciales:
     * es una foto de la competicion, no del servidor.
     */
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('season_snapshots_tournament_idx').on(table.tournamentId, table.closedAt)],
);

export const tournamentSettings = pgTable(
  'tournament_settings',
  {
    tournamentId: uuid('tournament_id')
      .primaryKey()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    pointsWin: integer('points_win').notNull().default(3),
    pointsWinMaxCrowns: integer('points_win_max_crowns').notNull().default(4),
    pointsLoss: integer('points_loss').notNull().default(0),
    /** NULL = los empates todavia no estan permitidos (regla pendiente). */
    pointsDraw: integer('points_draw'),
    /** NULL = la incomparecencia todavia no esta reglada (regla pendiente). */
    pointsWalkoverWin: integer('points_walkover_win'),
    /**
     * Coronas que reparte una incomparecencia.
     *
     * NULL en las dos = sin decidir, igual que los puntos. La liga 2026-1 las
     * fija en 0: no hubo batalla, y un marcador inventado contaminaria la
     * diferencia de coronas, que es el primer desempate tras los puntos.
     */
    walkoverCrownsWinner: integer('walkover_crowns_winner'),
    walkoverCrownsLoser: integer('walkover_crowns_loser'),
    maxCrownsPerMatch: integer('max_crowns_per_match').notNull().default(3),
    sanctionDefaultPoints: integer('sanction_default_points').notNull().default(-2),
    sanctionMinPoints: integer('sanction_min_points').notNull().default(-20),
    /** Horas para impugnar un resultado ya cerrado. */
    disputeWindowHours: integer('dispute_window_hours').notNull().default(24),
    /** Minutos de tolerancia antes de considerar una incomparecencia. */
    noShowToleranceMinutes: integer('no_show_tolerance_minutes').notNull().default(15),
    /** Criterios de desempate en orden de aplicacion. */
    tiebreakers: text('tiebreakers')
      .array()
      .notNull()
      .default(sql`'{POINTS,CROWN_DIFF,WINS,HEAD_TO_HEAD,MAX_CROWN_WINS}'::text[]`),
    rulesVersion: text('rules_version').notNull().default('2026-1.draft'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('settings_sanction_not_positive', sql`${table.sanctionDefaultPoints} <= 0`),
    check('settings_max_crowns_positive', sql`${table.maxCrownsPerMatch} >= 1`),
  ],
);
