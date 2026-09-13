/**
 * Reporte y confirmacion de resultados.
 *
 * Flujo acordado:
 *
 *   Jugador A reporta 3-1  ─┐
 *                           ├─ coinciden  ──► COMPLETED (resultado validado)
 *   Jugador B reporta 3-1  ─┘
 *
 *   Jugador A reporta 3-1  ─┐
 *                           ├─ discrepan  ──► DISPUTED ──► administrador
 *   Jugador B reporta 2-3  ─┘
 *
 * Convencion importante: **los dos jugadores reportan el marcador en el mismo
 * orden, local-visitante**, no "mis coronas / sus coronas". La interfaz debe
 * dejarlo explicito ("Nimaben 3 - 1 Lyuk"), porque si cada uno reportara desde
 * su punto de vista un 3-1 y un 1-3 serian el mismo resultado y el sistema no
 * podria distinguir acuerdo de discrepancia.
 */

import { DomainError } from '../errors.ts';
import type { PlayerId } from '../roster/participant.ts';
import type { TournamentSettings } from '../tournament/settings.ts';
import { acceptsResult, type MatchStatus } from '../matches/status.ts';
import { validateCrowns, type MatchPairing } from './result.ts';

export interface ResultReport {
  readonly playerId: PlayerId;
  readonly homeCrowns: number;
  readonly awayCrowns: number;
  readonly reportedAt: string;
}

export const RECONCILIATION_STATUSES = ['AWAITING_OPPONENT', 'AGREED', 'CONFLICT'] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export interface Reconciliation {
  readonly status: ReconciliationStatus;
  /** Marcador acordado, solo cuando `status === 'AGREED'`. */
  readonly homeCrowns: number | null;
  readonly awayCrowns: number | null;
  /** Estado al que debe pasar el partido segun este resultado. */
  readonly nextMatchStatus: MatchStatus;
  readonly reports: readonly ResultReport[];
}

/** Comprueba que quien reporta juega el partido y que el partido lo admite. */
export function assertReportAllowed(
  pairing: MatchPairing,
  playerId: PlayerId,
  status: MatchStatus,
): void {
  if (playerId !== pairing.homeId && playerId !== pairing.awayId) {
    throw new DomainError(
      'REPORT_NOT_ALLOWED',
      'Solo los dos jugadores del partido pueden reportar su resultado.',
      { playerId, homeId: pairing.homeId, awayId: pairing.awayId },
    );
  }
  if (!acceptsResult(status)) {
    throw new DomainError(
      'REPORT_NOT_ALLOWED',
      `No se puede reportar el resultado de un partido en estado ${status}.`,
      { status },
    );
  }
}

/**
 * Anade (o sustituye) el reporte de un jugador.
 *
 * Un jugador puede rectificar su propio reporte mientras el partido siga
 * abierto; su reporte anterior se reemplaza, no se acumula.
 */
export function addReport(
  reports: readonly ResultReport[],
  report: ResultReport,
  pairing: MatchPairing,
  status: MatchStatus,
  settings: TournamentSettings,
): ResultReport[] {
  assertReportAllowed(pairing, report.playerId, status);
  validateCrowns(report.homeCrowns, report.awayCrowns, settings);
  if (Number.isNaN(Date.parse(report.reportedAt))) {
    throw new DomainError('INVALID_DATE', `reportedAt no es una fecha valida.`, {
      reportedAt: report.reportedAt,
    });
  }
  return [...reports.filter((existing) => existing.playerId !== report.playerId), report];
}

/** Decide si los reportes concuerdan y a que estado lleva el partido. */
export function reconcileReports(
  pairing: MatchPairing,
  reports: readonly ResultReport[],
): Reconciliation {
  const home = reports.find((report) => report.playerId === pairing.homeId);
  const away = reports.find((report) => report.playerId === pairing.awayId);

  if (home === undefined || away === undefined) {
    return {
      status: 'AWAITING_OPPONENT',
      homeCrowns: null,
      awayCrowns: null,
      nextMatchStatus: 'SCHEDULED',
      reports,
    };
  }

  const agreed = home.homeCrowns === away.homeCrowns && home.awayCrowns === away.awayCrowns;

  return agreed
    ? {
        status: 'AGREED',
        homeCrowns: home.homeCrowns,
        awayCrowns: home.awayCrowns,
        nextMatchStatus: 'COMPLETED',
        reports,
      }
    : {
        status: 'CONFLICT',
        homeCrowns: null,
        awayCrowns: null,
        nextMatchStatus: 'DISPUTED',
        reports,
      };
}

/**
 * Ventana de impugnacion.
 *
 * Pasado el plazo (24 h por defecto) el resultado se considera cerrado: solo
 * cabe una correccion administrativa extraordinaria, que queda auditada.
 */
export function isDisputeWindowOpen(
  completedAt: string,
  now: string,
  settings: TournamentSettings,
): boolean {
  const completed = Date.parse(completedAt);
  const current = Date.parse(now);
  if (Number.isNaN(completed) || Number.isNaN(current)) {
    throw new DomainError(
      'INVALID_DATE',
      'Fechas invalidas al comprobar el plazo de impugnacion.',
      {
        completedAt,
        now,
      },
    );
  }
  const elapsedHours = (current - completed) / 3_600_000;
  return elapsedHours <= settings.disputes.windowHours;
}

export function assertDisputeWindowOpen(
  completedAt: string,
  now: string,
  settings: TournamentSettings,
): void {
  if (!isDisputeWindowOpen(completedAt, now, settings)) {
    throw new DomainError(
      'DISPUTE_WINDOW_CLOSED',
      `El plazo de ${settings.disputes.windowHours} h para impugnar este resultado ya vencio. Solo cabe una correccion administrativa.`,
      { completedAt, now, windowHours: settings.disputes.windowHours },
    );
  }
}
