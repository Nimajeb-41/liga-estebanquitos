/**
 * Datos de prueba para el frontend.
 *
 * Tienen la forma exacta del contrato (`@liga/contracts`), así que si el
 * contrato cambia, estos tests dejan de compilar. Es justo lo que se quiere:
 * enterarse aquí y no en producción.
 */

import type {
  Match,
  MatchDetail,
  MatchResultView,
  MatchStatus,
  Standings,
  StandingsRow,
} from '@liga/contracts';

export function makeResult(overrides: Partial<MatchResultView> = {}): MatchResultView {
  return {
    homeCrowns: 3,
    awayCrowns: 1,
    resolution: 'PLAYED',
    outcome: 'HOME_WIN',
    victoryType: 'MAX_CROWNS',
    winnerId: 'player-home',
    loserId: 'player-away',
    points: { home: 4, away: 0 },
    crownDiff: { home: 2, away: -2 },
    version: 1,
    verifiedAt: '2026-10-08T23:00:00.000Z',
    ...overrides,
  };
}

export function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match-1',
    order: 1,
    roundId: 'round-1',
    roundNumber: 4,
    leg: 1,
    status: 'COMPLETED' as MatchStatus,
    scheduledAt: '2026-10-08T22:00:00.000Z',
    originalScheduledAt: '2026-10-08T22:00:00.000Z',
    postponementCount: 0,
    playedAt: '2026-10-08T22:40:00.000Z',
    stream: { url: null, vodUrl: null, platform: null },
    home: { id: 'player-home', displayName: 'Nimaben', slug: 'nimaben' },
    away: { id: 'player-away', displayName: 'Esteban', slug: 'esteban' },
    result: makeResult(),
    ...overrides,
  };
}

export function makeMatchDetail(overrides: Partial<MatchDetail> = {}): MatchDetail {
  return {
    ...makeMatch(),
    history: { postponements: [], corrections: [], reportCount: 0 },
    ...overrides,
  };
}

export function makeRow(overrides: Partial<StandingsRow> = {}): StandingsRow {
  return {
    playerId: 'player-home',
    displayName: 'Nimaben',
    slug: 'nimaben',
    position: 1,
    unresolvedTie: false,
    played: 3,
    wins: 3,
    losses: 0,
    draws: 0,
    maxCrownWins: 2,
    crownsFor: 8,
    crownsAgainst: 2,
    crownDiff: 6,
    matchPoints: 11,
    sanctionPoints: 0,
    sanctionCount: 0,
    points: 11,
    form: ['W', 'W', 'W'],
    currentStreak: { type: 'W', length: 3 },
    bestWinStreak: 3,
    positionChange: 1,
    ...overrides,
  };
}

export function makeStandings(rows: StandingsRow[]): Standings {
  return {
    rulesVersion: '2026-1.2',
    tiebreakers: ['POINTS', 'CROWN_DIFF', 'WINS', 'HEAD_TO_HEAD', 'MAX_CROWN_WINS'],
    columns: [],
    upToRound: 3,
    rows,
  };
}
