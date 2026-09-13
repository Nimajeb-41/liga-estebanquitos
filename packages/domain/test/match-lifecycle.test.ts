import { describe, expect, it } from 'vitest';

import {
  acceptsResult,
  assertMatchTransition,
  canTransitionMatch,
  countsForStandings,
  MATCH_STATUSES,
  type MatchStatus,
} from '../src/matches/status.ts';
import {
  describeSchedule,
  postponeMatch,
  rescheduleMatch,
  type MatchSchedule,
} from '../src/matches/postponement.ts';
import { resolveResult } from '../src/results/result.ts';
import { buildStandings, type PlayedMatch } from '../src/standings/standings.ts';
import { DEFAULT_SETTINGS } from '../src/tournament/settings.ts';
import { expectDomainError } from './helpers.ts';

const settings = DEFAULT_SETTINGS;

const scheduled: MatchSchedule = {
  roundNumber: 7,
  status: 'SCHEDULED',
  scheduledAt: '2026-10-01T22:00:00.000Z',
  originalScheduledAt: '2026-10-01T22:00:00.000Z',
  postponementCount: 0,
};

describe('maquina de estados del partido', () => {
  it('recorre el camino normal', () => {
    expect(canTransitionMatch('SCHEDULED', 'LIVE')).toBe(true);
    expect(canTransitionMatch('LIVE', 'COMPLETED')).toBe(true);
  });

  it('permite registrar el resultado sin pasar por LIVE', () => {
    expect(canTransitionMatch('SCHEDULED', 'COMPLETED')).toBe(true);
  });

  it('permite aplazar desde programado y desde en directo', () => {
    expect(canTransitionMatch('SCHEDULED', 'POSTPONED')).toBe(true);
    expect(canTransitionMatch('LIVE', 'POSTPONED')).toBe(true);
  });

  it('devuelve un aplazado al calendario, nunca directamente a jugado', () => {
    expect(canTransitionMatch('POSTPONED', 'SCHEDULED')).toBe(true);
    expect(canTransitionMatch('POSTPONED', 'COMPLETED')).toBe(false);
    expect(canTransitionMatch('POSTPONED', 'LIVE')).toBe(false);
  });

  it('solo reabre un resultado cerrado por impugnacion', () => {
    expect(canTransitionMatch('COMPLETED', 'DISPUTED')).toBe(true);
    expect(canTransitionMatch('COMPLETED', 'SCHEDULED')).toBe(false);
    expect(canTransitionMatch('COMPLETED', 'POSTPONED')).toBe(false);
  });

  it('deja que el administrador resuelva una disputa', () => {
    expect(canTransitionMatch('DISPUTED', 'COMPLETED')).toBe(true);
  });

  it('trata CANCELLED como terminal', () => {
    for (const status of MATCH_STATUSES) {
      expect(canTransitionMatch('CANCELLED', status)).toBe(false);
    }
  });

  it('lanza INVALID_MATCH_TRANSITION en una transicion prohibida', () => {
    expectDomainError(
      () => assertMatchTransition('POSTPONED', 'COMPLETED'),
      'INVALID_MATCH_TRANSITION',
    );
  });

  it('solo cuenta para la clasificacion lo que esta COMPLETED', () => {
    const counting = MATCH_STATUSES.filter((status: MatchStatus) => countsForStandings(status));
    expect(counting).toEqual(['COMPLETED']);
  });

  it('solo admite resultado en partidos abiertos', () => {
    expect(acceptsResult('SCHEDULED')).toBe(true);
    expect(acceptsResult('LIVE')).toBe(true);
    expect(acceptsResult('DISPUTED')).toBe(true);
    expect(acceptsResult('POSTPONED')).toBe(false);
    expect(acceptsResult('CANCELLED')).toBe(false);
  });
});

describe('aplazamiento', () => {
  const postponed = postponeMatch(scheduled, {
    reason: 'CONNECTION',
    notes: 'Corte de internet en casa de Lyuk confirmado por captura',
    adminId: 'admin-1',
    occurredAt: '2026-10-01T21:40:00.000Z',
  });

  it('pasa el partido a POSTPONED', () => {
    expect(postponed.schedule.status).toBe('POSTPONED');
  });

  it('conserva la jornada original', () => {
    expect(postponed.schedule.roundNumber).toBe(7);
    expect(postponed.entry.roundNumber).toBe(7);
  });

  it('conserva la fecha originalmente programada', () => {
    expect(postponed.schedule.originalScheduledAt).toBe('2026-10-01T22:00:00.000Z');
    expect(postponed.entry.previousScheduledAt).toBe('2026-10-01T22:00:00.000Z');
  });

  it('registra motivo, administrador y momento', () => {
    expect(postponed.entry.event).toBe('POSTPONED');
    expect(postponed.entry.reason).toBe('CONNECTION');
    expect(postponed.entry.adminId).toBe('admin-1');
    expect(postponed.entry.notes).toContain('Corte de internet');
    expect(postponed.entry.occurredAt).toBe('2026-10-01T21:40:00.000Z');
  });

  it('cuenta cuantas veces se aplazo', () => {
    expect(postponed.schedule.postponementCount).toBe(1);
    expect(describeSchedule(postponed.schedule)).toBe('Jornada 7 (aplazado una vez)');
  });

  it('admite proponer ya una nueva fecha', () => {
    const withProposal = postponeMatch(scheduled, {
      reason: 'SCHEDULE',
      notes: 'Se acuerda jugarlo el sabado',
      adminId: 'admin-1',
      occurredAt: '2026-10-01T21:40:00.000Z',
      proposedAt: '2026-10-04T22:00:00.000Z',
    });
    expect(withProposal.schedule.scheduledAt).toBe('2026-10-04T22:00:00.000Z');
    expect(withProposal.entry.newScheduledAt).toBe('2026-10-04T22:00:00.000Z');
  });

  it('exige motivo escrito', () => {
    expectDomainError(
      () =>
        postponeMatch(scheduled, {
          reason: 'OTHER',
          notes: '   ',
          adminId: 'admin-1',
          occurredAt: '2026-10-01T21:40:00.000Z',
        }),
      'POSTPONEMENT_REASON_REQUIRED',
    );
  });

  it('rechaza fechas invalidas', () => {
    expectDomainError(
      () =>
        postponeMatch(scheduled, {
          reason: 'OTHER',
          notes: 'motivo',
          adminId: 'admin-1',
          occurredAt: 'ayer por la tarde',
        }),
      'INVALID_DATE',
    );
  });

  it('no aplaza un partido ya jugado', () => {
    expectDomainError(
      () =>
        postponeMatch(
          { ...scheduled, status: 'COMPLETED' },
          {
            reason: 'OTHER',
            notes: 'motivo',
            adminId: 'admin-1',
            occurredAt: '2026-10-01T21:40:00.000Z',
          },
        ),
      'INVALID_MATCH_TRANSITION',
    );
  });
});

describe('reprogramacion', () => {
  const postponed = postponeMatch(scheduled, {
    reason: 'PERSONAL',
    notes: 'Imprevisto familiar de Dullys',
    adminId: 'admin-1',
    occurredAt: '2026-10-01T21:40:00.000Z',
  });

  const rescheduled = rescheduleMatch(postponed.schedule, {
    newScheduledAt: '2026-10-15T22:00:00.000Z',
    notes: 'Nueva fecha acordada por ambos jugadores',
    adminId: 'admin-1',
    occurredAt: '2026-10-02T10:00:00.000Z',
  });

  it('devuelve el partido a SCHEDULED con la nueva fecha', () => {
    expect(rescheduled.schedule.status).toBe('SCHEDULED');
    expect(rescheduled.schedule.scheduledAt).toBe('2026-10-15T22:00:00.000Z');
  });

  it('sigue perteneciendo a la jornada original', () => {
    expect(rescheduled.schedule.roundNumber).toBe(7);
    expect(rescheduled.schedule.originalScheduledAt).toBe('2026-10-01T22:00:00.000Z');
  });

  it('deja entrada de historial con las dos fechas', () => {
    expect(rescheduled.entry.event).toBe('RESCHEDULED');
    expect(rescheduled.entry.previousScheduledAt).toBeNull();
    expect(rescheduled.entry.newScheduledAt).toBe('2026-10-15T22:00:00.000Z');
  });

  it('no reprograma un partido que no esta aplazado', () => {
    expectDomainError(
      () =>
        rescheduleMatch(scheduled, {
          newScheduledAt: '2026-10-15T22:00:00.000Z',
          notes: 'motivo',
          adminId: 'admin-1',
          occurredAt: '2026-10-02T10:00:00.000Z',
        }),
      'MATCH_NOT_POSTPONED',
    );
  });

  it('permite aplazar dos veces y lo refleja', () => {
    const again = postponeMatch(rescheduled.schedule, {
      reason: 'TECHNICAL',
      notes: 'Actualizacion del juego el dia acordado',
      adminId: 'admin-1',
      occurredAt: '2026-10-15T21:00:00.000Z',
    });
    expect(again.schedule.postponementCount).toBe(2);
    expect(describeSchedule(again.schedule)).toBe('Jornada 7 (aplazado 2 veces)');
    expect(again.schedule.originalScheduledAt).toBe('2026-10-01T22:00:00.000Z');
  });
});

describe('un partido aplazado no altera la clasificacion', () => {
  const pairing = { homeId: 'nimaben', awayId: 'lyuk' } as const;

  function build(status: PlayedMatch['status']): PlayedMatch[] {
    return [
      {
        id: 'm1',
        roundNumber: 7,
        leg: 1,
        homeId: pairing.homeId,
        awayId: pairing.awayId,
        status,
        result: resolveResult(pairing, { homeCrowns: 3, awayCrowns: 0 }, settings),
      },
    ];
  }

  it('no suma puntos, ni coronas, ni partidos jugados', () => {
    const table = buildStandings({
      playerIds: ['nimaben', 'lyuk'],
      matches: build('POSTPONED'),
      sanctions: [],
      settings,
    });
    for (const row of table) {
      expect(row.played).toBe(0);
      expect(row.points).toBe(0);
      expect(row.crownsFor).toBe(0);
      expect(row.crownsAgainst).toBe(0);
      expect(row.crownDiff).toBe(0);
    }
  });

  it('tampoco cuenta mientras el resultado esta en disputa', () => {
    const table = buildStandings({
      playerIds: ['nimaben', 'lyuk'],
      matches: build('DISPUTED'),
      sanctions: [],
      settings,
    });
    expect(table.every((row) => row.played === 0)).toBe(true);
  });

  it('cuenta en cuanto se completa', () => {
    const table = buildStandings({
      playerIds: ['nimaben', 'lyuk'],
      matches: build('COMPLETED'),
      sanctions: [],
      settings,
    });
    const winner = table.find((row) => row.playerId === 'nimaben');
    expect(winner?.played).toBe(1);
    expect(winner?.points).toBe(4);
    expect(winner?.crownDiff).toBe(3);
  });
});
