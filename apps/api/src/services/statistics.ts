/**
 * Estadisticas de la temporada.
 *
 * Dos familias, deliberadamente separadas:
 *
 *   **OFICIALES**  Salen del dominio, de los mismos partidos que alimentan la
 *                  clasificacion. Si estas cifras y la tabla discreparan, una de
 *                  las dos estaria mal.
 *
 *   **OBSERVADAS** Salen de lo que Clash Royale devolvio. Son evidencia
 *                  parcial: siempre viajan con el tamaño de la muestra, porque
 *                  «en tres batallas» y «en trescientas» no significan lo mismo.
 *
 * No se mezclan en ninguna respuesta, y los tipos lo impiden.
 */

import { schema } from '@liga/database';
import {
  computePlayerStatistics,
  leadersBy,
  maskClashTag,
  pointsForResult,
  observed,
  type ObservedStatistic,
  type OfficialPlayerStatistics,
} from '@liga/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { AppContext } from '../data/context.ts';
import { loadPlayedMatches } from '../data/matches.ts';
import { loadRoster, type PlayerRow } from '../data/players.ts';
import { loadSanctionsAsDomain } from '../data/sanctions.ts';
import { requireTournament } from '../data/tournament.ts';
import { notFound } from '../errors.ts';
import { tableParticipants } from './standings.ts';

/* -------------------------------------------------------------------------- */
/* Oficiales                                                                   */
/* -------------------------------------------------------------------------- */

export interface NamedOfficialStatistics extends OfficialPlayerStatistics {
  readonly displayName: string;
  readonly slug: string;
}

/** Estadisticas oficiales de todos los participantes de la tabla. */
export async function getOfficialStatistics(
  ctx: AppContext,
): Promise<readonly NamedOfficialStatistics[]> {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const players = await loadRoster(ctx.db, tournament.id);
  const participants = tableParticipants(players);

  const [matches, sanctions] = await Promise.all([
    loadPlayedMatches(ctx.db, tournament.id, settings),
    loadSanctionsAsDomain(ctx.db, tournament.id),
  ]);

  const stats = computePlayerStatistics({
    playerIds: participants.map((player: PlayerRow) => player.id),
    matches,
    sanctions,
    settings,
  });

  const names = new Map<string, PlayerRow>(
    participants.map((player) => [player.id, player] as const),
  );
  return stats.map((row) => {
    const player = names.get(row.playerId)!;
    return { ...row, displayName: player.displayName, slug: player.slug };
  });
}

export interface StatisticLeaderboard {
  readonly metric: string;
  readonly label: string;
  /** `null` cuando ningun participante tiene todavia ese dato. */
  readonly value: number | null;
  readonly leaders: readonly { readonly slug: string; readonly displayName: string }[];
  /** Si la metrica es mejor cuanto menor. Cambia como se lee el numero. */
  readonly lowerIsBetter: boolean;
}

/**
 * Los lideres de cada metrica.
 *
 * Devuelve **todos** los empatados en el primer puesto, nunca uno arbitrario.
 * En una liga de diez personas los empates son la norma, y elegir «el primero
 * que salga» seria inventarse un desempate que el reglamento no contempla.
 */
export async function getLeaderboards(ctx: AppContext): Promise<readonly StatisticLeaderboard[]> {
  const rows = await getOfficialStatistics(ctx);

  const board = (
    metric: string,
    label: string,
    pick: (row: NamedOfficialStatistics) => number | null,
    lowerIsBetter = false,
  ): StatisticLeaderboard => {
    const best = leadersBy(rows, pick, lowerIsBetter ? 'LOWEST' : 'HIGHEST');
    return {
      metric,
      label,
      value: best?.value ?? null,
      leaders:
        best === null
          ? []
          : best.playerIds.map((id) => {
              const row = rows.find((entry) => entry.playerId === id)!;
              return { slug: row.slug, displayName: row.displayName };
            }),
      lowerIsBetter,
    };
  };

  return [
    board('points', 'Más puntos', (row) => row.points),
    board('wins', 'Más victorias', (row) => row.wins),
    board('winRate', 'Mejor porcentaje de victorias', (row) => row.winRate),
    board('crownDiff', 'Mejor diferencia de coronas', (row) => row.crownDiff),
    board('crownsFor', 'Más coronas a favor', (row) => row.crownsFor),
    board('averageCrownsFor', 'Mejor media de coronas', (row) => row.averageCrownsFor),
    // Defensivas: cuanto menos, mejor. Solo cuentan quienes han jugado.
    board(
      'crownsAgainst',
      'Menos coronas encajadas',
      (row) => (row.played === 0 ? null : row.crownsAgainst),
      true,
    ),
    board('averageCrownsAgainst', 'Mejor media defensiva', (row) => row.averageCrownsAgainst, true),
    board('maxCrownWins', 'Más victorias por 3 coronas', (row) => row.maxCrownWins),
    board('bestWinStreak', 'Mejor racha de victorias', (row) => row.bestWinStreak),
  ];
}

export interface SeasonActivity {
  readonly total: number;
  readonly completed: number;
  readonly scheduled: number;
  readonly live: number;
  readonly postponed: number;
  readonly disputed: number;
  readonly cancelled: number;
  /** Aplazamientos acumulados, que no es lo mismo que partidos aplazados. */
  readonly postponementEvents: number;
}

/**
 * Actividad de la temporada.
 *
 * Un partido aplazado **no** se cuenta como jugado, y uno en disputa **no** se
 * cuenta como definitivo. Son categorias aparte a proposito: meterlos en
 * «completados» seria la forma mas silenciosa de mentir en esta pantalla.
 */
export async function getSeasonActivity(ctx: AppContext): Promise<SeasonActivity> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);

  const rows = await ctx.db
    .select({ status: schema.matches.status, total: sql<number>`count(*)::int` })
    .from(schema.matches)
    .innerJoin(schema.rounds, eq(schema.matches.roundId, schema.rounds.id))
    .where(eq(schema.rounds.tournamentId, tournament.id))
    .groupBy(schema.matches.status);

  const [postponements] = await ctx.db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.matchPostponements);

  const count = (status: string) => rows.find((row) => row.status === status)?.total ?? 0;

  return {
    total: rows.reduce((sum, row) => sum + row.total, 0),
    completed: count('COMPLETED'),
    scheduled: count('SCHEDULED'),
    live: count('LIVE'),
    postponed: count('POSTPONED'),
    disputed: count('DISPUTED'),
    cancelled: count('CANCELLED'),
    postponementEvents: postponements?.total ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Historial de un participante                                                */
/* -------------------------------------------------------------------------- */

export interface PlayerMatchRow {
  readonly matchId: string;
  readonly roundNumber: number;
  readonly scheduledAt: string | null;
  readonly opponentName: string;
  readonly opponentSlug: string;
  readonly isHome: boolean;
  readonly status: string;
  readonly crownsFor: number | null;
  readonly crownsAgainst: number | null;
  readonly points: number | null;
  /** `null` mientras el partido no cuente: aplazado, en disputa o por jugar. */
  readonly outcome: 'W' | 'L' | 'D' | null;
}

/**
 * Historial completo de un participante.
 *
 * Incluye **todos** sus partidos, no solo los jugados: el calendario tambien es
 * informacion. Los que no cuentan llegan con `outcome` en `null` y sin puntos,
 * en lugar de disfrazarse de empate a cero.
 */
export async function getPlayerHistory(
  ctx: AppContext,
  playerId: string,
): Promise<readonly PlayerMatchRow[]> {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);

  /* Todo el calendario del participante, jugado o no. */
  const rows = await ctx.db
    .select({
      matchId: schema.matches.id,
      roundNumber: schema.rounds.number,
      orderInRound: schema.matches.orderInRound,
      scheduledAt: schema.matches.scheduledAt,
      status: schema.matches.status,
      homePlayerId: schema.matches.homePlayerId,
      awayPlayerId: schema.matches.awayPlayerId,
    })
    .from(schema.matches)
    .innerJoin(schema.rounds, eq(schema.matches.roundId, schema.rounds.id))
    .where(
      and(
        eq(schema.rounds.tournamentId, tournament.id),
        sql`(${schema.matches.homePlayerId} = ${playerId} or ${schema.matches.awayPlayerId} = ${playerId})`,
      ),
    )
    .orderBy(schema.rounds.number, schema.matches.orderInRound);

  /*
   * El resultado no esta guardado: el marcador si, pero el ganador, el tipo de
   * victoria y los puntos los deriva el dominio. Se reutiliza exactamente la
   * misma carga que alimenta la clasificacion para que no puedan discrepar.
   */
  const played = await loadPlayedMatches(ctx.db, tournament.id, settings);
  const derived = new Map(played.map((match) => [match.id, match]));

  const opponentIds = rows.map((row) =>
    row.homePlayerId === playerId ? row.awayPlayerId : row.homePlayerId,
  );
  const opponents =
    opponentIds.length === 0
      ? []
      : await ctx.db.query.players.findMany({
          where: inArray(schema.players.id, [...new Set(opponentIds)]),
          columns: { id: true, displayName: true, slug: true },
        });
  const byId = new Map(opponents.map((player) => [player.id, player]));

  return rows.map((row) => {
    const isHome = row.homePlayerId === playerId;
    const opponent = byId.get(isHome ? row.awayPlayerId : row.homePlayerId);
    const match = derived.get(row.matchId);

    // Solo cuenta lo finalizado. Un aplazado o un disputado llegan sin
    // marcador y sin puntos, en lugar de disfrazarse de empate a cero.
    const counts = row.status === 'COMPLETED' && match !== undefined;

    let points: number | null = null;
    if (counts) {
      try {
        const reparto = pointsForResult(match.result, settings);
        points = isHome ? reparto.home : reparto.away;
      } catch {
        // Una regla pendiente impide repartir: se dice que no se sabe.
        points = null;
      }
    }

    return {
      matchId: row.matchId,
      roundNumber: row.roundNumber,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      opponentName: opponent?.displayName ?? 'Desconocido',
      opponentSlug: opponent?.slug ?? '',
      isHome,
      status: row.status,
      crownsFor: counts ? (isHome ? match.result.homeCrowns : match.result.awayCrowns) : null,
      crownsAgainst: counts ? (isHome ? match.result.awayCrowns : match.result.homeCrowns) : null,
      points,
      outcome: !counts
        ? null
        : match.result.outcome === 'DRAW'
          ? 'D'
          : match.result.winnerId === playerId
            ? 'W'
            : 'L',
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Observadas                                                                  */
/* -------------------------------------------------------------------------- */

export interface CardUsage {
  readonly cardId: number;
  readonly name: string;
  readonly rarity: string | null;
  readonly elixirCost: number | null;
  readonly iconUrl: string | null;
  /** Cuantos mazos observados la incluyen. */
  readonly appearances: number;
  /** Cuantas veces se vio evolucionada. */
  readonly evolutions: number;
  /** Cuantos participantes distintos la han usado. */
  readonly players: number;
}

export interface ObservedCardStatistics {
  readonly cards: readonly CardUsage[];
  /** Mazos observados sobre los que se calculo todo lo anterior. */
  readonly sampleSize: number;
  readonly battles: number;
}

/**
 * Uso de cartas en las batallas observadas.
 *
 * **No es «lo que usa el jugador»**: es lo que se vio en las batallas que la
 * API devolvio, que son una ventana estrecha y sesgada hacia lo reciente. Por
 * eso todo lo que salga de aqui se presenta como *observado* y con la muestra
 * a la vista.
 */
export async function getObservedCardStatistics(
  ctx: AppContext,
): Promise<ObservedStatistic<ObservedCardStatistics>> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);

  const usage = await ctx.db
    .select({
      cardId: schema.externalBattleCards.cardId,
      cardName: schema.externalBattleCards.cardName,
      appearances: sql<number>`count(*)::int`,
      evolutions: sql<number>`count(*) filter (where ${schema.externalBattleCards.evolutionLevel} > 0)::int`,
      players: sql<number>`count(distinct ${schema.externalBattleSides.playerId})::int`,
    })
    .from(schema.externalBattleCards)
    .innerJoin(
      schema.externalBattles,
      eq(schema.externalBattleCards.battleId, schema.externalBattles.id),
    )
    .leftJoin(
      schema.externalBattleSides,
      and(
        eq(schema.externalBattleSides.battleId, schema.externalBattleCards.battleId),
        eq(schema.externalBattleSides.side, schema.externalBattleCards.side),
      ),
    )
    .where(
      and(
        eq(schema.externalBattles.tournamentId, tournament.id),
        eq(schema.externalBattleCards.isSupport, false),
      ),
    )
    .groupBy(schema.externalBattleCards.cardId, schema.externalBattleCards.cardName)
    .orderBy(sql`count(*) desc`);

  const catalogue = await ctx.db.query.cards.findMany({
    columns: { id: true, rarity: true, elixirCost: true, iconUrl: true },
  });
  const byId = new Map(catalogue.map((card) => [card.id, card]));

  const [totals] = await ctx.db
    .select({
      battles: sql<number>`count(distinct ${schema.externalBattles.id})::int`,
      decks: sql<number>`count(distinct (${schema.externalBattleSides.battleId}::text || '-' || ${schema.externalBattleSides.side}::text))::int`,
    })
    .from(schema.externalBattles)
    .leftJoin(
      schema.externalBattleSides,
      eq(schema.externalBattleSides.battleId, schema.externalBattles.id),
    )
    .where(eq(schema.externalBattles.tournamentId, tournament.id));

  const sampleSize = totals?.decks ?? 0;

  return observed(
    {
      cards: usage.map((row) => {
        const card = byId.get(row.cardId);
        return {
          cardId: row.cardId,
          name: row.cardName,
          rarity: card?.rarity ?? null,
          elixirCost: card?.elixirCost ?? null,
          iconUrl: card?.iconUrl ?? null,
          appearances: row.appearances,
          evolutions: row.evolutions,
          players: row.players,
        };
      }),
      sampleSize,
      battles: totals?.battles ?? 0,
    },
    sampleSize,
  );
}

/**
 * Rival de una batalla observada, tal y como se puede publicar.
 *
 * Un participante se nombra; cualquier otra persona sale solo con el tag
 * enmascarado. La liga no publica el identificador entero de quien no juega.
 */
export interface ObservedOpponent {
  readonly isParticipant: boolean;
  readonly displayName: string | null;
  readonly slug: string | null;
  readonly tag: string;
}

export interface ObservedPlayerDecks {
  readonly decks: readonly {
    readonly battleId: string;
    readonly battleTime: string;
    readonly battleType: string;
    readonly opponent: ObservedOpponent | null;
    readonly cards: readonly {
      readonly cardId: number;
      readonly name: string;
      readonly level: number | null;
      readonly evolutionLevel: number | null;
      readonly iconUrl: string | null;
    }[];
    /** Media de elixir del mazo, si el catalogo tiene el coste de todas. */
    readonly averageElixir: number | null;
  }[];
}

/**
 * Mazos observados de un participante.
 *
 * Solo de batallas cuya correspondencia con un partido **confirmo un
 * administrador**. Enseñar mazos de batallas sueltas mezclaria partidas de la
 * liga con partidas de picar, y no hay forma de distinguirlas.
 */
export async function getObservedPlayerDecks(
  ctx: AppContext,
  playerId: string,
): Promise<ObservedStatistic<ObservedPlayerDecks>> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);

  const sides = await ctx.db
    .select({
      battleId: schema.externalBattles.id,
      side: schema.externalBattleSides.side,
      battleTime: schema.externalBattles.battleTime,
      battleType: schema.externalBattles.battleType,
    })
    .from(schema.externalBattleSides)
    .innerJoin(
      schema.externalBattles,
      eq(schema.externalBattleSides.battleId, schema.externalBattles.id),
    )
    .innerJoin(
      schema.battleCandidates,
      and(
        eq(schema.battleCandidates.externalBattleId, schema.externalBattles.id),
        eq(schema.battleCandidates.status, 'CONFIRMED'),
      ),
    )
    .where(
      and(
        eq(schema.externalBattles.tournamentId, tournament.id),
        eq(schema.externalBattleSides.playerId, playerId),
      ),
    );

  if (sides.length === 0) return observed({ decks: [] }, 0);

  const battleIds = [...new Set(sides.map((row) => row.battleId))];
  const [cards, rivals, catalogue, roster] = await Promise.all([
    ctx.db
      .select()
      .from(schema.externalBattleCards)
      .where(
        and(
          inArray(schema.externalBattleCards.battleId, battleIds),
          eq(schema.externalBattleCards.isSupport, false),
        ),
      ),
    ctx.db
      .select({
        battleId: schema.externalBattleSides.battleId,
        side: schema.externalBattleSides.side,
        clashTag: schema.externalBattleSides.clashTag,
      })
      .from(schema.externalBattleSides)
      .where(inArray(schema.externalBattleSides.battleId, battleIds)),
    ctx.db.query.cards.findMany({ columns: { id: true, iconUrl: true, elixirCost: true } }),
    ctx.db.query.players.findMany({
      where: eq(schema.players.tournamentId, tournament.id),
      columns: { displayName: true, slug: true, clashTag: true },
    }),
  ]);

  const byId = new Map(catalogue.map((card) => [card.id, card]));

  // Quien juega la liga se nombra; quien no, se enmascara. Su tag no es nuestro
  // para publicarlo.
  const participantsByTag = new Map(
    roster.filter((player) => player.clashTag !== null).map((player) => [player.clashTag!, player]),
  );

  const describeOpponent = (tag: string | null): ObservedOpponent | null => {
    if (tag === null) return null;
    const participant = participantsByTag.get(tag);
    if (participant === undefined) {
      return { isParticipant: false, displayName: null, slug: null, tag: maskClashTag(tag) };
    }
    return {
      isParticipant: true,
      displayName: participant.displayName,
      slug: participant.slug,
      tag,
    };
  };

  const decks = sides
    .map((entry) => {
      const own = cards
        .filter((card) => card.battleId === entry.battleId && card.side === entry.side)
        .sort((left, right) => left.slot - right.slot);

      const costs = own
        .map((card) => byId.get(card.cardId)?.elixirCost)
        .filter((cost): cost is number => typeof cost === 'number');

      const opponent = rivals.find(
        (row) => row.battleId === entry.battleId && row.side !== entry.side,
      );

      return {
        battleId: entry.battleId,
        battleTime: entry.battleTime.toISOString(),
        battleType: entry.battleType,
        opponent: describeOpponent(opponent?.clashTag ?? null),
        cards: own.map((card) => ({
          cardId: card.cardId,
          name: card.cardName,
          level: card.level,
          evolutionLevel: card.evolutionLevel,
          iconUrl: byId.get(card.cardId)?.iconUrl ?? null,
        })),
        // Solo si el catalogo conoce el coste de las ocho: una media con
        // huecos no es una media.
        averageElixir:
          costs.length === own.length && own.length > 0
            ? Math.round((costs.reduce((sum, cost) => sum + cost, 0) / costs.length) * 10) / 10
            : null,
      };
    })
    .sort((left, right) => right.battleTime.localeCompare(left.battleTime));

  return observed({ decks }, decks.length);
}

/** Un participante, por identificador o por slug. */
export async function requirePlayer(ctx: AppContext, idOrSlug: string) {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const player = await ctx.db.query.players.findFirst({
    where: and(
      eq(schema.players.tournamentId, tournament.id),
      sql`(${schema.players.id}::text = ${idOrSlug} or ${schema.players.slug} = ${idOrSlug})`,
    ),
  });
  if (player === undefined) throw notFound('Participante no encontrado.', { player: idOrSlug });
  return player;
}
