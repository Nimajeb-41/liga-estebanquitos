/**
 * Mazos y cartas.
 *
 * Preparado, no integrado: en Fase 0 solo existe el modelo. El catalogo de
 * cartas se sincronizara desde la API oficial de Clash Royale (endpoint
 * /cards); mientras tanto un mazo puede cargarse a mano. Ver
 * docs/clash-royale-api.md.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { deckSourceEnum } from './enums.ts';
import { matches } from './fixture.ts';
import { players } from './players.ts';
import { tournaments } from './tournaments.ts';

/** Catalogo de cartas. El id es el que asigna la API oficial. */
export const cards = pgTable('cards', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  elixirCost: integer('elixir_cost'),
  rarity: text('rarity'),
  /** URL del icono servido por Supercell. Ver docs/branding-and-assets.md. */
  iconUrl: text('icon_url'),
  maxLevel: integer('max_level'),
  /** Observado en el catalogo real: las cartas con evolucion lo traen. */
  maxEvolutionLevel: integer('max_evolution_level'),
  /** Icono de la version evolucionada, cuando existe. */
  iconUrlEvolution: text('icon_url_evolution'),
  /**
   * Las tropas de torre llegan en `supportItems`, aparte de `items`, y no
   * traen coste de elixir. Se guardan en la misma tabla marcadas.
   */
  isSupport: boolean('is_support').notNull().default(false),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
});

export const decks = pgTable(
  'decks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** Partido en el que se uso. NULL = mazo guardado sin partido asociado. */
    matchId: uuid('match_id').references(() => matches.id, { onDelete: 'cascade' }),
    /** Numero de batalla dentro del partido, para formatos a varias partidas. */
    gameNumber: integer('game_number').notNull().default(1),
    source: deckSourceEnum('source').notNull().default('MANUAL'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('decks_match_player_game_key')
      .on(table.matchId, table.playerId, table.gameNumber)
      .where(sql`${table.matchId} is not null`),
    index('decks_player_idx').on(table.playerId),
    index('decks_tournament_idx').on(table.tournamentId),
    check('decks_game_number_positive', sql`${table.gameNumber} >= 1`),
  ],
);

export const deckCards = pgTable(
  'deck_cards',
  {
    deckId: uuid('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    /** Posicion 1..8 dentro del mazo. */
    slot: integer('slot').notNull(),
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'restrict' }),
    level: integer('level'),
  },
  (table) => [
    primaryKey({ columns: [table.deckId, table.slot] }),
    uniqueIndex('deck_cards_deck_card_key').on(table.deckId, table.cardId),
    check('deck_cards_slot_range', sql`${table.slot} between 1 and 8`),
  ],
);
