/**
 * Puntuacion.
 *
 * Los puntos NUNCA se almacenan como dato editable: son una funcion pura del
 * resultado y de la configuracion vigente. Cambiar el reglamento y recalcular
 * la tabla no exige tocar ningun registro.
 */

import { pendingRule } from '../errors.ts';
import type { MatchResult } from '../results/result.ts';
import type { TournamentSettings } from '../tournament/settings.ts';

export interface MatchPoints {
  readonly home: number;
  readonly away: number;
}

export function pointsForResult(result: MatchResult, settings: TournamentSettings): MatchPoints {
  const { scoring } = settings;

  if (result.outcome === 'DRAW') {
    if (scoring.draw === null) {
      throw pendingRule('puntuacion de los empates', 'docs/pending-rules.md');
    }
    return { home: scoring.draw, away: scoring.draw };
  }

  let winnerPoints: number;
  if (result.resolution === 'WALKOVER') {
    if (scoring.walkoverWin === null) {
      throw pendingRule('victoria por incomparecencia (walkover)', 'docs/pending-rules.md');
    }
    winnerPoints = scoring.walkoverWin;
  } else {
    winnerPoints = result.victoryType === 'MAX_CROWNS' ? scoring.winWithMaxCrowns : scoring.win;
  }

  return result.outcome === 'HOME_WIN'
    ? { home: winnerPoints, away: scoring.loss }
    : { home: scoring.loss, away: winnerPoints };
}
