/**
 * Acceso al torneo y a su reglamento.
 *
 * Aqui vive el puente entre la fila de `tournament_settings` y el
 * `TournamentSettings` del dominio: es el unico sitio donde se traduce, para
 * que el motor nunca dependa de la forma de la base de datos.
 */

import { schema } from '@liga/database';
import type { LigaDb } from '@liga/database/client';
import {
  isTiebreakerId,
  validateSettings,
  type TiebreakerId,
  type TournamentSettings,
  type TournamentStatus,
} from '@liga/domain';
import { eq } from 'drizzle-orm';

import { notFound } from '../errors.ts';

export type TournamentRow = typeof schema.tournaments.$inferSelect;
export type SettingsRow = typeof schema.tournamentSettings.$inferSelect;

export interface TournamentContext {
  readonly tournament: TournamentRow;
  readonly settingsRow: SettingsRow;
  readonly settings: TournamentSettings;
}

export function toDomainSettings(tournament: TournamentRow, row: SettingsRow): TournamentSettings {
  const tiebreakers = row.tiebreakers.filter((id): id is TiebreakerId => isTiebreakerId(id));

  const settings: TournamentSettings = {
    rosterSize: tournament.rosterSize,
    legs: tournament.legs,
    scoring: {
      win: row.pointsWin,
      winWithMaxCrowns: row.pointsWinMaxCrowns,
      loss: row.pointsLoss,
      draw: row.pointsDraw,
      walkoverWin: row.pointsWalkoverWin,
      // Las dos columnas o ninguna: media decision no es una decision.
      walkoverCrowns:
        row.walkoverCrownsWinner === null || row.walkoverCrownsLoser === null
          ? null
          : [row.walkoverCrownsWinner, row.walkoverCrownsLoser],
    },
    crowns: { maxPerMatch: row.maxCrownsPerMatch },
    sanctions: {
      defaultPoints: row.sanctionDefaultPoints,
      minPoints: row.sanctionMinPoints,
    },
    disputes: { windowHours: row.disputeWindowHours },
    noShow: { toleranceMinutes: row.noShowToleranceMinutes, automatic: false },
    tiebreakers,
    rulesVersion: row.rulesVersion,
  };

  // Si alguien deja la configuracion en un estado imposible, es mejor fallar al
  // leerla que calcular una tabla con reglas invalidas.
  validateSettings(settings);
  return settings;
}

export async function findTournamentBySlug(
  db: LigaDb,
  slug: string,
): Promise<TournamentContext | null> {
  const tournament = await db.query.tournaments.findFirst({
    where: eq(schema.tournaments.slug, slug),
  });
  if (tournament === undefined) return null;

  const settingsRow = await db.query.tournamentSettings.findFirst({
    where: eq(schema.tournamentSettings.tournamentId, tournament.id),
  });
  if (settingsRow === undefined) {
    throw notFound(`El torneo ${slug} no tiene reglamento configurado.`, { slug });
  }

  return {
    tournament,
    settingsRow,
    settings: toDomainSettings(tournament, settingsRow),
  };
}

export async function requireTournament(db: LigaDb, slug: string): Promise<TournamentContext> {
  const context = await findTournamentBySlug(db, slug);
  if (context === null) {
    throw notFound(`No existe el torneo "${slug}".`, { slug });
  }
  return context;
}

export async function updateTournamentStatus(
  db: LigaDb,
  tournamentId: string,
  status: TournamentStatus,
  extra: Partial<Pick<TournamentRow, 'startedAt' | 'finishedAt'>> = {},
): Promise<void> {
  await db
    .update(schema.tournaments)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(eq(schema.tournaments.id, tournamentId));
}
