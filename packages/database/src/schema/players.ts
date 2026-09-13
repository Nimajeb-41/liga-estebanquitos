/** Participantes del torneo. */

import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { clashLinkStatusEnum, participantStatusEnum } from './enums.ts';
import { tournaments } from './tournaments.ts';

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    /** Identificador legible y estable para URLs. */
    slug: text('slug').notNull(),
    /** Tag de Clash Royale con '#'. NULL mientras no se conozca. */
    clashTag: text('clash_tag'),
    /**
     * Fecha en la que se verifico la **propiedad** de la cuenta.
     *
     * Sigue siendo NULL siempre, y no por descuido: verificarla exigiria
     * `verifytoken`, un endpoint que Supercell no documenta. Ver ADR 0015.
     */
    clashTagVerifiedAt: timestamp('clash_tag_verified_at', { withTimezone: true }),
    /** Vincular no es verificar. Ver `clashLinkStatusEnum`. */
    clashLinkStatus: clashLinkStatusEnum('clash_link_status'),
    clashLinkedAt: timestamp('clash_linked_at', { withTimezone: true }),
    /** Ultima vez que se trajo su historial de batallas. */
    clashSyncedAt: timestamp('clash_synced_at', { withTimezone: true }),
    /**
     * Nombre de la cuenta en Clash Royale.
     *
     * **No sustituye a `displayName`.** El nombre de la liga es el que manda en
     * la clasificacion, en el calendario y en toda la interfaz publica; este
     * solo sirve para que un administrador reconozca la cuenta vinculada.
     */
    clashName: text('clash_name'),
    status: participantStatusEnum('status').notNull().default('REGISTERED'),
    /**
     * Plaza 1..roster_size. Solo la ocupan los participantes CONFIRMED; las
     * plazas sin fila son las que la interfaz muestra como TBD.
     */
    slot: integer('slot'),
    avatarUrl: text('avatar_url'),
    notes: text('notes'),
    /** Participante que ocupo su plaza cuando fue sustituido. */
    replacedByPlayerId: uuid('replaced_by_player_id').references((): AnyPgColumn => players.id, {
      onDelete: 'set null',
    }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('players_tournament_slug_key').on(table.tournamentId, table.slug),
    uniqueIndex('players_tournament_clash_tag_key')
      .on(table.tournamentId, table.clashTag)
      .where(sql`${table.clashTag} is not null`),
    // Una plaza no puede estar ocupada por dos participantes a la vez.
    uniqueIndex('players_tournament_slot_key')
      .on(table.tournamentId, table.slot)
      .where(sql`${table.slot} is not null`),
    index('players_tournament_status_idx').on(table.tournamentId, table.status),
    index('players_replaced_by_idx').on(table.replacedByPlayerId),
    check('players_slot_positive', sql`${table.slot} is null or ${table.slot} >= 1`),
    // Solo un participante confirmado puede tener plaza.
    check(
      'players_slot_requires_confirmed',
      sql`${table.slot} is null or ${table.status} = 'CONFIRMED'`,
    ),
  ],
);
