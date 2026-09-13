import { describe, expect, it } from 'vitest';

import {
  addReport,
  assertDisputeWindowOpen,
  isDisputeWindowOpen,
  reconcileReports,
  type ResultReport,
} from '../src/results/reporting.ts';
import { DEFAULT_SETTINGS } from '../src/tournament/settings.ts';
import { expectDomainError } from './helpers.ts';

const settings = DEFAULT_SETTINGS;
const pairing = { homeId: 'nimaben', awayId: 'lyuk' } as const;

function report(playerId: string, homeCrowns: number, awayCrowns: number): ResultReport {
  return { playerId, homeCrowns, awayCrowns, reportedAt: '2026-10-01T23:00:00.000Z' };
}

describe('reporte de resultados', () => {
  it('acepta el reporte de cualquiera de los dos jugadores', () => {
    const reports = addReport([], report('nimaben', 3, 1), pairing, 'LIVE', settings);
    expect(reports).toHaveLength(1);
  });

  it('rechaza a quien no juega el partido', () => {
    expectDomainError(
      () => addReport([], report('dullys', 3, 1), pairing, 'LIVE', settings),
      'REPORT_NOT_ALLOWED',
    );
  });

  it('rechaza reportar sobre un partido aplazado o cancelado', () => {
    expectDomainError(
      () => addReport([], report('nimaben', 3, 1), pairing, 'POSTPONED', settings),
      'REPORT_NOT_ALLOWED',
    );
    expectDomainError(
      () => addReport([], report('nimaben', 3, 1), pairing, 'CANCELLED', settings),
      'REPORT_NOT_ALLOWED',
    );
  });

  it('valida el marcador al reportarlo', () => {
    expectDomainError(
      () => addReport([], report('nimaben', 3, 3), pairing, 'LIVE', settings),
      'INVALID_CROWNS',
    );
    expectDomainError(
      () => addReport([], report('nimaben', 2, 2), pairing, 'LIVE', settings),
      'DRAW_NOT_ALLOWED',
    );
  });

  it('deja que un jugador rectifique su propio reporte sin duplicarlo', () => {
    let reports = addReport([], report('nimaben', 3, 1), pairing, 'LIVE', settings);
    reports = addReport(reports, report('nimaben', 3, 2), pairing, 'LIVE', settings);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.awayCrowns).toBe(2);
  });
});

describe('conciliacion de reportes', () => {
  it('espera al rival cuando solo hay un reporte', () => {
    const result = reconcileReports(pairing, [report('nimaben', 3, 1)]);
    expect(result.status).toBe('AWAITING_OPPONENT');
    expect(result.nextMatchStatus).toBe('SCHEDULED');
    expect(result.homeCrowns).toBeNull();
  });

  it('valida el resultado cuando los dos reportan lo mismo', () => {
    const result = reconcileReports(pairing, [report('nimaben', 3, 1), report('lyuk', 3, 1)]);
    expect(result.status).toBe('AGREED');
    expect(result.nextMatchStatus).toBe('COMPLETED');
    expect(result.homeCrowns).toBe(3);
    expect(result.awayCrowns).toBe(1);
  });

  it('marca DISPUTED cuando los reportes se contradicen', () => {
    const result = reconcileReports(pairing, [report('nimaben', 3, 1), report('lyuk', 2, 3)]);
    expect(result.status).toBe('CONFLICT');
    expect(result.nextMatchStatus).toBe('DISPUTED');
    expect(result.homeCrowns).toBeNull();
  });

  it('no confunde un 3-1 con un 1-3: ambos reportan en orden local-visitante', () => {
    const result = reconcileReports(pairing, [report('nimaben', 3, 1), report('lyuk', 1, 3)]);
    expect(result.status).toBe('CONFLICT');
  });
});

describe('plazo de impugnacion', () => {
  const completedAt = '2026-10-01T23:00:00.000Z';

  it('esta abierto dentro de las 24 horas', () => {
    expect(isDisputeWindowOpen(completedAt, '2026-10-02T20:00:00.000Z', settings)).toBe(true);
  });

  it('se cierra pasadas las 24 horas', () => {
    expect(isDisputeWindowOpen(completedAt, '2026-10-03T00:00:00.000Z', settings)).toBe(false);
    expectDomainError(
      () => assertDisputeWindowOpen(completedAt, '2026-10-03T00:00:00.000Z', settings),
      'DISPUTE_WINDOW_CLOSED',
    );
  });

  it('usa el plazo configurado, no uno fijo', () => {
    const shortWindow = { ...settings, disputes: { windowHours: 2 } };
    // Tres horas despues: fuera de un plazo de 2 h, dentro del de 24 h.
    expect(isDisputeWindowOpen(completedAt, '2026-10-02T02:00:00.000Z', shortWindow)).toBe(false);
    expect(isDisputeWindowOpen(completedAt, '2026-10-02T02:00:00.000Z', settings)).toBe(true);
    expect(isDisputeWindowOpen(completedAt, '2026-10-01T23:30:00.000Z', shortWindow)).toBe(true);
  });

  it('rechaza fechas invalidas', () => {
    expectDomainError(
      () => isDisputeWindowOpen('nunca', '2026-10-02T00:00:00.000Z', settings),
      'INVALID_DATE',
    );
  });
});

describe('regla de incomparecencia', () => {
  it('define 15 minutos de tolerancia y NO la aplica automaticamente', () => {
    expect(settings.noShow.toleranceMinutes).toBe(15);
    expect(settings.noShow.automatic).toBe(false);
  });

  it('vale lo mismo que una victoria normal, no que una de 3 coronas', () => {
    // P-01, decidida el 10 de septiembre de 2026.
    expect(settings.scoring.walkoverWin).toBe(3);
    expect(settings.scoring.walkoverWin).not.toBe(settings.scoring.winWithMaxCrowns);
  });

  it('no reparte coronas: no hubo batalla', () => {
    expect(settings.scoring.walkoverCrowns).toEqual([0, 0]);
  });
});
