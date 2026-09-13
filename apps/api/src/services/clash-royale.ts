/**
 * Servicio de integracion con Clash Royale.
 *
 * Orquesta el camino completo, y su forma es el argumento entero de la Fase 3:
 *
 *   battlelog -> normalizacion -> batalla externa -> candidato -> ADMINISTRADOR -> resultado
 *
 * Ese paso en mayusculas no se puede saltar. Nada de lo que hay aqui escribe en
 * `match_results` ni en la clasificacion: cuando un administrador confirma un
 * candidato, este servicio llama a `recordResult`, el **mismo** que atiende un
 * resultado escrito a mano. La puntuacion, el tipo de victoria y la tabla los
 * sigue calculando el motor de siempre.
 *
 * Escribir aqui una segunda forma de puntuar seria garantizar que algun dia las
 * dos dijeran cosas distintas.
 */

import { schema } from '@liga/database';
import { and, eq } from 'drizzle-orm';

import { writeAudit } from '../data/audit.ts';
import type { AdminIdentity, AppContext } from '../data/context.ts';
import {
  backfillSidePlayers,
  countCards,
  findCandidateById,
  listBattlesForMatch,
  listCandidateRows,
  loadBattleCards,
  loadBattleSides,
  loadLinkedTags,
  loadMatchesForMatching,
  loadStoredBattlesWithTag,
  resolveCandidate,
  saveCandidates,
  saveExternalBattle,
  supersedeSiblingCandidates,
  upsertCards,
  type CandidateInput,
  type SaveOutcome,
} from '../data/external-battles.ts';
import { requireTournament } from '../data/tournament.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import { ClashRoyaleClient, assertValidTag } from '../integrations/clash-royale/client.ts';
import { detectCandidates } from '../integrations/clash-royale/matching.ts';
import {
  FRIENDLY_BATTLE_TYPE,
  normalizeBattlelog,
  type NormalizationProblem,
  type NormalizedBattle,
} from '../integrations/clash-royale/normalizer.ts';
import { ClashRoyaleError } from '../integrations/clash-royale/types.ts';
import { recordResult } from './matches.ts';

/* -------------------------------------------------------------------------- */
/* Cliente                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Construye el cliente, o explica por que no se puede.
 *
 * Sin token no hay integracion. Fallar aqui con un mensaje claro es mejor que
 * dejar que cada peticion se estrelle contra un 403 indistinguible de una IP
 * mal declarada.
 */
function clientFor(ctx: AppContext): ClashRoyaleClient {
  if (ctx.clashRoyaleClient !== undefined) return ctx.clashRoyaleClient;
  if (!ctx.config.clashRoyale.enabled || ctx.config.clashRoyale.token === null) {
    throw conflict(
      'CLASH_ROYALE_DISABLED',
      'La integracion con Clash Royale no esta configurada en este servidor.',
    );
  }
  return new ClashRoyaleClient({
    baseUrl: ctx.config.clashRoyale.baseUrl,
    token: ctx.config.clashRoyale.token,
    timeoutMs: ctx.config.clashRoyale.timeoutMs,
    maxRetries: ctx.config.clashRoyale.maxRetries,
  });
}

/**
 * Traduce un fallo de la API externa a un error de la nuestra.
 *
 * Se conserva el motivo tecnico porque a un administrador le sirve —un 403 casi
 * siempre es la IP—, pero **nunca** se deja escapar nada del token: el cliente
 * no lo pone en los mensajes y aqui tampoco se añade.
 */
function translate(error: unknown): never {
  if (error instanceof ClashRoyaleError) {
    const status = error.kind === 'THROTTLED' ? 'CLASH_ROYALE_THROTTLED' : `CLASH_${error.kind}`;
    throw conflict(status, error.message, {
      kind: error.kind,
      upstreamStatus: error.status,
      reason: error.reason,
    });
  }
  throw error;
}

/* -------------------------------------------------------------------------- */
/* Vinculacion de etiquetas                                                    */
/* -------------------------------------------------------------------------- */

export interface ClashLink {
  readonly playerId: string;
  readonly displayName: string;
  readonly clashTag: string | null;
  readonly clashName: string | null;
  /**
   * `UNVERIFIED` siempre que haya vinculacion. `VERIFIED` no se asigna nunca:
   * comprobar la propiedad exigiria `verifytoken`, que Supercell no documenta.
   * Ver ADR 0015. **Esto no cierra P-11.**
   */
  readonly linkStatus: 'UNVERIFIED' | 'VERIFIED' | null;
  readonly linkedAt: string | null;
  readonly syncedAt: string | null;
}

function toLink(row: {
  id: string;
  displayName: string;
  clashTag: string | null;
  clashName: string | null;
  clashLinkStatus: 'UNVERIFIED' | 'VERIFIED' | null;
  clashLinkedAt: Date | null;
  clashSyncedAt: Date | null;
}): ClashLink {
  return {
    playerId: row.id,
    displayName: row.displayName,
    clashTag: row.clashTag,
    clashName: row.clashName,
    linkStatus: row.clashLinkStatus,
    linkedAt: row.clashLinkedAt?.toISOString() ?? null,
    syncedAt: row.clashSyncedAt?.toISOString() ?? null,
  };
}

export async function listClashLinks(ctx: AppContext): Promise<ClashLink[]> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const rows = await ctx.db.query.players.findMany({
    where: eq(schema.players.tournamentId, tournament.id),
    columns: {
      id: true,
      displayName: true,
      clashTag: true,
      clashName: true,
      clashLinkStatus: true,
      clashLinkedAt: true,
      clashSyncedAt: true,
    },
  });
  return rows.map(toLink);
}

/**
 * Vincula una cuenta de Clash Royale a un participante.
 *
 * Tres cosas que hace, y una que no:
 *
 * - valida la forma de la etiqueta antes de construir ninguna URL;
 * - **comprueba contra la API que la cuenta existe**, para no vincular un tag
 *   inventado, y guarda su nombre para que un administrador la reconozca;
 * - impide que dos participantes reclamen la misma etiqueta, cosa que ademas
 *   ya fuerza un indice unico en la base de datos.
 *
 * Lo que no hace: **verificar que la cuenta sea de esa persona**. No se puede
 * sin `verifytoken`, que no esta documentado. Por eso la vinculacion nace
 * `UNVERIFIED` y se queda ahi. Un participante podria declarar la etiqueta de
 * otro, y el sistema no lo detectaria: eso es exactamente P-11, y sigue
 * abierta.
 */
export async function linkClashTag(
  ctx: AppContext,
  admin: AdminIdentity,
  playerId: string,
  rawTag: string,
): Promise<ClashLink> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);

  let tag: string;
  try {
    tag = assertValidTag(rawTag);
  } catch {
    throw badRequest(
      'INVALID_CLASH_TAG',
      `"${rawTag}" no tiene forma de etiqueta de Clash Royale.`,
    );
  }

  const player = await ctx.db.query.players.findFirst({
    where: and(eq(schema.players.id, playerId), eq(schema.players.tournamentId, tournament.id)),
  });
  if (player === undefined) throw notFound('Participante no encontrado.', { playerId });

  const taken = await ctx.db.query.players.findFirst({
    where: and(eq(schema.players.tournamentId, tournament.id), eq(schema.players.clashTag, tag)),
    columns: { id: true, displayName: true },
  });
  if (taken !== undefined && taken.id !== playerId) {
    throw conflict('CLASH_TAG_TAKEN', `Esa etiqueta ya esta vinculada a ${taken.displayName}.`, {
      tag,
    });
  }

  // Que la cuenta exista es comprobable; que sea suya, no.
  let clashName: string | null = null;
  try {
    const account = await clientFor(ctx).getPlayer(tag);
    clashName = account.name ?? null;
  } catch (error) {
    if (error instanceof ClashRoyaleError && error.kind === 'NOT_FOUND') {
      throw badRequest('CLASH_TAG_NOT_FOUND', 'Esa etiqueta no existe en Clash Royale.', { tag });
    }
    translate(error);
  }

  const now = ctx.now();
  await ctx.db
    .update(schema.players)
    .set({
      clashTag: tag,
      clashName,
      clashLinkStatus: 'UNVERIFIED',
      clashLinkedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.players.id, playerId));

  // Puede haber batallas ya importadas con esta etiqueta sin dueño: se
  // sincronizo a su rival antes de vincularla. Se adoptan, y ademas se vuelven
  // a evaluar: cuando se importaron no habia con quien emparejarlas, y ahora si.
  const adopted = await backfillSidePlayers(ctx.db, tag, playerId);
  const revived = await proposeForStoredBattles(ctx, tournament.id, tag);

  await writeAudit(ctx.db, {
    tournamentId: tournament.id,
    actorAdminId: admin.id,
    requestId: admin.requestId,
    action: 'CLASH_TAG_LINKED',
    entityType: 'player',
    entityId: playerId,
    payload: {
      tag,
      clashName,
      linkStatus: 'UNVERIFIED',
      adoptedBattleSides: adopted,
      candidatesCreated: revived,
    },
  });

  const updated = await ctx.db.query.players.findFirst({
    where: eq(schema.players.id, playerId),
    columns: {
      id: true,
      displayName: true,
      clashTag: true,
      clashName: true,
      clashLinkStatus: true,
      clashLinkedAt: true,
      clashSyncedAt: true,
    },
  });
  return toLink(updated!);
}

export async function unlinkClashTag(
  ctx: AppContext,
  admin: AdminIdentity,
  playerId: string,
): Promise<void> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const player = await ctx.db.query.players.findFirst({
    where: and(eq(schema.players.id, playerId), eq(schema.players.tournamentId, tournament.id)),
  });
  if (player === undefined) throw notFound('Participante no encontrado.', { playerId });

  await ctx.db
    .update(schema.players)
    .set({
      clashTag: null,
      clashName: null,
      clashLinkStatus: null,
      clashLinkedAt: null,
      updatedAt: ctx.now(),
    })
    .where(eq(schema.players.id, playerId));

  if (player.clashTag !== null) await backfillSidePlayers(ctx.db, player.clashTag, null);

  await writeAudit(ctx.db, {
    tournamentId: tournament.id,
    actorAdminId: admin.id,
    requestId: admin.requestId,
    action: 'CLASH_TAG_UNLINKED',
    entityType: 'player',
    entityId: playerId,
    payload: { previousTag: player.clashTag },
  });
}

/* -------------------------------------------------------------------------- */
/* Sincronizacion del historial                                                */
/* -------------------------------------------------------------------------- */

/**
 * Vuelve a evaluar las batallas ya guardadas de una etiqueta.
 *
 * Una batalla importada cuando alguno de los dos lados no estaba vinculado no
 * llego a proponer nada: `detectCandidates` exige las dos etiquetas conocidas.
 * Al vincular la que faltaba, esas batallas dejan de ser inservibles, y seria
 * absurdo obligar a resincronizar —sobre todo cuando la ventana de retencion
 * puede haberlas dejado ya fuera del historial.
 *
 * Reconstruye lo justo para emparejar: instante, tipo y los dos lados con sus
 * coronas. Los mazos no intervienen en la deteccion.
 */
async function proposeForStoredBattles(
  ctx: AppContext,
  tournamentId: string,
  clashTag: string,
): Promise<number> {
  const stored = await loadStoredBattlesWithTag(ctx.db, tournamentId, clashTag);
  if (stored.length === 0) return 0;

  const linkedTags = await loadLinkedTags(ctx.db, tournamentId);
  const matches = await loadMatchesForMatching(ctx.db, tournamentId);
  const candidates: CandidateInput[] = [];

  for (const entry of stored) {
    if (entry.sides.length !== 2) continue;
    const [first, second] = entry.sides;

    const asSide = (side: (typeof entry.sides)[number]) => ({
      tag: side.clashTag,
      name: side.clashName,
      crowns: side.crowns,
      deck: [],
      supportCards: [],
      princessTowersStanding: side.princessTowersStanding,
      kingTowerHitPoints: side.kingTowerHitPoints,
      startingTrophies: side.startingTrophies,
    });

    const rebuilt: NormalizedBattle = {
      fingerprint: entry.battle.fingerprint,
      battleTime: entry.battle.battleTime,
      type: entry.battle.battleType,
      isFriendly: entry.battle.battleType === FRIENDLY_BATTLE_TYPE,
      gameModeId: entry.battle.gameModeId,
      gameModeName: entry.battle.gameModeName,
      arenaName: entry.battle.arenaName,
      deckSelection: entry.battle.deckSelection,
      isHostedMatch: entry.battle.isHostedMatch,
      tournamentTag: entry.battle.tournamentTag,
      sides: [asSide(first!), asSide(second!)],
    };

    const detection = detectCandidates(rebuilt, matches, linkedTags, {
      timeWindowMinutes: ctx.config.clashRoyale.matching.timeWindowMinutes,
    });
    if (!detection.ok) continue;

    for (const candidate of detection.candidates) {
      candidates.push({
        tournamentId,
        externalBattleId: entry.battle.id,
        matchId: candidate.matchId,
        confidence: candidate.confidence,
        reasons: candidate.reasons,
        ambiguities: candidate.ambiguities,
        needsReview: candidate.needsReview,
      });
    }
  }

  const created = await saveCandidates(ctx.db, candidates);
  return created.length;
}

export interface SyncReport {
  readonly playerId: string;
  readonly clashTag: string;
  /** Cuantas entradas devolvio la API. No se asume ningun tope. */
  readonly fetched: number;
  readonly imported: number;
  readonly duplicates: number;
  readonly conflicts: number;
  /** Batallas descartadas al normalizar, contadas por motivo. */
  readonly skipped: Readonly<Record<NormalizationProblem, number>>;
  readonly candidatesCreated: number;
  readonly syncedAt: string;
}

/**
 * Trae el historial de un participante y propone lo que encuentre.
 *
 * No se filtra por tipo antes de guardar: se importa lo que llega y el tipo se
 * conserva. Una batalla de escalera entre dos participantes de la liga es
 * evidencia legitima de que jugaron, y que **no** sea amistosa es precisamente
 * una ambiguedad que el administrador debe ver, no algo que ocultarle.
 */
export async function syncPlayerBattlelog(
  ctx: AppContext,
  /** `null` cuando la ejecuta el planificador y no una persona. */
  admin: AdminIdentity | null,
  playerId: string,
): Promise<SyncReport> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);

  const player = await ctx.db.query.players.findFirst({
    where: and(eq(schema.players.id, playerId), eq(schema.players.tournamentId, tournament.id)),
  });
  if (player === undefined) throw notFound('Participante no encontrado.', { playerId });
  if (player.clashTag === null) {
    throw conflict(
      'CLASH_TAG_NOT_LINKED',
      `${player.displayName} no tiene ninguna cuenta de Clash Royale vinculada.`,
    );
  }

  let raw;
  try {
    raw = await clientFor(ctx).getBattleLog(player.clashTag);
  } catch (error) {
    translate(error);
  }

  const { battles, skipped } = normalizeBattlelog(raw);
  const linkedTags = await loadLinkedTags(ctx.db, tournament.id);
  const matches = await loadMatchesForMatching(ctx.db, tournament.id);

  const counts: Record<SaveOutcome, number> = { CREATED: 0, DUPLICATE: 0, CONFLICT: 0 };
  const candidates: CandidateInput[] = [];

  for (const battle of battles) {
    const saved = await saveExternalBattle(ctx.db, tournament.id, battle, playerId, linkedTags);
    counts[saved.outcome] += 1;

    const detection = detectCandidates(battle, matches, linkedTags, {
      timeWindowMinutes: ctx.config.clashRoyale.matching.timeWindowMinutes,
    });
    if (!detection.ok) continue;

    for (const candidate of detection.candidates) {
      candidates.push({
        tournamentId: tournament.id,
        externalBattleId: saved.battleId,
        matchId: candidate.matchId,
        confidence: candidate.confidence,
        reasons: candidate.reasons,
        ambiguities: candidate.ambiguities,
        needsReview: candidate.needsReview,
      });
    }
  }

  const created = await saveCandidates(ctx.db, candidates);
  const syncedAt = ctx.now();

  await ctx.db
    .update(schema.players)
    .set({ clashSyncedAt: syncedAt })
    .where(eq(schema.players.id, playerId));

  await writeAudit(ctx.db, {
    tournamentId: tournament.id,
    // Sin persona detras queda `null`: la auditoria distingue entre «lo hizo
    // fulano» y «lo hizo el sistema», y no se inventa un responsable.
    actorAdminId: admin?.id ?? null,
    requestId: admin?.requestId,
    action: 'CLASH_BATTLELOG_SYNCED',
    entityType: 'player',
    entityId: playerId,
    payload: {
      tag: player.clashTag,
      fetched: raw.length,
      imported: counts.CREATED,
      duplicates: counts.DUPLICATE,
      conflicts: counts.CONFLICT,
      candidatesCreated: created.length,
    },
  });

  return {
    playerId,
    clashTag: player.clashTag,
    fetched: raw.length,
    imported: counts.CREATED,
    duplicates: counts.DUPLICATE,
    conflicts: counts.CONFLICT,
    skipped,
    candidatesCreated: created.length,
    syncedAt: syncedAt.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Catalogo de cartas                                                          */
/* -------------------------------------------------------------------------- */

export interface CardSyncReport {
  readonly cards: number;
  readonly supportCards: number;
  readonly total: number;
  readonly syncedAt: string;
}

export async function syncCardCatalogue(
  ctx: AppContext,
  admin: AdminIdentity,
): Promise<CardSyncReport> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);

  let payload;
  try {
    payload = await clientFor(ctx).getCards();
  } catch (error) {
    translate(error);
  }

  const now = ctx.now();
  const toRow = (card: (typeof payload.cards)[number], isSupport: boolean) => ({
    id: card.id!,
    name: card.name!,
    elixirCost: card.elixirCost ?? null,
    rarity: card.rarity ?? null,
    iconUrl: card.iconUrls?.medium ?? null,
    iconUrlEvolution: card.iconUrls?.evolutionMedium ?? null,
    maxLevel: card.maxLevel ?? null,
    maxEvolutionLevel: card.maxEvolutionLevel ?? null,
    isSupport,
  });

  // Una carta sin id o sin nombre no se guarda: no se inventa ninguno.
  const usable = (card: { id?: number; name?: string }) =>
    typeof card.id === 'number' && typeof card.name === 'string';

  const cards = payload.cards.filter(usable).map((card) => toRow(card, false));
  const supportCards = payload.supportCards.filter(usable).map((card) => toRow(card, true));

  await upsertCards(ctx.db, [...cards, ...supportCards], now);
  const total = await countCards(ctx.db);

  await writeAudit(ctx.db, {
    tournamentId: tournament.id,
    actorAdminId: admin.id,
    requestId: admin.requestId,
    action: 'CLASH_CARDS_SYNCED',
    entityType: 'cards',
    entityId: null,
    payload: { cards: cards.length, supportCards: supportCards.length, total },
  });

  return {
    cards: cards.length,
    supportCards: supportCards.length,
    total,
    syncedAt: now.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Candidatos                                                                  */
/* -------------------------------------------------------------------------- */

export type CandidateStatus = 'PENDING' | 'NEEDS_REVIEW' | 'CONFIRMED' | 'REJECTED';

export async function listCandidates(ctx: AppContext, statuses?: readonly CandidateStatus[]) {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const rows = await listCandidateRows(ctx.db, tournament.id, statuses);
  if (rows.length === 0) return [];

  const battleIds = [...new Set(rows.map((row) => row.battleId))];
  const [sides, cards, players] = await Promise.all([
    loadBattleSides(ctx.db, battleIds),
    loadBattleCards(ctx.db, battleIds),
    ctx.db.query.players.findMany({
      where: eq(schema.players.tournamentId, tournament.id),
      columns: { id: true, displayName: true, clashTag: true },
    }),
  ]);

  const names = new Map(players.map((player) => [player.id, player.displayName]));
  // La vinculacion vigente manda sobre el `playerId` que se guardo al importar:
  // una etiqueta puede haberse vinculado despues de traer la batalla.
  const byTag = new Map(
    players
      .filter((player) => player.clashTag !== null)
      .map((player) => [player.clashTag!, player.id]),
  );
  const ownerOf = (side: { clashTag: string; playerId: string | null }): string | null =>
    byTag.get(side.clashTag) ?? side.playerId;

  return rows.map((row) => {
    const battleSides = sides.filter((side) => side.battleId === row.battleId);
    const deckOf = (side: number, support: boolean) =>
      cards
        .filter(
          (card) =>
            card.battleId === row.battleId && card.side === side && card.isSupport === support,
        )
        .sort((left, right) => left.slot - right.slot)
        .map((card) => ({
          cardId: card.cardId,
          name: card.cardName,
          level: card.level,
          evolutionLevel: card.evolutionLevel,
          starLevel: card.starLevel,
        }));

    // El marcador se reordena al orden del partido: el historial consultado
    // pudo ser el del visitante.
    const homeSide = battleSides.find((side) => ownerOf(side) === row.homePlayerId) ?? null;
    const awaySide = battleSides.find((side) => ownerOf(side) === row.awayPlayerId) ?? null;

    return {
      id: row.id,
      status: row.status,
      confidence: row.confidence,
      reasons: (row.reasons as string[]) ?? [],
      ambiguities: (row.ambiguities as string[]) ?? [],
      detectedAt: row.detectedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolvedBy: row.resolvedBy,
      resolutionNote: row.resolutionNote,
      match: {
        id: row.matchId,
        roundNumber: row.roundNumber,
        status: row.matchStatus,
        scheduledAt: row.scheduledAt?.toISOString() ?? null,
        homeName: names.get(row.homePlayerId) ?? 'Desconocido',
        awayName: names.get(row.awayPlayerId) ?? 'Desconocido',
      },
      battle: {
        id: row.battleId,
        battleTime: row.battleTime.toISOString(),
        battleType: row.battleType,
        gameModeName: row.gameModeName,
        arenaName: row.arenaName,
        deckSelection: row.deckSelection,
        needsReview: row.battleNeedsReview,
        home:
          homeSide === null
            ? null
            : {
                clashTag: homeSide.clashTag,
                clashName: homeSide.clashName,
                crowns: homeSide.crowns,
                deck: deckOf(homeSide.side, false),
                supportCards: deckOf(homeSide.side, true),
              },
        away:
          awaySide === null
            ? null
            : {
                clashTag: awaySide.clashTag,
                clashName: awaySide.clashName,
                crowns: awaySide.crowns,
                deck: deckOf(awaySide.side, false),
                supportCards: deckOf(awaySide.side, true),
              },
      },
    };
  });
}

export type CandidateView = Awaited<ReturnType<typeof listCandidates>>[number];

async function requireCandidate(ctx: AppContext, candidateId: string) {
  const candidate = await findCandidateById(ctx.db, candidateId);
  if (candidate === null) throw notFound('Candidato no encontrado.', { candidateId });
  if (candidate.status === 'CONFIRMED' || candidate.status === 'REJECTED') {
    throw conflict(
      'CANDIDATE_ALREADY_RESOLVED',
      `Este candidato ya se resolvio como ${candidate.status}.`,
      { status: candidate.status },
    );
  }
  return candidate;
}

/**
 * Confirma un candidato: lo convierte en resultado oficial.
 *
 * Es el unico punto de toda la integracion que toca la competicion, y lo hace
 * por el camino de siempre. `recordResult` valida las coronas, rechaza el
 * empate (R-01), deriva el ganador y el tipo de victoria, reparte los puntos
 * segun el reglamento vigente y deja su propia entrada de auditoria. Aqui no se
 * calcula ni un punto.
 *
 * El marcador se toma de la batalla y se escribe en el orden del partido. Si la
 * batalla no trae los dos lados vinculados a los dos participantes, no se
 * confirma: preferimos no registrar nada a registrar un marcador del reves.
 */
export async function confirmCandidate(
  ctx: AppContext,
  admin: AdminIdentity,
  candidateId: string,
  note: string | null,
) {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const candidate = await requireCandidate(ctx, candidateId);

  const [view] = await listCandidates(ctx, ['PENDING', 'NEEDS_REVIEW']).then((all) =>
    all.filter((entry) => entry.id === candidateId),
  );
  if (view === undefined) throw notFound('Candidato no encontrado.', { candidateId });

  if (view.battle.home === null || view.battle.away === null) {
    throw conflict(
      'CANDIDATE_SIDES_UNRESOLVED',
      'No se puede confirmar: alguno de los dos lados de la batalla no esta vinculado a un participante del partido.',
    );
  }

  const result = await recordResult(ctx, admin, candidate.matchId, {
    homeCrowns: view.battle.home.crowns,
    awayCrowns: view.battle.away.crowns,
    notes:
      note ??
      `Confirmado desde una batalla observada en Clash Royale del ${view.battle.battleTime}.`,
  });

  const now = ctx.now();
  await resolveCandidate(ctx.db, candidateId, 'CONFIRMED', admin.id, note, now);

  // La misma batalla no puede ser dos partidos: sus otras propuestas dejan de
  // hacer cola. Se apartan, no se rechazan.
  const superseded = await supersedeSiblingCandidates(
    ctx.db,
    candidate.externalBattleId,
    candidateId,
    'Esta batalla se confirmo para otro partido.',
    now,
  );

  await writeAudit(ctx.db, {
    tournamentId: tournament.id,
    actorAdminId: admin.id,
    requestId: admin.requestId,
    action: 'BATTLE_CANDIDATE_CONFIRMED',
    entityType: 'battle_candidate',
    entityId: candidateId,
    payload: {
      matchId: candidate.matchId,
      externalBattleId: candidate.externalBattleId,
      confidence: candidate.confidence,
      score: { home: view.battle.home.crowns, away: view.battle.away.crowns },
      supersededCandidates: superseded,
      note,
    },
  });

  return result;
}

export async function rejectCandidate(
  ctx: AppContext,
  admin: AdminIdentity,
  candidateId: string,
  note: string | null,
): Promise<void> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const candidate = await requireCandidate(ctx, candidateId);

  await resolveCandidate(ctx.db, candidateId, 'REJECTED', admin.id, note, ctx.now());

  await writeAudit(ctx.db, {
    tournamentId: tournament.id,
    actorAdminId: admin.id,
    requestId: admin.requestId,
    action: 'BATTLE_CANDIDATE_REJECTED',
    entityType: 'battle_candidate',
    entityId: candidateId,
    payload: { matchId: candidate.matchId, note },
  });
}

/** Aparta un candidato sin resolverlo: alguien tiene que mirarlo con calma. */
export async function flagCandidate(
  ctx: AppContext,
  admin: AdminIdentity,
  candidateId: string,
  note: string | null,
): Promise<void> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const candidate = await requireCandidate(ctx, candidateId);

  await resolveCandidate(ctx.db, candidateId, 'NEEDS_REVIEW', admin.id, note, ctx.now());

  await writeAudit(ctx.db, {
    tournamentId: tournament.id,
    actorAdminId: admin.id,
    requestId: admin.requestId,
    action: 'BATTLE_CANDIDATE_FLAGGED',
    entityType: 'battle_candidate',
    entityId: candidateId,
    payload: { matchId: candidate.matchId, note },
  });
}

/* -------------------------------------------------------------------------- */
/* Evidencia de un partido                                                     */
/* -------------------------------------------------------------------------- */

export interface MatchEvidenceCard {
  readonly cardId: number;
  readonly name: string;
  readonly level: number | null;
  readonly evolutionLevel: number | null;
  readonly iconUrl: string | null;
}

export interface MatchEvidenceSide {
  readonly clashTag: string;
  readonly clashName: string | null;
  readonly crowns: number;
  readonly deck: readonly MatchEvidenceCard[];
}

export interface MatchEvidence {
  readonly battleId: string;
  readonly candidateStatus: CandidateStatus;
  readonly confidence: number;
  readonly battleTime: string;
  readonly battleType: string;
  readonly gameModeName: string | null;
  readonly arenaName: string | null;
  readonly deckSelection: string | null;
  readonly home: MatchEvidenceSide | null;
  readonly away: MatchEvidenceSide | null;
}

/**
 * Evidencia externa de un partido, para el Match Center.
 *
 * Solo se publica la de un candidato **confirmado**. Una sospecha sin resolver
 * no se enseña al publico: leerla como resultado seria inevitable.
 */
export async function getMatchEvidence(
  ctx: AppContext,
  matchId: string,
): Promise<MatchEvidence | null> {
  const rows = await listBattlesForMatch(ctx.db, matchId);
  const confirmed = rows.find((row) => row.candidateStatus === 'CONFIRMED');
  if (confirmed === undefined) return null;

  const match = await ctx.db.query.matches.findFirst({
    where: eq(schema.matches.id, matchId),
    columns: { homePlayerId: true, awayPlayerId: true },
  });
  if (match === undefined) return null;

  const [sides, cards, catalogue, linked] = await Promise.all([
    loadBattleSides(ctx.db, [confirmed.battleId]),
    loadBattleCards(ctx.db, [confirmed.battleId]),
    ctx.db.query.cards.findMany({ columns: { id: true, iconUrl: true } }),
    ctx.db.query.players.findMany({ columns: { id: true, clashTag: true } }),
  ]);
  const icons = new Map(catalogue.map((card) => [card.id, card.iconUrl]));
  // Igual que en la cola de candidatos: manda la vinculacion vigente, no el
  // `playerId` que se guardo al importar la batalla.
  const byTag = new Map(
    linked
      .filter((player) => player.clashTag !== null)
      .map((player) => [player.clashTag!, player.id]),
  );

  const build = (playerId: string): MatchEvidenceSide | null => {
    const side = sides.find((entry) => (byTag.get(entry.clashTag) ?? entry.playerId) === playerId);
    if (side === undefined) return null;
    return {
      clashTag: side.clashTag,
      clashName: side.clashName,
      crowns: side.crowns,
      deck: cards
        .filter((card) => card.side === side.side && !card.isSupport)
        .sort((left, right) => left.slot - right.slot)
        .map((card) => ({
          cardId: card.cardId,
          name: card.cardName,
          level: card.level,
          evolutionLevel: card.evolutionLevel,
          iconUrl: icons.get(card.cardId) ?? null,
        })),
    };
  };

  return {
    battleId: confirmed.battleId,
    candidateStatus: confirmed.candidateStatus,
    confidence: confirmed.confidence,
    battleTime: confirmed.battleTime.toISOString(),
    battleType: confirmed.battleType,
    gameModeName: confirmed.gameModeName,
    arenaName: confirmed.arenaName,
    deckSelection: confirmed.deckSelection,
    home: build(match.homePlayerId),
    away: build(match.awayPlayerId),
  };
}
