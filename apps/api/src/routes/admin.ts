/**
 * Rutas administrativas.
 *
 * Todas exigen sesion (`requireAdmin`) y todas dejan rastro en `audit_log` a
 * traves de los servicios. Aqui no hay ninguna regla de competicion: se valida
 * la entrada, se llama al servicio y se serializa la respuesta.
 */

import type { FastifyInstance } from 'fastify';

import { currentAdmin, requireAdmin } from '../auth/guard.ts';
import { auditFacets, listAudit } from '../data/audit.ts';
import type { AppContext } from '../data/context.ts';
import { requireTournament } from '../data/tournament.ts';
import {
  auditQuery,
  candidateQuery,
  candidateResolutionBody,
  cancelMatchBody,
  clashTagBody,
  confirmPlayerBody,
  correctResultBody,
  createPlayerBody,
  createSanctionBody,
  finishSeasonBody,
  generateFixtureBody,
  idParams,
  roundNumberParams,
  scheduleRoundBody,
  scheduleSeasonBody,
  liveBody,
  parse,
  postponeBody,
  replacePlayerBody,
  reportResultBody,
  rescheduleBody,
  resultBody,
  revokeSanctionBody,
  scheduleBody,
  seasonIdentityBody,
  settingsBody,
  streamBody,
  tournamentStatusBody,
  updatePlayerBody,
  walkoverBody,
} from '../schemas.ts';
import {
  confirmCandidate,
  flagCandidate,
  linkClashTag,
  listCandidates,
  listClashLinks,
  rejectCandidate,
  syncCardCatalogue,
  syncPlayerBattlelog,
  unlinkClashTag,
} from '../services/clash-royale.ts';
import { generateOfficialFixture } from '../services/fixture.ts';
import { collectAttention } from '../services/attention.ts';
import { collectMetrics } from '../services/metrics.ts';
import { scheduleRound, scheduleSeason } from '../services/rounds.ts';
import {
  cancelMatch,
  correctResult,
  declareWalkover,
  getAdminMatchDetail,
  postpone,
  recordResult,
  reportResult,
  reschedule,
  scheduleMatch,
  setMatchLive,
  setMatchStream,
} from '../services/matches.ts';
import {
  confirmPlayer,
  createPlayer,
  deletePlayer,
  listPlayersForAdmin,
  replacePlayer,
  unconfirmPlayer,
  updatePlayer,
  withdrawPlayer,
} from '../services/players.ts';
import {
  createNewSanction,
  listAllSanctions,
  revokeExistingSanction,
} from '../services/sanctions.ts';
import { changeTournamentStatus, finishSeason, getClosureReport } from '../services/tournament.ts';
import { getSeasonSnapshot, listSeasonSnapshots } from '../services/snapshot.ts';
import {
  describeConfigurableParameters,
  updateSeasonIdentity,
  updateTournamentSettings,
} from '../services/configuration.ts';

export function registerAdminRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.register(async (admin) => {
    admin.addHook('preHandler', requireAdmin(ctx));

    /* ----------------------------- Torneo ----------------------------- */

    admin.post('/api/v1/admin/tournament/status', async (request) => {
      const body = parse(tournamentStatusBody, request.body);
      return changeTournamentStatus(ctx, currentAdmin(request), body.status);
    });

    /** Identidad y fechas previstas. No toca el reglamento. */
    admin.patch('/api/v1/admin/tournament', async (request) => {
      const body = parse(seasonIdentityBody, request.body);
      return updateSeasonIdentity(ctx, currentAdmin(request), body);
    });

    /**
     * Que se puede cambiar del reglamento ahora mismo, y con que
     * consecuencia. Se consulta antes de cambiar nada: cambiar la puntuacion
     * recalcula las jornadas ya jugadas, y eso hay que avisarlo antes.
     */
    admin.get('/api/v1/admin/tournament/settings', async () => describeConfigurableParameters(ctx));

    /**
     * Cambia el reglamento.
     *
     * Si toca la puntuacion, sube la version del reglamento: la tabla se
     * recalcula hacia atras y las dos versiones tienen que distinguirse.
     */
    admin.patch('/api/v1/admin/tournament/settings', async (request) => {
      const body = parse(settingsBody, request.body);
      return updateTournamentSettings(ctx, currentAdmin(request), body);
    });

    /**
     * Que queda sin resolver antes de poder cerrar.
     *
     * Se consulta sin cerrar nada: el panel enseña la lista de lo que falta,
     * con los partidos concretos, antes de que nadie pulse nada.
     */
    admin.get('/api/v1/admin/tournament/closure', async () => getClosureReport(ctx));

    /**
     * Cierra la temporada.
     *
     * No se hace desde el selector de estado: de FINISHED no se sale, asi que
     * exige comprobar lo pendiente, un motivo por escrito y genera la
     * instantanea final.
     */
    admin.post('/api/v1/admin/tournament/finish', async (request) => {
      const body = parse(finishSeasonBody, request.body);
      return finishSeason(ctx, currentAdmin(request), body);
    });

    admin.get('/api/v1/admin/tournament/snapshots', async () => listSeasonSnapshots(ctx));

    admin.get('/api/v1/admin/tournament/snapshots/:id', async (request) => {
      const { id } = parse(idParams, request.params);
      return getSeasonSnapshot(ctx, id);
    });

    /* -------------------------- Participantes -------------------------- */

    admin.post('/api/v1/admin/players', async (request, reply) => {
      const body = parse(createPlayerBody, request.body);
      const created = await createPlayer(ctx, currentAdmin(request), body);
      reply.code(201);
      return created;
    });

    admin.patch('/api/v1/admin/players/:id', async (request) => {
      const { id } = parse(idParams, request.params);
      const body = parse(updatePlayerBody, request.body);
      await updatePlayer(ctx, currentAdmin(request), id, body);
      return { ok: true };
    });

    admin.delete('/api/v1/admin/players/:id', async (request) => {
      const { id } = parse(idParams, request.params);
      await deletePlayer(ctx, currentAdmin(request), id);
      return { ok: true };
    });

    admin.post('/api/v1/admin/players/:id/confirm', async (request) => {
      const { id } = parse(idParams, request.params);
      const body = parse(confirmPlayerBody, request.body ?? {});
      await confirmPlayer(ctx, currentAdmin(request), id, body.slot);
      return { ok: true };
    });

    admin.post('/api/v1/admin/players/:id/unconfirm', async (request) => {
      const { id } = parse(idParams, request.params);
      await unconfirmPlayer(ctx, currentAdmin(request), id);
      return { ok: true };
    });

    admin.post('/api/v1/admin/players/:id/withdraw', async (request) => {
      const { id } = parse(idParams, request.params);
      await withdrawPlayer(ctx, currentAdmin(request), id);
      return { ok: true };
    });

    admin.post('/api/v1/admin/players/:id/replace', async (request) => {
      const { id } = parse(idParams, request.params);
      const body = parse(replacePlayerBody, request.body);
      return replacePlayer(ctx, currentAdmin(request), id, body);
    });

    /* ------------------------------ Fixture ---------------------------- */

    admin.post('/api/v1/admin/fixture/generate', async (request) => {
      const body = parse(generateFixtureBody, request.body ?? {});
      return generateOfficialFixture(ctx, currentAdmin(request), body);
    });

    /* ------------------------------ Partidos --------------------------- */

    admin.post('/api/v1/admin/matches/:id/schedule', async (request) => {
      const { id } = parse(idParams, request.params);
      const body = parse(scheduleBody, request.body);
      return scheduleMatch(ctx, currentAdmin(request), id, body.scheduledAt);
    });

    /*
      Programar una jornada entera: la hora del primero y cada cuanto va el
      siguiente. Lo hace el servicio, que decide a que partidos toca y a cuales
      no; la ruta solo valida la forma.
    */
    /*
      La temporada entera de una vez: tres jornadas cada sabado es el caso de
      esta liga. Respeta las mismas reglas que programar una jornada suelta, asi
      que un horario acordado a mano no se borra sin pedirlo.
    */
    admin.post('/api/v1/admin/rounds/schedule-season', async (request) => {
      const body = parse(scheduleSeasonBody, request.body);
      return scheduleSeason(ctx, currentAdmin(request), body);
    });

    admin.post('/api/v1/admin/rounds/:number/schedule', async (request) => {
      const { number } = parse(roundNumberParams, request.params);
      const body = parse(scheduleRoundBody, request.body);
      return scheduleRound(ctx, currentAdmin(request), number, body);
    });

    admin.post('/api/v1/admin/matches/:id/live', async (request) => {
      const { id } = parse(idParams, request.params);
      const body = parse(liveBody, request.body ?? {});
      await setMatchLive(ctx, currentAdmin(request), id, body.streamUrl ?? null);
      return { ok: true };
    });

    /**
     * Cancelar es definitivo: el dominio no deja salir de CANCELLED. Por eso
     * exige motivo y queda en auditoria.
     */
    admin.post('/api/v1/admin/matches/:id/cancel', async (request) => {
      const { id } = parse(idParams, request.params);
      const body = parse(cancelMatchBody, request.body);
      return cancelMatch(ctx, currentAdmin(request), id, body.reason);
    });

    /** Enlaces de transmision: metadatos, no tocan estado ni resultado. */
    admin.post('/api/v1/admin/matches/:id/stream', async (request) => {
      const { id } = parse(idParams, request.params);
      const body = parse(streamBody, request.body);
      return setMatchStream(ctx, currentAdmin(request), id, body);
    });

    /**
     * Incomparecencia (P-01).
     *
     * Exige que haya pasado la tolerancia, quien falto y un motivo. El
     * resultado lo construye el mismo motor que un resultado escrito a mano.
     */
    admin.post('/api/v1/admin/matches/:id/walkover', async (request) => {
      const { id } = parse(idParams, request.params);
      const body = parse(walkoverBody, request.body);
      return declareWalkover(ctx, currentAdmin(request), id, body);
    });

    admin.post('/api/v1/admin/matches/:id/postpone', async (request) => {
      const { id } = parse(idParams, request.params);
      const body = parse(postponeBody, request.body);
      return postpone(ctx, currentAdmin(request), id, body);
    });

    admin.post('/api/v1/admin/matches/:id/reschedule', async (request) => {
      const { id } = parse(idParams, request.params);
      const body = parse(rescheduleBody, request.body);
      return reschedule(ctx, currentAdmin(request), id, body);
    });

    admin.post('/api/v1/admin/matches/:id/result', async (request) => {
      const { id } = parse(idParams, request.params);
      const body = parse(resultBody, request.body);
      return recordResult(ctx, currentAdmin(request), id, body);
    });

    admin.post('/api/v1/admin/matches/:id/correct-result', async (request) => {
      const { id } = parse(idParams, request.params);
      const body = parse(correctResultBody, request.body);
      return correctResult(ctx, currentAdmin(request), id, body);
    });

    admin.post('/api/v1/admin/matches/:id/report-result', async (request) => {
      const { id } = parse(idParams, request.params);
      const body = parse(reportResultBody, request.body);
      return reportResult(ctx, currentAdmin(request), id, body);
    });

    /* ----------------------------- Sanciones --------------------------- */

    admin.post('/api/v1/admin/sanctions', async (request, reply) => {
      const body = parse(createSanctionBody, request.body);
      const created = await createNewSanction(ctx, currentAdmin(request), body);
      reply.code(201);
      return created;
    });

    admin.post('/api/v1/admin/sanctions/:id/revoke', async (request) => {
      const { id } = parse(idParams, request.params);
      const body = parse(revokeSanctionBody, request.body);
      return revokeExistingSanction(ctx, currentAdmin(request), id, body.reason);
    });

    /* --------------------- Lecturas de administracion ------------------- */

    admin.get('/api/v1/admin/players', async () => listPlayersForAdmin(ctx));

    /**
     * Ficha completa de un partido: notas de aplazamiento, reportes de los
     * jugadores y motivo de cada correccion. La ruta publica devuelve una
     * proyeccion recortada.
     */
    admin.get('/api/v1/admin/matches/:id', async (request) => {
      const { id } = parse(idParams, request.params);
      return getAdminMatchDetail(ctx, id);
    });

    admin.get('/api/v1/admin/sanctions', async () => listAllSanctions(ctx));

    /* -------------------- Integracion con Clash Royale ------------------ */

    /**
     * Nada de lo que hay debajo confirma un resultado por su cuenta.
     *
     * Sincronizar importa evidencia y propone candidatos; confirmarlos es un
     * acto administrativo explicito, y ese si acaba llamando al mismo servicio
     * que un resultado escrito a mano.
     */

    admin.get('/api/v1/admin/clash-royale/links', async () => listClashLinks(ctx));

    /**
     * Vincula una cuenta. **No verifica que sea suya**: eso exigiria
     * `verifytoken`, que Supercell no documenta. La vinculacion nace
     * UNVERIFIED y P-11 sigue abierta. Ver ADR 0015.
     */
    admin.post('/api/v1/admin/clash-royale/links/:id', async (request) => {
      const { id } = parse(idParams, request.params);
      const { clashTag } = parse(clashTagBody, request.body);
      return linkClashTag(ctx, currentAdmin(request), id, clashTag);
    });

    admin.delete('/api/v1/admin/clash-royale/links/:id', async (request, reply) => {
      const { id } = parse(idParams, request.params);
      await unlinkClashTag(ctx, currentAdmin(request), id);
      return reply.status(204).send();
    });

    /** Trae el historial de un participante y propone lo que encuentre. */
    admin.post('/api/v1/admin/clash-royale/sync/:id', async (request) => {
      const { id } = parse(idParams, request.params);
      return syncPlayerBattlelog(ctx, currentAdmin(request), id);
    });

    /* --------------------- Sincronizacion automatica -------------------- */

    /**
     * Estado del planificador.
     *
     * Sirve para responder «¿por que no llegan candidatos nuevos?» sin entrar
     * en el servidor: dice si esta encendido, cuando fue la ultima vuelta y si
     * el cortacircuitos esta abierto.
     */
    admin.get('/api/v1/admin/clash-royale/sync', async () => app.clashSyncScheduler.status());

    /**
     * Una vuelta a mano.
     *
     * Mientras la sincronizacion automatica siga apagada —y lo esta por
     * defecto, porque la retencion real del historial no esta medida— esta es
     * la forma de recorrer la plantilla sin ir participante por participante.
     * No confirma nada: deja candidatos en la cola, igual que la manual.
     */
    admin.post('/api/v1/admin/clash-royale/sync-run', async () => app.clashSyncScheduler.runOnce());

    admin.post('/api/v1/admin/clash-royale/cards/sync', async (request) =>
      syncCardCatalogue(ctx, currentAdmin(request)),
    );

    admin.get('/api/v1/admin/clash-royale/candidates', async (request) => {
      const { status } = parse(candidateQuery, request.query);
      return listCandidates(ctx, status === undefined ? undefined : [status]);
    });

    /** El unico punto de la integracion que llega a tocar la competicion. */
    admin.post('/api/v1/admin/clash-royale/candidates/:id/confirm', async (request) => {
      const { id } = parse(idParams, request.params);
      const { note } = parse(candidateResolutionBody, request.body ?? {});
      return confirmCandidate(ctx, currentAdmin(request), id, note ?? null);
    });

    admin.post('/api/v1/admin/clash-royale/candidates/:id/reject', async (request, reply) => {
      const { id } = parse(idParams, request.params);
      const { note } = parse(candidateResolutionBody, request.body ?? {});
      await rejectCandidate(ctx, currentAdmin(request), id, note ?? null);
      return reply.status(204).send();
    });

    admin.post('/api/v1/admin/clash-royale/candidates/:id/review', async (request, reply) => {
      const { id } = parse(idParams, request.params);
      const { note } = parse(candidateResolutionBody, request.body ?? {});
      await flagCandidate(ctx, currentAdmin(request), id, note ?? null);
      return reply.status(204).send();
    });

    /* ----------------------------- Auditoria --------------------------- */

    /**
     * Registro de auditoria, filtrable.
     *
     * Los filtros se aplican **en la base de datos**. No es una cuestion de
     * rendimiento: filtrar en el navegador exigiria enviarle antes el registro
     * completo, y ahi dentro estan los motivos de cada correccion y las notas
     * internas de cada aplazamiento. Lo que no se pide, no se manda.
     *
     * Sigue devolviendo un array cuando no se pide nada, para no romper a quien
     * ya lo consumia asi.
     */
    admin.get('/api/v1/admin/audit', async (request) => {
      const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
      const query = parse(auditQuery, request.query ?? {});

      const filters = {
        ...(query.action === undefined ? {} : { action: query.action }),
        ...(query.actorAdminId === undefined ? {} : { actorAdminId: query.actorAdminId }),
        ...(query.entityType === undefined ? {} : { entityType: query.entityType }),
        ...(query.entityId === undefined ? {} : { entityId: query.entityId }),
        ...(query.requestId === undefined ? {} : { requestId: query.requestId }),
        ...(query.since === undefined ? {} : { since: new Date(query.since) }),
        ...(query.until === undefined ? {} : { until: new Date(query.until) }),
        limit: query.limit ?? 200,
      };

      const rows = await listAudit(ctx.db, tournament.id, filters);
      if (query.facets !== true) return rows;

      return {
        entries: rows,
        facets: await auditFacets(ctx.db, tournament.id),
        limit: filters.limit,
      };
    });

    /**
     * Centro de accion.
     *
     * Lo mismo que las metricas cuentan, pero enumerado y con su enlace. Un
     * recuento dice que hay trabajo; esto dice cual.
     */
    admin.get('/api/v1/admin/attention', async () => {
      const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
      return collectAttention(ctx, tournament.id);
    });

    /**
     * Metricas de operacion.
     *
     * Lo que hace falta para saber si la liga va bien **sin abrir la base de
     * datos**: cuanto queda por jugar, cuanto lleva atascado, y en que estado
     * esta la evidencia externa. Son recuentos, no opiniones.
     */
    admin.get('/api/v1/admin/metrics', async () => {
      const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
      return collectMetrics(ctx, tournament.id);
    });
  });
}
