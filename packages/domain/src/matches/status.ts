/**
 * Maquina de estados de un partido.
 *
 * Se separa del estado del torneo porque responde a otra pregunta: no "en que
 * punto esta la competicion", sino "en que punto esta este partido concreto".
 *
 * SCHEDULED ──► LIVE ──► COMPLETED
 *     │          │           │
 *     │          │           └──► DISPUTED ──► COMPLETED
 *     │          │
 *     └──────────┴──► POSTPONED ──► SCHEDULED
 *
 * Un partido aplazado NUNCA cambia de jornada: vuelve a SCHEDULED con nueva
 * fecha, conservando la jornada a la que pertenece. Ver postponement.ts.
 */

import { DomainError } from '../errors.ts';

export const MATCH_STATUSES = [
  'SCHEDULED',
  'LIVE',
  'COMPLETED',
  'POSTPONED',
  'CANCELLED',
  'DISPUTED',
] as const;

export type MatchStatus = (typeof MATCH_STATUSES)[number];

const TRANSITIONS: Readonly<Record<MatchStatus, readonly MatchStatus[]>> = {
  SCHEDULED: ['LIVE', 'COMPLETED', 'POSTPONED', 'DISPUTED', 'CANCELLED'],
  LIVE: ['COMPLETED', 'POSTPONED', 'DISPUTED', 'CANCELLED'],
  // Un resultado cerrado solo se reabre por impugnacion o correccion
  // administrativa; ambas dejan rastro.
  COMPLETED: ['DISPUTED'],
  POSTPONED: ['SCHEDULED', 'CANCELLED'],
  DISPUTED: ['COMPLETED', 'POSTPONED', 'CANCELLED'],
  CANCELLED: [],
};

export function allowedMatchTransitions(from: MatchStatus): readonly MatchStatus[] {
  return TRANSITIONS[from];
}

export function canTransitionMatch(from: MatchStatus, to: MatchStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertMatchTransition(from: MatchStatus, to: MatchStatus): void {
  if (!canTransitionMatch(from, to)) {
    throw new DomainError(
      'INVALID_MATCH_TRANSITION',
      `Un partido no puede pasar de ${from} a ${to}.`,
      { from, to, allowed: TRANSITIONS[from] },
    );
  }
}

/**
 * Solo los partidos COMPLETED entran en la clasificacion.
 *
 * Consecuencias buscadas:
 * - Un partido POSTPONED no suma PJ, ni puntos, ni coronas.
 * - Un partido DISPUTED deja de contar hasta que el administrador lo resuelva:
 *   es preferible una tabla con un partido menos que una tabla con un
 *   resultado que las dos partes no reconocen.
 */
export function countsForStandings(status: MatchStatus): boolean {
  return status === 'COMPLETED';
}

/** Un resultado solo puede registrarse sobre un partido en juego o programado. */
export function acceptsResult(status: MatchStatus): boolean {
  return status === 'SCHEDULED' || status === 'LIVE' || status === 'DISPUTED';
}
