/**
 * Instantánea de cierre de temporada.
 *
 * La clasificación de esta plataforma **se deriva**: no se guarda en ninguna
 * tabla, se calcula cada vez a partir de los partidos, las sanciones y el
 * reglamento vigente. Eso es lo correcto mientras la temporada está viva
 * —cambiar la puntuación recalcula la tabla sin tocar ningún histórico— pero
 * tiene una consecuencia incómoda: **la clasificación final de 2026-1
 * cambiaría el día que alguien ajuste el reglamento para 2026-2**.
 *
 * Esta instantánea resuelve eso. Al cerrar la temporada se congela todo lo que
 * hace falta para reconstruirla: qué reglas regían, quién jugó, qué pasó en
 * cada partido y cómo quedó la tabla. Es un documento histórico, no una
 * entidad viva.
 *
 * Dos cosas que **no** lleva:
 *
 * - **Nada del servidor.** Ni tokens, ni sesiones, ni credenciales, ni URL
 *   internas. Es una foto de la competición.
 * - **Nada observado presentado como oficial.** Lo que salió de Clash Royale va
 *   en su propio bloque y marcado, porque en seis meses nadie se va a acordar
 *   de cuál era cuál.
 */

import { schema } from '@liga/database';
import type { ClosureReport } from '@liga/domain';
import { and, eq } from 'drizzle-orm';

import { listAudit } from '../data/audit.ts';
import type { AdminIdentity, AppContext } from '../data/context.ts';
import { listMatches } from '../data/matches.ts';
import { loadRoster } from '../data/players.ts';
import { requireTournament } from '../data/tournament.ts';
import { notFound } from '../errors.ts';
import { serializeMatch } from './serializers.ts';
import { getStandings } from './standings.ts';
import { getOfficialStatistics } from './statistics.ts';

/**
 * Versión del formato de la instantánea.
 *
 * Va dentro del documento para que dentro de dos temporadas se pueda leer una
 * instantánea antigua sabiendo qué forma tiene. Sube cuando cambie la
 * estructura, no cuando cambie el contenido.
 */
export const SNAPSHOT_FORMAT = '1.0' as const;

export interface SeasonSnapshotSummary {
  readonly id: string;
  readonly rulesVersion: string;
  readonly closedAt: string;
  readonly closedBy: string | null;
  readonly reason: string;
  readonly closedWithPending: boolean;
  readonly format: string;
}

export async function createSeasonSnapshot(
  ctx: AppContext,
  tournamentId: string,
  meta: {
    closedBy: AdminIdentity;
    closedAt: Date;
    reason: string;
    report: ClosureReport;
  },
): Promise<{ id: string }> {
  const { tournament, settings, settingsRow } = await requireTournament(
    ctx.db,
    ctx.config.tournamentSlug,
  );

  const [players, matches, standings, statistics, sanctions, audit] = await Promise.all([
    loadRoster(ctx.db, tournamentId),
    listMatches(ctx.db, tournamentId),
    getStandings(ctx),
    getOfficialStatistics(ctx),
    ctx.db.query.sanctions.findMany({ where: eq(schema.sanctions.tournamentId, tournamentId) }),
    // Solo lo que explica la competición. La auditoría entera vive en su tabla;
    // aquí va lo que hace falta para entender cómo se llegó a esta tabla.
    listAudit(ctx.db, tournamentId, { limit: 1000 }),
  ]);

  const confirmedCandidates = await ctx.db
    .select({ total: schema.battleCandidates.id })
    .from(schema.battleCandidates)
    .where(
      and(
        eq(schema.battleCandidates.tournamentId, tournamentId),
        eq(schema.battleCandidates.status, 'CONFIRMED'),
      ),
    );

  const payload = {
    format: SNAPSHOT_FORMAT,

    /* --- Qué temporada es esto ------------------------------------------ */
    season: {
      id: tournament.id,
      slug: tournament.slug,
      name: tournament.name,
      season: tournament.season,
      startedAt: tournament.startedAt?.toISOString() ?? null,
      finishedAt: meta.closedAt.toISOString(),
    },

    /* --- Con qué reglas se calculó todo lo de abajo ----------------------- */
    rules: {
      version: settings.rulesVersion,
      // La configuración efectiva, tal cual estaba al cerrar. Si mañana cambia,
      // esta instantánea sigue explicándose sola.
      settings: {
        rosterSize: settings.rosterSize,
        legs: settings.legs,
        scoring: settings.scoring,
        crowns: settings.crowns,
        sanctions: settings.sanctions,
        disputes: settings.disputes,
        noShow: settings.noShow,
        tiebreakers: settings.tiebreakers,
      },
      settingsUpdatedAt: settingsRow.updatedAt.toISOString(),
    },

    /* --- Quién jugó ------------------------------------------------------ */
    participants: players.map((player) => ({
      id: player.id,
      displayName: player.displayName,
      slug: player.slug,
      status: player.status,
      slot: player.slot,
      // El tag es público: lo declaró el participante al inscribirse. Lo que no
      // va es ninguna nota interna sobre él.
      clashTag: player.clashTag,
      clashLinkStatus: player.clashLinkStatus,
      confirmedAt: player.confirmedAt?.toISOString() ?? null,
      replacedByPlayerId: player.replacedByPlayerId,
    })),

    /* --- El calendario y cómo se generó ---------------------------------- */
    fixture: {
      seed: tournament.fixtureSeed,
      generatedAt: tournament.fixtureGeneratedAt?.toISOString() ?? null,
      rounds: [...new Set(matches.map((row) => row.round.number))].sort((a, b) => a - b).length,
      matches: matches.length,
    },

    /*
      --- Los partidos, ya interpretados por el dominio -------------------

      Se guarda la proyección pública: el resultado con su ganador, su tipo de
      victoria y sus puntos. No las notas internas de los aplazamientos ni los
      motivos de las correcciones, que siguen siendo administrativos.
    */
    matches: matches.map((row) => {
      const view = serializeMatch(row, settings);
      return {
        id: view.id,
        roundNumber: view.roundNumber,
        order: view.order,
        leg: view.leg,
        status: view.status,
        scheduledAt: view.scheduledAt,
        originalScheduledAt: view.originalScheduledAt,
        playedAt: view.playedAt,
        postponementCount: view.postponementCount,
        home: view.home,
        away: view.away,
        result: view.result,
      };
    }),

    /* --- Sanciones ------------------------------------------------------- */
    sanctions: sanctions.map((sanction) => ({
      id: sanction.id,
      playerId: sanction.playerId,
      type: sanction.type,
      points: sanction.points,
      status: sanction.status,
      reason: sanction.reason,
      issuedAt: sanction.issuedAt.toISOString(),
      revokedAt: sanction.revokedAt?.toISOString() ?? null,
    })),

    /* --- El resultado de la competición ---------------------------------- */
    standings: {
      source: 'OFFICIAL' as const,
      rulesVersion: standings.rulesVersion,
      tiebreakers: standings.tiebreakers,
      rows: standings.rows,
    },

    statistics: {
      source: 'OFFICIAL' as const,
      players: statistics,
    },

    /*
      --- Evidencia externa -------------------------------------------------

      Solo el recuento, marcado como observado. Los mazos y las batallas siguen
      en sus tablas: meterlos aquí haría el documento enorme y, sobre todo,
      daría la impresión de que forman parte del resultado oficial.
    */
    externalEvidence: {
      source: 'OBSERVED' as const,
      provider: 'CLASH_ROYALE',
      confirmedCandidates: confirmedCandidates.length,
      note: 'Evidencia observada, no resultado oficial. El resultado lo confirmó un administrador y está en `matches`.',
    },

    /* --- Cómo se cerró --------------------------------------------------- */
    closure: {
      reason: meta.reason,
      closedBy: meta.closedBy.displayName,
      closedAt: meta.closedAt.toISOString(),
      closeable: meta.report.closeable,
      blockers: meta.report.blockers,
      requestId: meta.closedBy.requestId ?? null,
    },

    /* --- El rastro de cómo se llegó aquí --------------------------------- */
    audit: audit.map((entry) => ({
      id: entry.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      actor: entry.actor,
      requestId: entry.requestId,
      createdAt: entry.createdAt.toISOString(),
    })),
  };

  const [created] = await ctx.db
    .insert(schema.seasonSnapshots)
    .values({
      tournamentId,
      rulesVersion: settings.rulesVersion,
      closedAt: meta.closedAt,
      closedByAdminId: meta.closedBy.id,
      closedByName: meta.closedBy.displayName,
      reason: meta.reason,
      closedWithPending: !meta.report.closeable,
      payload,
    })
    .returning({ id: schema.seasonSnapshots.id });

  return { id: created!.id };
}

/** Las instantáneas de esta temporada, de la más reciente a la más antigua. */
export async function listSeasonSnapshots(ctx: AppContext): Promise<SeasonSnapshotSummary[]> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const rows = await ctx.db.query.seasonSnapshots.findMany({
    where: eq(schema.seasonSnapshots.tournamentId, tournament.id),
  });

  return rows
    .map((row) => ({
      id: row.id,
      rulesVersion: row.rulesVersion,
      closedAt: row.closedAt.toISOString(),
      closedBy: row.closedByName,
      reason: row.reason,
      closedWithPending: row.closedWithPending,
      format: SNAPSHOT_FORMAT,
    }))
    .sort((left, right) => right.closedAt.localeCompare(left.closedAt));
}

/** El documento completo de una instantánea. */
export async function getSeasonSnapshot(ctx: AppContext, id: string): Promise<unknown> {
  const { tournament } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const row = await ctx.db.query.seasonSnapshots.findFirst({
    where: and(
      eq(schema.seasonSnapshots.id, id),
      eq(schema.seasonSnapshots.tournamentId, tournament.id),
    ),
  });
  if (row === undefined) throw notFound('No existe esa instantánea.', { snapshot: id });
  return row.payload;
}
