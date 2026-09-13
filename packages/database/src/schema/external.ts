/**
 * Datos observados en proveedores externos.
 *
 * Viven aparte de `matches`, `match_results`, `standings` y `sanctions` a
 * proposito, y esa separacion es la idea central de la Fase 3: **Clash Royale
 * aporta evidencia, no verdad**. Una batalla importada no puntua, no mueve la
 * tabla y no decide nada. Como mucho llega a ser un candidato que un
 * administrador confirma, y entonces el resultado se registra por el mismo
 * camino que uno introducido a mano.
 *
 * Dos decisiones que conviene entender antes de tocar nada:
 *
 * 1. **No se guarda el payload crudo.** Una batalla completa ronda los 10 KB y
 *    lleva etiquetas y nombres de terceros que no han dado permiso. Se guarda
 *    lo normalizado, que es lo que el sistema usa, y nada mas. Es la misma
 *    linea que ya trazo la ADR 0012 con la ficha publica de un partido.
 * 2. **La identidad es una huella derivada.** La API no da ningun
 *    identificador de batalla: se busco y no existe. Ver `normalizer.ts`.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { adminUsers } from './admin.ts';
import { battleCandidateStatusEnum } from './enums.ts';
import { matches } from './fixture.ts';
import { players } from './players.ts';
import { tournaments } from './tournaments.ts';

/**
 * Una batalla observada en un proveedor externo.
 *
 * `fingerprint` es la clave de deduplicacion. La misma batalla aparece en el
 * historial de los dos jugadores y tiene que guardarse una sola vez.
 */
export const externalBattles = pgTable(
  'external_battles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    /** Hoy solo existe uno, pero la columna evita reescribir esto mañana. */
    provider: text('provider').notNull().default('CLASH_ROYALE'),
    /** SHA-256 de (instante + etiquetas ordenadas). Ver `normalizer.ts`. */
    fingerprint: text('fingerprint').notNull(),
    battleTime: timestamp('battle_time', { withTimezone: true }).notNull(),
    /** Valores observados: `friendly`, `PvP`, `tournament`. */
    battleType: text('battle_type').notNull(),
    gameModeId: integer('game_mode_id'),
    gameModeName: text('game_mode_name'),
    arenaName: text('arena_name'),
    deckSelection: text('deck_selection'),
    isHostedMatch: boolean('is_hosted_match'),
    tournamentTag: text('tournament_tag'),
    /** De que historial se importo. Ayuda a explicar de donde salio el dato. */
    sourcePlayerId: uuid('source_player_id').references(() => players.id, { onDelete: 'set null' }),
    /**
     * Se enciende cuando la misma huella vuelve con datos distintos. El sistema
     * no sobrescribe: deja constancia de que algo no cuadra.
     */
    needsReview: boolean('needs_review').notNull().default(false),
    reviewReason: text('review_reason'),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('external_battles_fingerprint_key').on(
      table.tournamentId,
      table.provider,
      table.fingerprint,
    ),
    index('external_battles_time_idx').on(table.tournamentId, table.battleTime),
    index('external_battles_type_idx').on(table.tournamentId, table.battleType),
    index('external_battles_source_idx').on(table.sourcePlayerId),
  ],
);

/**
 * Un lado de una batalla externa.
 *
 * `playerId` puede ser NULL: la etiqueta observada no tiene por que
 * corresponder a ningun participante de la liga. Es lo normal en las batallas
 * de escalera contra desconocidos.
 */
export const externalBattleSides = pgTable(
  'external_battle_sides',
  {
    battleId: uuid('battle_id')
      .notNull()
      .references(() => externalBattles.id, { onDelete: 'cascade' }),
    /** 1 = `team`, 2 = `opponent`, tal y como llegaron. */
    side: integer('side').notNull(),
    clashTag: text('clash_tag').notNull(),
    /** Nombre en Clash Royale. **No** es el nombre del jugador en la liga. */
    clashName: text('clash_name'),
    crowns: integer('crowns').notNull(),
    /** Participante de la liga, si esa etiqueta esta vinculada a alguno. */
    playerId: uuid('player_id').references(() => players.id, { onDelete: 'set null' }),
    princessTowersStanding: integer('princess_towers_standing'),
    kingTowerHitPoints: integer('king_tower_hit_points'),
    startingTrophies: integer('starting_trophies'),
  },
  (table) => [
    primaryKey({ columns: [table.battleId, table.side] }),
    index('external_battle_sides_tag_idx').on(table.clashTag),
    index('external_battle_sides_player_idx').on(table.playerId),
    check('external_battle_sides_side_range', sql`${table.side} in (1, 2)`),
    check('external_battle_sides_crowns_range', sql`${table.crowns} >= 0`),
  ],
);

/**
 * Las cartas de un lado de una batalla externa.
 *
 * No se reutiliza `deck_cards` porque aquella tabla cuelga de `decks`, que
 * exige un participante de la liga; aqui las etiquetas pueden ser de cualquiera.
 * Y sobre todo: el registro de mazos de la liga tiene consecuencias normativas
 * que dependen de **P-04**, todavia sin decidir. Guardar lo observado en su
 * propia tabla evita que un dato externo se confunda con un mazo declarado.
 */
export const externalBattleCards = pgTable(
  'external_battle_cards',
  {
    battleId: uuid('battle_id')
      .notNull()
      .references(() => externalBattles.id, { onDelete: 'cascade' }),
    side: integer('side').notNull(),
    /** Posicion dentro del mazo, empezando en 1. */
    slot: integer('slot').notNull(),
    /** Distingue el mazo de las tropas de torre (`supportCards`). */
    isSupport: boolean('is_support').notNull().default(false),
    cardId: integer('card_id').notNull(),
    cardName: text('card_name').notNull(),
    level: integer('level'),
    evolutionLevel: integer('evolution_level'),
    starLevel: integer('star_level'),
  },
  (table) => [
    primaryKey({ columns: [table.battleId, table.side, table.isSupport, table.slot] }),
    index('external_battle_cards_card_idx').on(table.cardId),
    check('external_battle_cards_slot_positive', sql`${table.slot} >= 1`),
  ],
);

/**
 * Un candidato: la sospecha de que una batalla externa corresponde a un partido.
 *
 * Es una **propuesta**, nunca un resultado. `confidence` ayuda a ordenar la
 * cola de revision y no autoriza nada: ni siquiera un 100 confirma solo.
 */
export const battleCandidates = pgTable(
  'battle_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    externalBattleId: uuid('external_battle_id')
      .notNull()
      .references(() => externalBattles.id, { onDelete: 'cascade' }),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    status: battleCandidateStatusEnum('status').notNull().default('PENDING'),
    /** 0..100. Orientativo para el administrador, sin valor normativo. */
    confidence: integer('confidence').notNull(),
    /** Codigos de por que se propuso. Se muestran tal cual en el panel. */
    reasons: jsonb('reasons')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Codigos de lo que no encaja del todo. Bajan la confianza. */
    ambiguities: jsonb('ambiguities')
      .notNull()
      .default(sql`'[]'::jsonb`),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByAdminId: uuid('resolved_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    resolutionNote: text('resolution_note'),
  },
  (table) => [
    // Una batalla no propone dos veces el mismo partido.
    uniqueIndex('battle_candidates_battle_match_key').on(table.externalBattleId, table.matchId),
    index('battle_candidates_status_idx').on(table.tournamentId, table.status),
    index('battle_candidates_match_idx').on(table.matchId),
    check('battle_candidates_confidence_range', sql`${table.confidence} between 0 and 100`),
  ],
);

/**
 * Observaciones de retencion del historial de batallas.
 *
 * La Fase 3 midio que una amistosa seguia apareciendo **al menos 41,4 horas**
 * despues. Esa es una cota inferior, no la retencion: para conocer el techo hay
 * que mirar la misma batalla varias veces separadas en el tiempo y anotar
 * cuando deja de estar.
 *
 * Cada fila es una observacion, no una conclusion. La conclusion se saca
 * despues, cruzando muchas: la mayor edad con `still_present = true` da la cota
 * inferior, y la menor con `false` da la superior.
 *
 * No se llama «retencion garantizada» en ningun sitio, y no se va a llamar:
 * Supercell no publica ninguna garantia.
 */
export const battleRetentionObservations = pgTable(
  'battle_retention_observations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull().default('CLASH_ROYALE'),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
    /** Historial que se consulto. */
    playerTag: text('player_tag').notNull(),
    /** La misma huella que usa la deduplicacion. Ver `normalizer.ts`. */
    battleFingerprint: text('battle_fingerprint').notNull(),
    battleTime: timestamp('battle_time', { withTimezone: true }).notNull(),
    /** Horas entre la batalla y esta observacion. Con un decimal. */
    ageHours: numeric('age_hours', { precision: 8, scale: 1 }).notNull(),
    /** Si seguia apareciendo en el historial en ese momento. */
    stillPresent: boolean('still_present').notNull(),
    /**
     * Como respondio la API. Un fallo tambien es una observacion: sin el, un
     * 403 pasaria por «la batalla desaparecio».
     */
    requestStatus: text('request_status').notNull(),
    notes: text('notes'),
  },
  (table) => [
    index('battle_retention_fingerprint_idx').on(table.battleFingerprint, table.observedAt),
    index('battle_retention_tag_idx').on(table.playerTag, table.observedAt),
    check('battle_retention_age_positive', sql`${table.ageHours} >= 0`),
  ],
);
