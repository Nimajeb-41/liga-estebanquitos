/**
 * Etiquetas en espanol.
 *
 * El codigo esta en ingles (played, wins, crownDiff...) y la interfaz usa las
 * abreviaturas acordadas para la liga (PJ, VG, VP, DC, PTS). Esta tabla es el
 * unico punto donde se traducen: la logica nunca depende del texto visible.
 */

import type { MatchStatus } from '../matches/status.ts';
import type { PostponementReason } from '../matches/postponement.ts';
import type { MatchOutcome, VictoryType } from '../results/result.ts';
import type { ReconciliationStatus } from '../results/reporting.ts';
import type { ParticipantStatus } from '../roster/participant.ts';
import type { TournamentStatus } from '../tournament/status.ts';

export interface ColumnLabel {
  readonly short: string;
  readonly long: string;
}

export const STANDINGS_COLUMNS = {
  position: { short: 'POS', long: 'Posicion' },
  player: { short: 'JUGADOR', long: 'Jugador' },
  played: { short: 'PJ', long: 'Partidos jugados' },
  wins: { short: 'VG', long: 'Victorias' },
  losses: { short: 'VP', long: 'Derrotas' },
  draws: { short: 'VE', long: 'Empates' },
  maxCrownWins: { short: 'V3C', long: 'Victorias por 3 coronas' },
  crownsFor: { short: 'CF', long: 'Coronas a favor' },
  crownsAgainst: { short: 'CC', long: 'Coronas en contra' },
  crownDiff: { short: 'DC', long: 'Diferencia de coronas' },
  sanctionPoints: { short: 'SAN', long: 'Puntos por sancion' },
  points: { short: 'PTS', long: 'Puntos' },
} as const satisfies Record<string, ColumnLabel>;

/** Columnas minimas exigidas por el reglamento, en orden. */
export const REQUIRED_STANDINGS_COLUMNS = [
  'position',
  'player',
  'played',
  'wins',
  'losses',
  'crownDiff',
  'points',
] as const;

export const TOURNAMENT_STATUS_LABELS: Readonly<Record<TournamentStatus, string>> = {
  DRAFT: 'Borrador',
  REGISTRATION: 'Inscripciones abiertas',
  READY: 'Plantilla cerrada',
  SCHEDULED: 'Calendario publicado',
  LIVE: 'En juego',
  FINISHED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

export const PARTICIPANT_STATUS_LABELS: Readonly<Record<ParticipantStatus, string>> = {
  REGISTERED: 'Inscrito',
  CONFIRMED: 'Confirmado',
  WITHDRAWN: 'Retirado',
  REPLACED: 'Sustituido',
};

export const MATCH_STATUS_LABELS: Readonly<Record<MatchStatus, string>> = {
  SCHEDULED: 'Programado',
  LIVE: 'En directo',
  COMPLETED: 'Finalizado',
  POSTPONED: 'Aplazado',
  CANCELLED: 'Cancelado',
  DISPUTED: 'En disputa',
};

export const MATCH_OUTCOME_LABELS: Readonly<Record<MatchOutcome, string>> = {
  HOME_WIN: 'Gana el local',
  AWAY_WIN: 'Gana el visitante',
  DRAW: 'Empate',
};

export const VICTORY_TYPE_LABELS: Readonly<Record<VictoryType, string>> = {
  NORMAL: 'Victoria normal',
  MAX_CROWNS: 'Victoria por 3 coronas',
  WALKOVER: 'Victoria por incomparecencia',
  ADMIN_DECISION: 'Resultado por decision administrativa',
  NONE: 'Sin ganador',
};

export const POSTPONEMENT_REASON_LABELS: Readonly<Record<PostponementReason, string>> = {
  PERSONAL: 'Problema personal',
  TECHNICAL: 'Problema tecnico',
  CONNECTION: 'Problema de conexion',
  SCHEDULE: 'Inconveniente de horario',
  UNAVAILABLE: 'Indisponibilidad justificada',
  ADMIN_DECISION: 'Decision administrativa',
  OTHER: 'Otro motivo',
};

export const RECONCILIATION_LABELS: Readonly<Record<ReconciliationStatus, string>> = {
  AWAITING_OPPONENT: 'Esperando al rival',
  AGREED: 'Resultado validado',
  CONFLICT: 'Resultados contradictorios',
};

/** Texto que se muestra en una plaza todavia sin confirmar. */
export const EMPTY_SLOT_LABEL = 'TBD / POR CONFIRMAR';

/** Aviso visible en un partido aplazado. */
export const POSTPONED_BADGE = 'POSPUESTO';
