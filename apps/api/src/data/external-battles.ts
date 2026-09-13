/**
 * Acceso a datos de la evidencia externa.
 *
 * Consultas, sin reglas de competicion. Lo unico que se decide aqui es tecnico:
 * si una batalla ya estaba guardada y si lo que vuelve coincide con lo que
 * habia.
 */

import { schema } from '@liga/database';
import type { LigaDb } from '@liga/database/client';
import { and, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';

import type { NormalizedBattle } from '../integrations/clash-royale/normalizer.ts';
import type { MatchForMatching } from '../integrations/clash-royale/matching.ts';

/* -------------------------------------------------------------------------- */
/* Vinculaciones                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Etiqueta de Clash Royale -> participante de la liga.
 *
 * Solo entran las etiquetas realmente vinculadas. Un participante sin tag no
 * aparece, y por tanto ninguna batalla suya llegara a proponerse.
 */
export async function loadLinkedTags(
  db: LigaDb,
  tournamentId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: schema.players.id, clashTag: schema.players.clashTag })
    .from(schema.players)
    .where(and(eq(schema.players.tournamentId, tournamentId), isNotNull(schema.players.clashTag)));

  return new Map(rows.filter((row) => row.clashTag !== null).map((row) => [row.clashTag!, row.id]));
}

/**
 * Asocia a un participante los lados ya importados con su etiqueta.
 *
 * `player_id` se guarda al importar, y para entonces la etiqueta puede no estar
 * vinculada todavia: basta con sincronizar a uno de los dos jugadores antes de
 * vincular al otro. Sin esto, ese lado se quedaria huerfano para siempre y su
 * marcador no se podria mostrar.
 */
export async function backfillSidePlayers(
  db: LigaDb,
  clashTag: string,
  playerId: string | null,
): Promise<number> {
  const rows = await db
    .update(schema.externalBattleSides)
    .set({ playerId })
    .where(eq(schema.externalBattleSides.clashTag, clashTag))
    .returning({ battleId: schema.externalBattleSides.battleId });
  return rows.length;
}

/**
 * Batallas ya guardadas en las que participa una etiqueta.
 *
 * Se usa al vincular una cuenta: las batallas que se importaron cuando esa
 * etiqueta todavia no tenia dueño no llegaron a proponer nada, y ahora si
 * pueden.
 */
export async function loadStoredBattlesWithTag(db: LigaDb, tournamentId: string, clashTag: string) {
  const involved = await db
    .select({ battleId: schema.externalBattleSides.battleId })
    .from(schema.externalBattleSides)
    .where(eq(schema.externalBattleSides.clashTag, clashTag));

  const ids = [...new Set(involved.map((row) => row.battleId))];
  if (ids.length === 0) return [];

  const battles = await db
    .select()
    .from(schema.externalBattles)
    .where(
      and(
        eq(schema.externalBattles.tournamentId, tournamentId),
        inArray(schema.externalBattles.id, ids),
      ),
    );
  const sides = await loadBattleSides(db, ids);

  return battles.map((battle) => ({
    battle,
    sides: sides.filter((side) => side.battleId === battle.id).sort((a, b) => a.side - b.side),
  }));
}

/* -------------------------------------------------------------------------- */
/* Calendario, en la forma que necesita el emparejamiento                      */
/* -------------------------------------------------------------------------- */

export async function loadMatchesForMatching(
  db: LigaDb,
  tournamentId: string,
): Promise<MatchForMatching[]> {
  const rows = await db
    .select({
      id: schema.matches.id,
      roundNumber: schema.rounds.number,
      status: schema.matches.status,
      scheduledAt: schema.matches.scheduledAt,
      homePlayerId: schema.matches.homePlayerId,
      awayPlayerId: schema.matches.awayPlayerId,
      resultId: schema.matchResults.id,
      confirmedCandidateId: schema.battleCandidates.id,
    })
    .from(schema.matches)
    .innerJoin(schema.rounds, eq(schema.matches.roundId, schema.rounds.id))
    .leftJoin(schema.matchResults, eq(schema.matchResults.matchId, schema.matches.id))
    .leftJoin(
      schema.battleCandidates,
      and(
        eq(schema.battleCandidates.matchId, schema.matches.id),
        eq(schema.battleCandidates.status, 'CONFIRMED'),
      ),
    )
    .where(eq(schema.rounds.tournamentId, tournamentId));

  return rows.map((row) => ({
    id: row.id,
    roundNumber: row.roundNumber,
    status: row.status,
    scheduledAt: row.scheduledAt,
    homePlayerId: row.homePlayerId,
    awayPlayerId: row.awayPlayerId,
    hasResult: row.resultId !== null,
    hasConfirmedCandidate: row.confirmedCandidateId !== null,
  }));
}

/* -------------------------------------------------------------------------- */
/* Batallas externas                                                           */
/* -------------------------------------------------------------------------- */

export type SaveOutcome =
  /** No estaba: se guardo entera. */
  | 'CREATED'
  /** Ya estaba y coincide. No se toca nada. */
  | 'DUPLICATE'
  /**
   * Ya estaba pero con datos distintos. **No se sobrescribe**: se marca para
   * que alguien mire por que la misma batalla llego de dos maneras.
   */
  | 'CONFLICT';

export interface SaveResult {
  readonly battleId: string;
  readonly outcome: SaveOutcome;
}

/**
 * Guarda una batalla si no estaba ya.
 *
 * La huella es la identidad. Cuando la misma huella vuelve con otras coronas u
 * otro tipo, se conserva lo primero que se guardo y se enciende `needsReview`:
 * un dato externo no pisa a otro sin que nadie se entere.
 */
export async function saveExternalBattle(
  db: LigaDb,
  tournamentId: string,
  battle: NormalizedBattle,
  sourcePlayerId: string | null,
  linkedTags: ReadonlyMap<string, string>,
): Promise<SaveResult> {
  const existing = await db.query.externalBattles.findFirst({
    where: and(
      eq(schema.externalBattles.tournamentId, tournamentId),
      eq(schema.externalBattles.fingerprint, battle.fingerprint),
    ),
  });

  if (existing !== undefined) {
    const sides = await db
      .select({
        side: schema.externalBattleSides.side,
        clashTag: schema.externalBattleSides.clashTag,
        crowns: schema.externalBattleSides.crowns,
      })
      .from(schema.externalBattleSides)
      .where(eq(schema.externalBattleSides.battleId, existing.id));

    const stored = new Map(sides.map((row) => [row.clashTag, row.crowns]));
    const agrees =
      existing.battleType === battle.type &&
      battle.sides.every((side) => stored.get(side.tag) === side.crowns);

    if (agrees) return { battleId: existing.id, outcome: 'DUPLICATE' };

    await db
      .update(schema.externalBattles)
      .set({
        needsReview: true,
        reviewReason:
          'La misma batalla llego dos veces con datos distintos. Se conservo la primera version.',
      })
      .where(eq(schema.externalBattles.id, existing.id));

    return { battleId: existing.id, outcome: 'CONFLICT' };
  }

  const [inserted] = await db
    .insert(schema.externalBattles)
    .values({
      tournamentId,
      fingerprint: battle.fingerprint,
      battleTime: battle.battleTime,
      battleType: battle.type,
      gameModeId: battle.gameModeId,
      gameModeName: battle.gameModeName,
      arenaName: battle.arenaName,
      deckSelection: battle.deckSelection,
      isHostedMatch: battle.isHostedMatch,
      tournamentTag: battle.tournamentTag,
      sourcePlayerId,
    })
    .returning({ id: schema.externalBattles.id });

  const battleId = inserted!.id;

  await db.insert(schema.externalBattleSides).values(
    battle.sides.map((side, index) => ({
      battleId,
      side: index + 1,
      clashTag: side.tag,
      clashName: side.name,
      crowns: side.crowns,
      playerId: linkedTags.get(side.tag) ?? null,
      princessTowersStanding: side.princessTowersStanding,
      kingTowerHitPoints: side.kingTowerHitPoints,
      startingTrophies: side.startingTrophies,
    })),
  );

  const cards = battle.sides.flatMap((side, index) => [
    ...side.deck.map((card, slot) => ({
      battleId,
      side: index + 1,
      slot: slot + 1,
      isSupport: false,
      cardId: card.cardId,
      cardName: card.name,
      level: card.level,
      evolutionLevel: card.evolutionLevel,
      starLevel: card.starLevel,
    })),
    ...side.supportCards.map((card, slot) => ({
      battleId,
      side: index + 1,
      slot: slot + 1,
      isSupport: true,
      cardId: card.cardId,
      cardName: card.name,
      level: card.level,
      evolutionLevel: card.evolutionLevel,
      starLevel: card.starLevel,
    })),
  ]);

  if (cards.length > 0) await db.insert(schema.externalBattleCards).values(cards);

  return { battleId, outcome: 'CREATED' };
}

export interface StoredBattleRow {
  readonly id: string;
  readonly fingerprint: string;
  readonly battleTime: Date;
  readonly battleType: string;
  readonly gameModeName: string | null;
  readonly arenaName: string | null;
  readonly deckSelection: string | null;
  readonly needsReview: boolean;
  readonly reviewReason: string | null;
  readonly importedAt: Date;
}

export async function findBattleById(
  db: LigaDb,
  battleId: string,
): Promise<StoredBattleRow | null> {
  const row = await db.query.externalBattles.findFirst({
    where: eq(schema.externalBattles.id, battleId),
  });
  return row ?? null;
}

export async function loadBattleSides(db: LigaDb, battleIds: readonly string[]) {
  if (battleIds.length === 0) return [];
  return db
    .select()
    .from(schema.externalBattleSides)
    .where(inArray(schema.externalBattleSides.battleId, [...battleIds]));
}

export async function loadBattleCards(db: LigaDb, battleIds: readonly string[]) {
  if (battleIds.length === 0) return [];
  return db
    .select()
    .from(schema.externalBattleCards)
    .where(inArray(schema.externalBattleCards.battleId, [...battleIds]));
}

/* -------------------------------------------------------------------------- */
/* Candidatos                                                                  */
/* -------------------------------------------------------------------------- */

export interface CandidateInput {
  readonly tournamentId: string;
  readonly externalBattleId: string;
  readonly matchId: string;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly ambiguities: readonly string[];
  readonly needsReview: boolean;
}

/**
 * Registra los candidatos que no existieran ya.
 *
 * `onConflictDoNothing` sobre (batalla, partido) evita que reimportar el mismo
 * historial multiplique la cola de revision. Un candidato ya resuelto tampoco
 * revive: su fila sigue ahi con su estado.
 */
export async function saveCandidates(db: LigaDb, candidates: readonly CandidateInput[]) {
  if (candidates.length === 0) return [];
  return db
    .insert(schema.battleCandidates)
    .values(
      candidates.map((candidate) => ({
        tournamentId: candidate.tournamentId,
        externalBattleId: candidate.externalBattleId,
        matchId: candidate.matchId,
        confidence: candidate.confidence,
        reasons: candidate.reasons,
        ambiguities: candidate.ambiguities,
        status: candidate.needsReview ? ('NEEDS_REVIEW' as const) : ('PENDING' as const),
      })),
    )
    .onConflictDoNothing({
      target: [schema.battleCandidates.externalBattleId, schema.battleCandidates.matchId],
    })
    .returning({ id: schema.battleCandidates.id });
}

export async function findCandidateById(db: LigaDb, candidateId: string) {
  const row = await db.query.battleCandidates.findFirst({
    where: eq(schema.battleCandidates.id, candidateId),
  });
  return row ?? null;
}

export async function resolveCandidate(
  db: LigaDb,
  candidateId: string,
  status: 'CONFIRMED' | 'REJECTED' | 'NEEDS_REVIEW',
  adminId: string,
  note: string | null,
  now: Date,
): Promise<void> {
  await db
    .update(schema.battleCandidates)
    .set({ status, resolvedByAdminId: adminId, resolvedAt: now, resolutionNote: note })
    .where(eq(schema.battleCandidates.id, candidateId));
}

/**
 * Aparta los demas candidatos de la misma batalla.
 *
 * Una batalla no puede ser dos partidos. Confirmada para uno, las otras
 * propuestas quedan obsoletas: se marcan `NEEDS_REVIEW`, **no se rechazan**.
 * Rechazarlas seria decidir por el administrador; apartarlas solo le dice que
 * ya no hacen cola.
 */
export async function supersedeSiblingCandidates(
  db: LigaDb,
  externalBattleId: string,
  confirmedCandidateId: string,
  note: string,
  now: Date,
): Promise<number> {
  const rows = await db
    .update(schema.battleCandidates)
    .set({ status: 'NEEDS_REVIEW', resolutionNote: note, resolvedAt: now })
    .where(
      and(
        eq(schema.battleCandidates.externalBattleId, externalBattleId),
        ne(schema.battleCandidates.id, confirmedCandidateId),
        inArray(schema.battleCandidates.status, ['PENDING', 'NEEDS_REVIEW']),
      ),
    )
    .returning({ id: schema.battleCandidates.id });
  return rows.length;
}

/** Los candidatos con todo lo que el panel necesita para decidir. */
export async function listCandidateRows(
  db: LigaDb,
  tournamentId: string,
  statuses?: readonly ('PENDING' | 'NEEDS_REVIEW' | 'CONFIRMED' | 'REJECTED')[],
) {
  const home = schema.players;
  const away = sql`away_player`;

  const rows = await db
    .select({
      id: schema.battleCandidates.id,
      status: schema.battleCandidates.status,
      confidence: schema.battleCandidates.confidence,
      reasons: schema.battleCandidates.reasons,
      ambiguities: schema.battleCandidates.ambiguities,
      detectedAt: schema.battleCandidates.detectedAt,
      resolvedAt: schema.battleCandidates.resolvedAt,
      resolutionNote: schema.battleCandidates.resolutionNote,
      resolvedBy: schema.adminUsers.displayName,
      matchId: schema.matches.id,
      matchStatus: schema.matches.status,
      scheduledAt: schema.matches.scheduledAt,
      homePlayerId: schema.matches.homePlayerId,
      awayPlayerId: schema.matches.awayPlayerId,
      roundNumber: schema.rounds.number,
      battleId: schema.externalBattles.id,
      battleTime: schema.externalBattles.battleTime,
      battleType: schema.externalBattles.battleType,
      gameModeName: schema.externalBattles.gameModeName,
      arenaName: schema.externalBattles.arenaName,
      deckSelection: schema.externalBattles.deckSelection,
      battleNeedsReview: schema.externalBattles.needsReview,
    })
    .from(schema.battleCandidates)
    .innerJoin(schema.matches, eq(schema.battleCandidates.matchId, schema.matches.id))
    .innerJoin(schema.rounds, eq(schema.matches.roundId, schema.rounds.id))
    .innerJoin(
      schema.externalBattles,
      eq(schema.battleCandidates.externalBattleId, schema.externalBattles.id),
    )
    .leftJoin(
      schema.adminUsers,
      eq(schema.battleCandidates.resolvedByAdminId, schema.adminUsers.id),
    )
    .where(
      statuses === undefined
        ? eq(schema.battleCandidates.tournamentId, tournamentId)
        : and(
            eq(schema.battleCandidates.tournamentId, tournamentId),
            inArray(schema.battleCandidates.status, [...statuses]),
          ),
    )
    .orderBy(desc(schema.battleCandidates.confidence), desc(schema.battleCandidates.detectedAt));

  void home;
  void away;
  return rows;
}

/** Batallas externas asociadas a un partido a traves de sus candidatos. */
export async function listBattlesForMatch(db: LigaDb, matchId: string) {
  return db
    .select({
      candidateId: schema.battleCandidates.id,
      candidateStatus: schema.battleCandidates.status,
      confidence: schema.battleCandidates.confidence,
      battleId: schema.externalBattles.id,
      battleTime: schema.externalBattles.battleTime,
      battleType: schema.externalBattles.battleType,
      gameModeName: schema.externalBattles.gameModeName,
      arenaName: schema.externalBattles.arenaName,
      deckSelection: schema.externalBattles.deckSelection,
    })
    .from(schema.battleCandidates)
    .innerJoin(
      schema.externalBattles,
      eq(schema.battleCandidates.externalBattleId, schema.externalBattles.id),
    )
    .where(eq(schema.battleCandidates.matchId, matchId))
    .orderBy(desc(schema.externalBattles.battleTime));
}

/* -------------------------------------------------------------------------- */
/* Catalogo de cartas                                                          */
/* -------------------------------------------------------------------------- */

export interface CardUpsert {
  readonly id: number;
  readonly name: string;
  readonly elixirCost: number | null;
  readonly rarity: string | null;
  readonly iconUrl: string | null;
  readonly iconUrlEvolution: string | null;
  readonly maxLevel: number | null;
  readonly maxEvolutionLevel: number | null;
  readonly isSupport: boolean;
}

export async function upsertCards(db: LigaDb, cards: readonly CardUpsert[], now: Date) {
  if (cards.length === 0) return 0;
  await db
    .insert(schema.cards)
    .values(cards.map((card) => ({ ...card, syncedAt: now })))
    .onConflictDoUpdate({
      target: schema.cards.id,
      set: {
        name: sql`excluded.name`,
        elixirCost: sql`excluded.elixir_cost`,
        rarity: sql`excluded.rarity`,
        iconUrl: sql`excluded.icon_url`,
        iconUrlEvolution: sql`excluded.icon_url_evolution`,
        maxLevel: sql`excluded.max_level`,
        maxEvolutionLevel: sql`excluded.max_evolution_level`,
        isSupport: sql`excluded.is_support`,
        syncedAt: sql`excluded.synced_at`,
      },
    });
  return cards.length;
}

export async function countCards(db: LigaDb): Promise<number> {
  const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.cards);
  return row?.total ?? 0;
}
