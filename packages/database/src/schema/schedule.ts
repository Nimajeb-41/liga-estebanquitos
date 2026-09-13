/**
 * Historial de aplazamientos y reprogramaciones.
 *
 * Un partido aplazado no cambia de jornada ni pierde su fecha original: cada
 * movimiento anade una fila aqui con el motivo, el administrador que lo
 * autorizo y las dos fechas implicadas. La pregunta "por que este partido de la
 * jornada 7 se jugo el 15 de octubre" se responde leyendo esta tabla.
 */

import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { adminUsers } from './admin.ts';
import { postponementEventEnum, postponementReasonEnum } from './enums.ts';
import { matches } from './fixture.ts';

export const matchPostponements = pgTable(
  'match_postponements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    event: postponementEventEnum('event').notNull(),
    /** Jornada del partido en el momento del cambio. Siempre la original. */
    roundNumber: integer('round_number').notNull(),
    previousScheduledAt: timestamp('previous_scheduled_at', { withTimezone: true }),
    newScheduledAt: timestamp('new_scheduled_at', { withTimezone: true }),
    reason: postponementReasonEnum('reason').notNull(),
    /** Explicacion escrita. Obligatoria: sin motivo no hay nada que auditar. */
    notes: text('notes').notNull(),
    /** Administrador que autorizo el aplazamiento o la nueva fecha. */
    adminId: uuid('admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('match_postponements_match_idx').on(table.matchId, table.occurredAt),
    check('match_postponements_notes_not_empty', sql`length(btrim(${table.notes})) > 0`),
  ],
);
