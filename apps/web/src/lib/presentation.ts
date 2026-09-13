/**
 * Presentación: etiquetas, formatos y clases visuales.
 *
 * Las etiquetas en español vienen de `@liga/domain/labels`, que es donde ya
 * vivían: la interfaz no inventa su propio vocabulario. Aquí solo se añade lo
 * que es estrictamente visual (colores por estado, formato de fechas).
 */

import type { FormResult, MatchStatus, ParticipantStatus, TournamentStatus } from '@liga/contracts';
import {
  MATCH_STATUS_LABELS,
  PARTICIPANT_STATUS_LABELS,
  POSTPONEMENT_REASON_LABELS,
  TOURNAMENT_STATUS_LABELS,
  VICTORY_TYPE_LABELS,
} from '@liga/domain/labels';

export {
  MATCH_STATUS_LABELS,
  PARTICIPANT_STATUS_LABELS,
  POSTPONEMENT_REASON_LABELS,
  TOURNAMENT_STATUS_LABELS,
  VICTORY_TYPE_LABELS,
};

export function matchStatusLabel(status: MatchStatus): string {
  return MATCH_STATUS_LABELS[status];
}

export function tournamentStatusLabel(status: TournamentStatus): string {
  return TOURNAMENT_STATUS_LABELS[status];
}

export function participantStatusLabel(status: ParticipantStatus): string {
  return PARTICIPANT_STATUS_LABELS[status];
}

/** Color de acento de cada estado de partido. */
export const MATCH_STATUS_TONE: Readonly<Record<MatchStatus, string>> = {
  SCHEDULED: 'text-muted border-line',
  LIVE: 'text-magenta border-magenta/60',
  COMPLETED: 'text-acid border-acid/40',
  POSTPONED: 'text-warning border-warning/50',
  DISPUTED: 'text-danger border-danger/50',
  CANCELLED: 'text-faint border-line line-through',
};

export const PARTICIPANT_STATUS_TONE: Readonly<Record<ParticipantStatus, string>> = {
  REGISTERED: 'text-muted border-line',
  CONFIRMED: 'text-acid border-acid/40',
  WITHDRAWN: 'text-danger border-danger/50',
  REPLACED: 'text-warning border-warning/50',
};

export const FORM_TONE: Readonly<Record<FormResult, string>> = {
  W: 'bg-acid/15 text-acid border-acid/40',
  L: 'bg-danger/15 text-danger border-danger/40',
  D: 'bg-line text-muted border-line-strong',
};

export const FORM_LABEL: Readonly<Record<FormResult, string>> = {
  W: 'Victoria',
  L: 'Derrota',
  D: 'Empate',
};

const DATE_FORMAT = new Intl.DateTimeFormat('es-UY', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('es-UY', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(value: string | null): string {
  if (value === null) return 'Sin fecha';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : DATE_FORMAT.format(date);
}

export function formatDateTime(value: string | null): string {
  if (value === null) return 'Sin fecha';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : DATE_TIME_FORMAT.format(date);
}

/** Diferencia con signo explícito: +3, 0, −2. */
export function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return '0';
}

export function roundLabel(number: number): string {
  return `Jornada ${String(number).padStart(2, '0')}`;
}

export function legLabel(leg: number): string {
  return leg === 1 ? 'Ida' : 'Vuelta';
}

/** Clase del podio. Sin emojis: color y borde. */
export function podiumTone(position: number): string {
  if (position === 1) return 'text-gold border-gold/50';
  if (position === 2) return 'text-silver border-silver/40';
  if (position === 3) return 'text-bronze border-bronze/40';
  return 'text-muted border-line';
}

/**
 * ¿Este partido cuenta ya para la clasificación?
 *
 * La respuesta no se decide aquí: es la misma función del dominio que usa el
 * backend para construir la tabla. Un aplazado, uno en disputa o uno cancelado
 * no cuentan, y la interfaz lo pregunta en vez de suponerlo.
 */
export { countsForStandings } from '@liga/domain/matches';

/** Estados en los que todavía no hay nada que mostrar como marcador. */
export function isPending(status: MatchStatus): boolean {
  return status === 'SCHEDULED' || status === 'POSTPONED' || status === 'CANCELLED';
}

/** Porcentaje entero a partir de una proporción 0..1. */
export function percent(ratio: number): number {
  return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
}

const RELATIVE = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

/**
 * «hace 8 s», «hace 3 min». Se usa en el marcador en directo para que se vea
 * cuándo se refrescó el dato.
 */
export function relativeFromNow(value: Date, now: Date = new Date()): string {
  const seconds = Math.round((value.getTime() - now.getTime()) / 1000);
  const absolute = Math.abs(seconds);
  if (absolute < 60) return RELATIVE.format(seconds, 'second');
  if (absolute < 3600) return RELATIVE.format(Math.round(seconds / 60), 'minute');
  if (absolute < 86400) return RELATIVE.format(Math.round(seconds / 3600), 'hour');
  return RELATIVE.format(Math.round(seconds / 86400), 'day');
}

/** Iniciales del nombre, para el avatar de reserva. Nunca más de dos. */
export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();
  return `${(parts[0] ?? '').charAt(0)}${(parts[1] ?? '').charAt(0)}`.toUpperCase();
}

/**
 * Color estable derivado del nombre.
 *
 * Es decoración: da a cada jugador un acento reconocible sin inventar datos ni
 * necesitar un avatar que todavía no existe.
 */
const AVATAR_TONES = ['cyan', 'magenta', 'purple', 'acid'] as const;

export function avatarTone(name: string): (typeof AVATAR_TONES)[number] {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 9973;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length] ?? 'cyan';
}

/** Etiqueta de una plaza libre. La define el dominio. */
export { EMPTY_SLOT_LABEL } from '@liga/domain/labels';

export const SANCTION_TYPE_LABELS: Readonly<Record<string, string>> = {
  BM: 'Conducta antideportiva',
  NO_SHOW: 'Incomparecencia',
  RULE_BREACH: 'Incumplimiento del reglamento',
  OTHER: 'Otro motivo',
};

export const SANCTION_STATUS_LABELS: Readonly<Record<string, string>> = {
  ACTIVE: 'Vigente',
  REVOKED: 'Anulada',
};

/**
 * Nombre legible de un criterio de desempate.
 *
 * El orden lo decide el reglamento y llega desde la API; aquí solo se traduce
 * la clave.
 */
export const TIEBREAKER_LABELS: Readonly<Record<string, string>> = {
  points: 'Puntos',
  crownDiff: 'Diferencia de coronas',
  wins: 'Victorias',
  headToHead: 'Enfrentamiento directo',
  maxCrownWins: 'Victorias por 3 coronas',
  crownsFor: 'Coronas a favor',
};

export function tiebreakerLabel(key: string): string {
  return TIEBREAKER_LABELS[key] ?? key;
}
