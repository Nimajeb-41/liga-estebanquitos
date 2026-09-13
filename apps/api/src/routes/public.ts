/**
 * Rutas públicas. Todas de solo lectura y con proyecciones públicas: nada de
 * notas internas, evidencia ni datos de administración.
 */

import type { Rules } from '@liga/contracts';
import {
  describeFormat,
  MATCH_STATUSES,
  REQUIRED_STANDINGS_COLUMNS,
  STANDINGS_COLUMNS,
  TOURNAMENT_STATUSES,
} from '@liga/domain';
import type { FastifyInstance } from 'fastify';

import type { AppContext } from '../data/context.ts';
import { listMatches, listRounds } from '../data/matches.ts';
import { requireTournament } from '../data/tournament.ts';
import { notFound } from '../errors.ts';
import { headToHeadParams, idParams, parse, playerParams, standingsQuery } from '../schemas.ts';
import { getFixture } from '../services/fixture.ts';
import { getMatchEvidence } from '../services/clash-royale.ts';
import {
  getLeaderboards,
  getObservedCardStatistics,
  getObservedPlayerDecks,
  getOfficialStatistics,
  getPlayerHistory,
  getSeasonActivity,
  requirePlayer,
} from '../services/statistics.ts';
import { CONFIGURABLE_PARAMETERS } from '../services/configuration.ts';
import { getMatchDetail } from '../services/matches.ts';
import { listPlayers } from '../services/players.ts';
import { listPublicSanctions } from '../services/sanctions.ts';
import { serializeMatch, serializeRound } from '../services/serializers.ts';
import {
  getHeadToHead,
  getSeasonRecords,
  getStandings,
  getStandingsHistory,
} from '../services/standings.ts';
import { getBroadcastStatus } from '../services/broadcast.ts';
import { getStats } from '../services/stats.ts';
import { getTournamentOverview } from '../services/tournament.ts';

export function registerPublicRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/v1/tournament', async () => getTournamentOverview(ctx));

  app.get('/api/v1/rules', async (): Promise<Rules> => {
    const { settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);

    return {
      rulesVersion: settings.rulesVersion,
      format: describeFormat(settings),
      scoring: {
        win: settings.scoring.win,
        winWithMaxCrowns: settings.scoring.winWithMaxCrowns,
        loss: settings.scoring.loss,
        draw: settings.scoring.draw,
        walkoverWin: settings.scoring.walkoverWin,
        walkoverCrowns:
          settings.scoring.walkoverCrowns === null
            ? null
            : [settings.scoring.walkoverCrowns[0], settings.scoring.walkoverCrowns[1]],
      },
      crowns: { maxPerMatch: settings.crowns.maxPerMatch },
      sanctions: {
        defaultPoints: settings.sanctions.defaultPoints,
        minPoints: settings.sanctions.minPoints,
      },
      disputes: { windowHours: settings.disputes.windowHours },
      noShow: {
        toleranceMinutes: settings.noShow.toleranceMinutes,
        automatic: settings.noShow.automatic,
      },
      tiebreakers: [...settings.tiebreakers],
      tournamentStatuses: [...TOURNAMENT_STATUSES],
      matchStatuses: [...MATCH_STATUSES],
      standingsColumns: REQUIRED_STANDINGS_COLUMNS.map((key) => ({
        key,
        ...STANDINGS_COLUMNS[key],
      })),
      pending: {
        draws: settings.scoring.draw === null,
        walkovers: settings.scoring.walkoverWin === null,
        reference: 'docs/pending-rules.md',
      },
      /*
        Que es decision de esta temporada y que es formato del juego.

        Sin esto el reglamento parece grabado en piedra, y no lo esta: que una
        victoria por tres coronas valga 4 puntos lo decidio quien lleva la
        liga, y un lector tiene derecho a saberlo.
      */
      configurable: CONFIGURABLE_PARAMETERS.map((parameter) => ({ ...parameter })),
    };
  });

  app.get('/api/v1/players', async () => listPlayers(ctx));

  /** Acepta el identificador o el slug: las URL públicas usan el slug. */
  app.get('/api/v1/players/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { players } = await listPlayers(ctx);
    const player = players.find((row) => row.id === id || row.slug === id);
    if (player === undefined) throw notFound(`No existe el participante ${id}.`);
    return player;
  });

  app.get('/api/v1/fixture', async () => getFixture(ctx));

  app.get('/api/v1/rounds', async () => {
    const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
    const rounds = await listRounds(ctx.db, tournament.id);
    return rounds.map(serializeRound);
  });

  /** Acepta el identificador de la jornada o su número (1..18). */
  app.get('/api/v1/rounds/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
    const rounds = await listRounds(ctx.db, tournament.id);
    const asNumber = Number(id);
    const round = rounds.find(
      (row) => row.id === id || (Number.isInteger(asNumber) && row.number === asNumber),
    );
    if (round === undefined) throw notFound(`No existe la jornada ${id}.`);

    const matches = await listMatches(ctx.db, tournament.id);
    return {
      ...serializeRound(round),
      matches: matches
        .filter((row) => row.match.roundId === round.id)
        .map((row) => serializeMatch(row, settings)),
    };
  });

  app.get('/api/v1/matches', async () => {
    const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
    const matches = await listMatches(ctx.db, tournament.id);
    return matches.map((row) => serializeMatch(row, settings));
  });

  app.get('/api/v1/matches/:id', async (request) => {
    const { id } = parse(idParams, request.params);
    return getMatchDetail(ctx, id);
  });

  /**
   * Estado minimo de un partido, para sondear en directo.
   *
   * La `revision` sube cada vez que algo del partido cambia. Quien sondea
   * compara ese numero y solo repinta cuando de verdad hay novedad, en vez de
   * comparar la ficha entera en el navegador.
   *
   * Vive en memoria: un reinicio la devuelve a cero y el unico efecto es un
   * refresco de mas. No hay nada que perder ahi, porque el estado real esta en
   * la base.
   */
  app.get('/api/v1/matches/:id/live', async (request) => {
    const { id } = parse(idParams, request.params);
    const match = await getMatchDetail(ctx, id);

    return {
      id: match.id,
      status: match.status,
      result: match.result,
      scheduledAt: match.scheduledAt,
      playedAt: match.playedAt,
      stream: match.stream,
      revision: app.matchRevisions.get(id),
      fetchedAt: ctx.now().toISOString(),
    };
  });

  /* ------------------------------ Estadisticas ----------------------------- */

  /**
   * Estadisticas de la temporada.
   *
   * Todas **oficiales**: salen del dominio, de los mismos partidos que
   * alimentan la clasificacion. Lo observado en Clash Royale va aparte y
   * marcado como tal.
   */
  app.get('/api/v1/statistics', async () => {
    const [players, leaderboards, activity] = await Promise.all([
      getOfficialStatistics(ctx),
      getLeaderboards(ctx),
      getSeasonActivity(ctx),
    ]);
    return { source: 'OFFICIAL' as const, players, leaderboards, activity };
  });

  /** Estadisticas e historial completo de un participante. */
  app.get('/api/v1/players/:id/statistics', async (request) => {
    const { id } = parse(playerParams, request.params);
    const player = await requirePlayer(ctx, id);
    const [all, history] = await Promise.all([
      getOfficialStatistics(ctx),
      getPlayerHistory(ctx, player.id),
    ]);

    const statistics = all.find((row) => row.playerId === player.id);
    if (statistics === undefined) {
      // Un participante retirado o sustituido no figura en la tabla.
      throw notFound('Ese participante no figura en la clasificacion.', { player: id });
    }
    return { statistics, history };
  });

  /**
   * Uso de cartas en las batallas observadas.
   *
   * **Observado, no total**: es lo que se vio en las batallas que la API
   * devolvio, no todo lo que ha jugado nadie.
   */
  app.get('/api/v1/cards', async () => getObservedCardStatistics(ctx));

  /** Mazos observados de un participante, solo de batallas confirmadas. */
  app.get('/api/v1/players/:id/decks', async (request) => {
    const { id } = parse(playerParams, request.params);
    const player = await requirePlayer(ctx, id);
    return getObservedPlayerDecks(ctx, player.id);
  });

  /**
   * Evidencia externa de un partido.
   *
   * Solo la de un candidato **confirmado** por administracion. Una sospecha sin
   * resolver no sale de aqui: el publico la leeria como resultado.
   */
  app.get('/api/v1/matches/:id/evidence', async (request) => {
    const { id } = parse(idParams, request.params);
    return getMatchEvidence(ctx, id);
  });

  app.get('/api/v1/standings', async (request) => {
    const query = parse(standingsQuery, request.query);
    return getStandings(ctx, { upToRound: query.upToRound });
  });

  /*
    La tabla despues de cada jornada. Se recalcula, no se lee de ningun sitio:
    la clasificacion se deriva, y su historia tambien.
  */
  app.get('/api/v1/standings/history', async () => getStandingsHistory(ctx));

  /** Records de la temporada. Las incomparecencias no cuentan como marcador. */
  app.get('/api/v1/records', async () => getSeasonRecords(ctx));

  /** El cara a cara entre dos participantes, por id o por slug. */
  app.get('/api/v1/head-to-head/:a/:b', async (request) => {
    const { a, b } = parse(headToHeadParams, request.params);
    return getHeadToHead(ctx, a, b);
  });

  /**
   * ¿Hay algo que ver ahora mismo?
   *
   * Solo dice que sí cuando el canal está emitiendo **Clash Royale** y además
   * hay partidos de la liga en juego. Con una sola de las dos se mentiría: ni
   * emitir otro juego es retransmitir la liga, ni un partido marcado en juego
   * con el canal apagado se puede ver en ninguna parte.
   */
  app.get('/api/v1/broadcast', async () => {
    const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
    return getBroadcastStatus(ctx, tournament.id, {
      channelName: ctx.config.broadcast.channelName,
      channelUrl: ctx.config.broadcast.channelUrl,
      kick: ctx.kick,
    });
  });

  app.get('/api/v1/stats', async () => getStats(ctx));

  app.get('/api/v1/sanctions', async () => listPublicSanctions(ctx));
}
