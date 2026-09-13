/**
 * Aplazamientos y reprogramaciones.
 *
 * Regla del torneo: un inconveniente real no es una derrota. El partido pasa a
 * POSTPONED, no puntua, no suma coronas y no cuenta como jugado, y se
 * reprograma mas adelante.
 *
 * Regla de trazabilidad: la fecha original NUNCA se sobrescribe en silencio.
 * Cada aplazamiento y cada reprogramacion generan una entrada de historial con
 * motivo, autor y fechas, y el partido conserva siempre su jornada original.
 */

import { DomainError } from '../errors.ts';
import { assertMatchTransition, type MatchStatus } from './status.ts';

export const POSTPONEMENT_REASONS = [
  'PERSONAL',
  'TECHNICAL',
  'CONNECTION',
  'SCHEDULE',
  'UNAVAILABLE',
  'ADMIN_DECISION',
  'OTHER',
] as const;

export type PostponementReason = (typeof POSTPONEMENT_REASONS)[number];

export const POSTPONEMENT_EVENTS = ['POSTPONED', 'RESCHEDULED'] as const;
export type PostponementEvent = (typeof POSTPONEMENT_EVENTS)[number];

export interface PostponementEntry {
  readonly event: PostponementEvent;
  /** Jornada a la que pertenece el partido. Nunca cambia. */
  readonly roundNumber: number;
  /** Fecha que tenia el partido antes de esta operacion. */
  readonly previousScheduledAt: string | null;
  /** Fecha que pasa a tener. `null` en un aplazamiento sin fecha propuesta. */
  readonly newScheduledAt: string | null;
  readonly reason: PostponementReason;
  readonly notes: string;
  readonly adminId: string;
  readonly occurredAt: string;
}

export interface PostponeInput {
  readonly reason: PostponementReason;
  readonly notes: string;
  readonly adminId: string;
  readonly occurredAt: string;
  /** Fecha propuesta, si ya se conoce. Puede confirmarse despues. */
  readonly proposedAt?: string | null;
}

export interface RescheduleInput {
  readonly newScheduledAt: string;
  readonly notes: string;
  readonly adminId: string;
  readonly occurredAt: string;
  readonly reason?: PostponementReason;
}

export interface MatchSchedule {
  readonly roundNumber: number;
  readonly status: MatchStatus;
  /** Fecha vigente del partido. */
  readonly scheduledAt: string | null;
  /** Primera fecha que tuvo. Se fija una vez y no se toca. */
  readonly originalScheduledAt: string | null;
  readonly postponementCount: number;
}

export interface ScheduleChange {
  readonly schedule: MatchSchedule;
  readonly entry: PostponementEntry;
}

function assertValidDate(value: string, field: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new DomainError('INVALID_DATE', `${field} no es una fecha valida: "${value}".`, {
      field,
      value,
    });
  }
}

function assertNotes(notes: string): string {
  const trimmed = notes.trim();
  if (trimmed.length === 0) {
    throw new DomainError(
      'POSTPONEMENT_REASON_REQUIRED',
      'Todo aplazamiento necesita un motivo escrito: sin motivo no hay rastro que explicar despues.',
    );
  }
  return trimmed;
}

/** Aplaza un partido. No decide nada deportivo: solo lo saca del calendario. */
export function postponeMatch(schedule: MatchSchedule, input: PostponeInput): ScheduleChange {
  assertMatchTransition(schedule.status, 'POSTPONED');
  const notes = assertNotes(input.notes);
  assertValidDate(input.occurredAt, 'occurredAt');

  const proposedAt = input.proposedAt ?? null;
  if (proposedAt !== null) assertValidDate(proposedAt, 'proposedAt');

  return {
    schedule: {
      roundNumber: schedule.roundNumber,
      status: 'POSTPONED',
      // La fecha vigente pasa a ser la propuesta, si la hay; si no, queda sin
      // fecha. La original no se toca jamas.
      scheduledAt: proposedAt,
      originalScheduledAt: schedule.originalScheduledAt ?? schedule.scheduledAt,
      postponementCount: schedule.postponementCount + 1,
    },
    entry: {
      event: 'POSTPONED',
      roundNumber: schedule.roundNumber,
      previousScheduledAt: schedule.scheduledAt,
      newScheduledAt: proposedAt,
      reason: input.reason,
      notes,
      adminId: input.adminId,
      occurredAt: input.occurredAt,
    },
  };
}

/**
 * Confirma la nueva fecha y devuelve el partido al calendario.
 * Sigue perteneciendo a su jornada original.
 */
export function rescheduleMatch(schedule: MatchSchedule, input: RescheduleInput): ScheduleChange {
  if (schedule.status !== 'POSTPONED') {
    throw new DomainError(
      'MATCH_NOT_POSTPONED',
      `Solo se reprograma un partido aplazado; este esta en ${schedule.status}.`,
      { status: schedule.status },
    );
  }
  assertMatchTransition(schedule.status, 'SCHEDULED');
  const notes = assertNotes(input.notes);
  assertValidDate(input.newScheduledAt, 'newScheduledAt');
  assertValidDate(input.occurredAt, 'occurredAt');

  return {
    schedule: {
      roundNumber: schedule.roundNumber,
      status: 'SCHEDULED',
      scheduledAt: input.newScheduledAt,
      originalScheduledAt: schedule.originalScheduledAt,
      postponementCount: schedule.postponementCount,
    },
    entry: {
      event: 'RESCHEDULED',
      roundNumber: schedule.roundNumber,
      previousScheduledAt: schedule.scheduledAt,
      newScheduledAt: input.newScheduledAt,
      reason: input.reason ?? 'ADMIN_DECISION',
      notes,
      adminId: input.adminId,
      occurredAt: input.occurredAt,
    },
  };
}

/** Texto para la interfaz: de donde viene este partido. */
export function describeSchedule(schedule: MatchSchedule): string {
  const base = `Jornada ${schedule.roundNumber}`;
  if (schedule.postponementCount === 0) return base;
  const veces =
    schedule.postponementCount === 1 ? 'una vez' : `${schedule.postponementCount} veces`;
  return `${base} (aplazado ${veces})`;
}
