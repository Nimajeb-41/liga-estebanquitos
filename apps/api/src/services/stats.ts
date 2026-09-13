/**
 * Estadísticas de la temporada.
 *
 * Todas salen de la clasificación, que a su vez sale del dominio: aquí no se
 * calcula ninguna métrica nueva, solo se ordenan y se recortan los líderes.
 *
 * Lo que depende de una regla pendiente no se inventa: se declara en
 * `unavailable` con el motivo, y la interfaz lo muestra como no disponible.
 */

import type { StatLeader, Stats } from '@liga/contracts';

import type { AppContext } from '../data/context.ts';
import { requireTournament } from '../data/tournament.ts';
import { getStandings } from './standings.ts';

type Row = Awaited<ReturnType<typeof getStandings>>['rows'][number];

/** Líderes de una métrica, con los empates incluidos. */
function leadersBy(rows: readonly Row[], value: (row: Row) => number): StatLeader[] {
  if (rows.length === 0) return [];
  const best = Math.max(...rows.map(value));
  if (best <= 0) return [];
  return rows
    .filter((row) => value(row) === best)
    .map((row) => ({
      playerId: row.playerId,
      displayName: row.displayName,
      slug: row.slug,
      value: best,
    }));
}

export async function getStats(ctx: AppContext): Promise<Stats> {
  const { settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const standings = await getStandings(ctx);
  const rows = standings.rows;

  const unavailable: Stats['unavailable'] = [];

  if (settings.scoring.walkoverWin === null) {
    unavailable.push({
      metric: 'Victorias por incomparecencia',
      reason:
        'La puntuación de una incomparecencia todavía no está definida, así que no se contabiliza ninguna.',
      rule: 'P-01',
    });
  }
  if (settings.scoring.draw === null) {
    unavailable.push({
      metric: 'Empates',
      reason: 'El reglamento no admite empates: no existe la métrica.',
      rule: 'R-01',
    });
  }

  return {
    mostPoints: leadersBy(rows, (row) => row.points),
    mostWins: leadersBy(rows, (row) => row.wins),
    bestCrownDiff: leadersBy(rows, (row) => row.crownDiff),
    mostCrowns: leadersBy(rows, (row) => row.crownsFor),
    mostMaxCrownWins: leadersBy(rows, (row) => row.maxCrownWins),
    bestWinStreak: leadersBy(rows, (row) => row.bestWinStreak),
    unavailable,
  };
}
