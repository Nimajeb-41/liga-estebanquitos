/**
 * Sanciones.
 *
 * No hay ningun detector automatico: una sancion siempre la registra un
 * administrador. El catalogo de conductas sancionables (que es exactamente BM)
 * esta PENDIENTE DE DEFINICION; ver docs/pending-rules.md. Por eso el tipo es
 * una lista abierta y el motor solo garantiza que la penalizacion sea coherente.
 */

import { DomainError } from '../errors.ts';
import type { PlayerId } from '../roster/participant.ts';
import type { TournamentSettings } from '../tournament/settings.ts';

export const SANCTION_TYPES = ['BM', 'NO_SHOW', 'RULE_BREACH', 'OTHER'] as const;
export type SanctionType = (typeof SANCTION_TYPES)[number];

export const SANCTION_STATUSES = ['ACTIVE', 'REVOKED'] as const;
export type SanctionStatus = (typeof SANCTION_STATUSES)[number];

export interface Sanction {
  readonly id: string;
  readonly playerId: PlayerId;
  /** Partido en el que ocurrio, si aplica. */
  readonly matchId: string | null;
  /** Jornada a la que se imputa, si aplica. */
  readonly roundNumber: number | null;
  readonly type: SanctionType;
  /** Penalizacion en puntos. Siempre <= 0. */
  readonly points: number;
  readonly reason: string;
  readonly evidenceUrl: string | null;
  readonly notes: string | null;
  /** Administrador que la registro. Obligatorio: toda sancion tiene autor. */
  readonly issuedByAdminId: string;
  readonly issuedAt: string;
  readonly status: SanctionStatus;
  readonly revokedByAdminId: string | null;
  readonly revokedAt: string | null;
  readonly revokedReason: string | null;
}

export interface NewSanctionInput {
  readonly id: string;
  readonly playerId: PlayerId;
  readonly type: SanctionType;
  readonly reason: string;
  readonly issuedByAdminId: string;
  readonly issuedAt: string;
  /** Si se omite se aplica `settings.sanctions.defaultPoints` (-2). */
  readonly points?: number;
  readonly matchId?: string | null;
  readonly roundNumber?: number | null;
  readonly evidenceUrl?: string | null;
  readonly notes?: string | null;
}

export function createSanction(input: NewSanctionInput, settings: TournamentSettings): Sanction {
  const points = input.points ?? settings.sanctions.defaultPoints;

  if (!Number.isInteger(points)) {
    throw new DomainError('INVALID_SETTINGS', 'La penalizacion debe ser un numero entero.', {
      points,
    });
  }
  if (points > 0) {
    throw new DomainError(
      'INVALID_SETTINGS',
      `Una sancion no puede sumar puntos (se recibio ${points}).`,
      { points },
    );
  }
  if (points < settings.sanctions.minPoints) {
    throw new DomainError(
      'INVALID_SETTINGS',
      `La penalizacion ${points} supera el limite configurado (${settings.sanctions.minPoints}).`,
      { points, minPoints: settings.sanctions.minPoints },
    );
  }
  if (input.reason.trim().length === 0) {
    throw new DomainError('INVALID_SETTINGS', 'Toda sancion necesita un motivo.');
  }
  if (input.issuedByAdminId.trim().length === 0) {
    throw new DomainError(
      'INVALID_SETTINGS',
      'Toda sancion necesita un administrador responsable.',
    );
  }

  return {
    id: input.id,
    playerId: input.playerId,
    matchId: input.matchId ?? null,
    roundNumber: input.roundNumber ?? null,
    type: input.type,
    points,
    reason: input.reason.trim(),
    evidenceUrl: input.evidenceUrl ?? null,
    notes: input.notes ?? null,
    issuedByAdminId: input.issuedByAdminId,
    issuedAt: input.issuedAt,
    status: 'ACTIVE',
    revokedByAdminId: null,
    revokedAt: null,
    revokedReason: null,
  };
}

/** Anula una sancion sin borrarla: la tabla se recalcula, el rastro se conserva. */
export function revokeSanction(
  sanction: Sanction,
  revokedByAdminId: string,
  revokedAt: string,
  reason: string,
): Sanction {
  if (sanction.status === 'REVOKED') return sanction;
  return {
    ...sanction,
    status: 'REVOKED',
    revokedByAdminId,
    revokedAt,
    revokedReason: reason,
  };
}

export function isActiveSanction(sanction: Sanction): boolean {
  return sanction.status === 'ACTIVE';
}

/** Suma de las sanciones activas de un jugador (valor <= 0). */
export function sanctionTotalFor(
  sanctions: readonly Sanction[],
  playerId: PlayerId,
  upToRound?: number,
): number {
  return sanctions
    .filter(
      (sanction) =>
        sanction.playerId === playerId &&
        isActiveSanction(sanction) &&
        (upToRound === undefined ||
          sanction.roundNumber === null ||
          sanction.roundNumber <= upToRound),
    )
    .reduce((total, sanction) => total + sanction.points, 0);
}
