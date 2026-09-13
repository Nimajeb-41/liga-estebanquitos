/**
 * Forma reciente, rachas y movimiento de posicion.
 *
 * Son datos derivados, igual que la clasificacion: se calculan aqui y no en la
 * interfaz. Si el frontend los dedujera por su cuenta habria dos definiciones de
 * "racha" y tarde o temprano dirian cosas distintas.
 */

import { countsForStandings } from '../matches/status.ts';
import type { PlayerId } from '../roster/participant.ts';
import type { PlayedMatch } from './standings.ts';
import type { RankedStandingsRow } from './types.ts';

export const FORM_RESULTS = ['W', 'L', 'D'] as const;
export type FormResult = (typeof FORM_RESULTS)[number];

export interface StreakInfo {
  readonly type: FormResult;
  readonly length: number;
}

export interface PlayerForm {
  readonly playerId: PlayerId;
  /** Ultimos resultados, del mas reciente al mas antiguo. */
  readonly recent: readonly FormResult[];
  /** Racha en curso, o `null` si todavia no jugo nada. */
  readonly currentStreak: StreakInfo | null;
  /** Mejor racha de victorias de toda la temporada. */
  readonly bestWinStreak: number;
}

/** Numero de partidos que se muestran por defecto en el indicador de forma. */
export const DEFAULT_FORM_LENGTH = 5;

function resultFor(match: PlayedMatch, playerId: PlayerId): FormResult {
  if (match.result.outcome === 'DRAW') return 'D';
  return match.result.winnerId === playerId ? 'W' : 'L';
}

/**
 * Forma de cada jugador a partir de los partidos completados.
 *
 * El orden es cronologico por jornada; dentro de una jornada, por id, para que
 * el resultado sea estable y no dependa de como los devuelva la base de datos.
 */
export function computeForm(
  playerIds: readonly PlayerId[],
  matches: readonly PlayedMatch[],
  options: { limit?: number } = {},
): Map<PlayerId, PlayerForm> {
  const limit = options.limit ?? DEFAULT_FORM_LENGTH;
  const played = matches
    .filter((match) => countsForStandings(match.status))
    .slice()
    .sort((a, b) => a.roundNumber - b.roundNumber || a.id.localeCompare(b.id));

  const byPlayer = new Map<PlayerId, FormResult[]>();
  for (const playerId of playerIds) byPlayer.set(playerId, []);

  for (const match of played) {
    for (const playerId of [match.homeId, match.awayId]) {
      const history = byPlayer.get(playerId);
      if (history === undefined) continue;
      history.push(resultFor(match, playerId));
    }
  }

  const forms = new Map<PlayerId, PlayerForm>();
  for (const [playerId, history] of byPlayer) {
    forms.set(playerId, {
      playerId,
      // Del mas reciente al mas antiguo: es como se lee un indicador de forma.
      recent: history.slice(-limit).reverse(),
      currentStreak: currentStreakOf(history),
      bestWinStreak: bestWinStreakOf(history),
    });
  }
  return forms;
}

function currentStreakOf(history: readonly FormResult[]): StreakInfo | null {
  const last = history[history.length - 1];
  if (last === undefined) return null;

  let length = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index] !== last) break;
    length += 1;
  }
  return { type: last, length };
}

function bestWinStreakOf(history: readonly FormResult[]): number {
  let best = 0;
  let current = 0;
  for (const result of history) {
    current = result === 'W' ? current + 1 : 0;
    if (current > best) best = current;
  }
  return best;
}

/**
 * Movimiento de posicion entre dos clasificaciones.
 *
 * Positivo = subio puestos. `null` = no estaba en la tabla anterior, asi que no
 * hay movimiento que mostrar (no es lo mismo que "no se movio").
 */
export function positionChanges(
  previous: readonly RankedStandingsRow[],
  current: readonly RankedStandingsRow[],
): Map<PlayerId, number | null> {
  const before = new Map(previous.map((row) => [row.playerId, row.position]));
  const changes = new Map<PlayerId, number | null>();

  for (const row of current) {
    const previousPosition = before.get(row.playerId);
    changes.set(
      row.playerId,
      previousPosition === undefined ? null : previousPosition - row.position,
    );
  }
  return changes;
}

/** Ultima jornada con al menos un partido completado. */
export function lastPlayedRound(matches: readonly PlayedMatch[]): number | null {
  const rounds = matches
    .filter((match) => countsForStandings(match.status))
    .map((match) => match.roundNumber);
  return rounds.length === 0 ? null : Math.max(...rounds);
}
