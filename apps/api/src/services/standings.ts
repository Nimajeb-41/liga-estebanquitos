/**
 * Servicio de clasificación.
 *
 * No calcula nada por su cuenta: carga los hechos y se los pasa al motor de
 * `@liga/domain`. La forma reciente, las rachas y el movimiento de posición
 * también son cálculo del dominio, no de la interfaz.
 */

import type { Standings, StandingsRow } from '@liga/contracts';
import {
  buildStandings,
  computeForm,
  headToHead,
  seasonRecords,
  standingsHistory,
  lastPlayedRound,
  positionChanges,
  STANDINGS_COLUMNS,
  type PlayedMatch,
  type RankedStandingsRow,
} from '@liga/domain';

import type { AppContext } from '../data/context.ts';
import { loadPlayedMatches } from '../data/matches.ts';
import { loadRoster, type PlayerRow } from '../data/players.ts';
import { loadSanctionsAsDomain } from '../data/sanctions.ts';
import { requireTournament } from '../data/tournament.ts';
import { badRequest, notFound } from '../errors.ts';

export interface StandingsOptions {
  readonly upToRound?: number | undefined;
}

/** Jugadores que aparecen en la tabla: los que siguen en competición. */
export function tableParticipants(players: readonly PlayerRow[]): PlayerRow[] {
  return players.filter(
    (player) => player.status === 'CONFIRMED' || player.status === 'REGISTERED',
  );
}

export async function getStandings(
  ctx: AppContext,
  options: StandingsOptions = {},
): Promise<Standings> {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const players = await loadRoster(ctx.db, tournament.id);
  const participants = tableParticipants(players);
  const playerIds = participants.map((player) => player.id);

  const [matches, sanctions] = await Promise.all([
    loadPlayedMatches(ctx.db, tournament.id, settings),
    loadSanctionsAsDomain(ctx.db, tournament.id),
  ]);

  const upToRound = options.upToRound ?? lastPlayedRound(matches);

  const rows = buildStandings({
    playerIds,
    matches,
    sanctions,
    settings,
    ...(options.upToRound === undefined ? {} : { upToRound: options.upToRound }),
  });

  // La tabla de la jornada anterior sirve para saber quién subió y quién bajó.
  const previous: RankedStandingsRow[] =
    upToRound === null || upToRound <= 1
      ? []
      : buildStandings({ playerIds, matches, sanctions, settings, upToRound: upToRound - 1 });

  const changes = positionChanges(previous, rows);

  const consideredMatches: PlayedMatch[] =
    upToRound === null ? [] : matches.filter((match) => match.roundNumber <= upToRound);
  const forms = computeForm(playerIds, consideredMatches);

  const byId = new Map(players.map((player) => [player.id, player]));

  const serialized: StandingsRow[] = rows.map((row) => {
    const player = byId.get(row.playerId);
    const form = forms.get(row.playerId);
    return {
      playerId: row.playerId,
      displayName: player?.displayName ?? 'Desconocido',
      slug: player?.slug ?? row.playerId,
      position: row.position,
      unresolvedTie: row.unresolvedTie,
      played: row.played,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      maxCrownWins: row.maxCrownWins,
      crownsFor: row.crownsFor,
      crownsAgainst: row.crownsAgainst,
      crownDiff: row.crownDiff,
      matchPoints: row.matchPoints,
      sanctionPoints: row.sanctionPoints,
      sanctionCount: row.sanctionCount,
      points: row.points,
      form: [...(form?.recent ?? [])],
      currentStreak: form?.currentStreak ?? null,
      bestWinStreak: form?.bestWinStreak ?? 0,
      positionChange: changes.get(row.playerId) ?? null,
    };
  });

  return {
    rulesVersion: settings.rulesVersion,
    tiebreakers: [...settings.tiebreakers],
    columns: Object.entries(STANDINGS_COLUMNS).map(([key, label]) => ({
      key,
      short: label.short,
      long: label.long,
    })),
    upToRound,
    rows: serialized,
  };
}

/* -------------------------------------------------------------------------- */
/* Evolucion, cara a cara y records                                            */
/* -------------------------------------------------------------------------- */

/**
 * Como quedo la tabla despues de cada jornada.
 *
 * Se recalcula entera con las reglas de hoy. No es una foto de archivo: si
 * manana cambia la puntuacion, esta grafica cambia con ella. Es lo honesto,
 * porque la clasificacion tampoco se guarda.
 */
export async function getStandingsHistory(ctx: AppContext): Promise<StandingsHistoryResponse> {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const players = await loadRoster(ctx.db, tournament.id);
  const participants = tableParticipants(players);

  const [matches, sanctions] = await Promise.all([
    loadPlayedMatches(ctx.db, tournament.id, settings),
    loadSanctionsAsDomain(ctx.db, tournament.id),
  ]);

  const history = standingsHistory({
    playerIds: participants.map((player) => player.id),
    matches,
    sanctions,
    settings,
  });

  const byId = new Map(players.map((player) => [player.id, player]));

  return {
    rulesVersion: settings.rulesVersion,
    rounds: [...history.rounds],
    players: history.players.map((entry) => {
      const player = byId.get(entry.playerId);
      return {
        playerId: entry.playerId,
        displayName: player?.displayName ?? 'Desconocido',
        slug: player?.slug ?? entry.playerId,
        points: entry.points.map((point) => ({ ...point })),
      };
    }),
  };
}

export interface StandingsHistoryResponse {
  readonly rulesVersion: string;
  readonly rounds: readonly number[];
  readonly players: readonly {
    readonly playerId: string;
    readonly displayName: string;
    readonly slug: string;
    readonly points: readonly {
      readonly round: number;
      readonly position: number;
      readonly points: number;
      readonly played: number;
    }[];
  }[];
}

export interface HeadToHeadResponse {
  readonly players: readonly {
    readonly id: string;
    readonly displayName: string;
    readonly slug: string;
  }[];
  readonly played: number;
  readonly wins: readonly [number, number];
  readonly draws: number;
  readonly crowns: readonly [number, number];
  readonly leaderId: string | null;
  readonly matches: readonly {
    readonly matchId: string;
    readonly roundNumber: number;
    readonly leg: number;
    readonly homeId: string;
    readonly homeCrowns: number;
    readonly awayCrowns: number;
    readonly winnerId: string | null;
    readonly walkover: boolean;
  }[];
}

/**
 * El historial entre dos participantes.
 *
 * Solo cuenta lo jugado. Un partido pendiente entre los dos no aparece: esto
 * responde «que ha pasado», no «que queda».
 */
export async function getHeadToHead(
  ctx: AppContext,
  idOrSlugA: string,
  idOrSlugB: string,
): Promise<HeadToHeadResponse> {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const players = await loadRoster(ctx.db, tournament.id);

  const find = (value: string) =>
    players.find((player) => player.id === value || player.slug === value);
  const a = find(idOrSlugA);
  const b = find(idOrSlugB);

  if (a === undefined || b === undefined) {
    throw notFound('No se encontro a alguno de los dos participantes.', {
      missing: a === undefined ? idOrSlugA : idOrSlugB,
    });
  }
  if (a.id === b.id) {
    throw badRequest('SAME_PLAYER', 'Un participante no se enfrenta a si mismo.');
  }

  const matches = await loadPlayedMatches(ctx.db, tournament.id, settings);
  const record = headToHead(matches, a.id, b.id);

  return {
    players: [
      { id: a.id, displayName: a.displayName, slug: a.slug },
      { id: b.id, displayName: b.displayName, slug: b.slug },
    ],
    played: record.played,
    wins: [record.winsA, record.winsB],
    draws: record.draws,
    crowns: [record.crownsA, record.crownsB],
    leaderId: record.leaderId,
    matches: record.matches.map((match) => ({ ...match })),
  };
}

export interface SeasonRecordsResponse {
  readonly rulesVersion: string;
  readonly records: readonly {
    readonly code: string;
    readonly value: number | null;
    readonly matchId: string | null;
    readonly roundNumber: number | null;
    readonly players: readonly {
      readonly id: string;
      readonly displayName: string;
      readonly slug: string;
    }[];
  }[];
}

/**
 * Records de la temporada.
 *
 * Las rachas y las victorias por 3 coronas salen de la misma tabla que la
 * clasificacion, no de una cuenta paralela: dos definiciones de «racha»
 * acabarian discrepando.
 */
export async function getSeasonRecords(ctx: AppContext): Promise<SeasonRecordsResponse> {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const players = await loadRoster(ctx.db, tournament.id);
  const participants = tableParticipants(players);
  const playerIds = participants.map((player) => player.id);

  const [matches, sanctions] = await Promise.all([
    loadPlayedMatches(ctx.db, tournament.id, settings),
    loadSanctionsAsDomain(ctx.db, tournament.id),
  ]);

  const table = buildStandings({ playerIds, matches, sanctions, settings });
  const forms = computeForm(playerIds, matches);

  const streaks = new Map(playerIds.map((id) => [id, forms.get(id)?.bestWinStreak ?? 0]));
  const maxCrowns = new Map(table.map((row) => [row.playerId, row.maxCrownWins]));

  const byId = new Map(players.map((player) => [player.id, player]));

  return {
    rulesVersion: settings.rulesVersion,
    records: seasonRecords(matches, streaks, maxCrowns).map((record) => ({
      code: record.code,
      value: record.value,
      matchId: record.matchId,
      roundNumber: record.roundNumber,
      players: record.playerIds.flatMap((id) => {
        const player = byId.get(id);
        return player === undefined
          ? []
          : [{ id: player.id, displayName: player.displayName, slug: player.slug }];
      }),
    })),
  };
}
