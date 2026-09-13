import { describe, expect, it } from 'vitest';

import { resolveResult, validateCrowns, type MatchResult } from '../src/results/result.ts';
import { pointsForResult } from '../src/scoring/points.ts';
import { DEFAULT_SETTINGS, type TournamentSettings } from '../src/tournament/settings.ts';
import { expectDomainError } from './helpers.ts';

const settings = DEFAULT_SETTINGS;
const pairing = { homeId: 'nimaben', awayId: 'lyuk' } as const;

function result(homeCrowns: number, awayCrowns: number, custom = settings): MatchResult {
  return resolveResult(pairing, { homeCrowns, awayCrowns }, custom);
}

describe('validacion del marcador', () => {
  it.each([
    [3, 0],
    [3, 1],
    [3, 2],
    [2, 1],
    [2, 0],
    [1, 0],
    [0, 3],
    [1, 3],
    [2, 3],
    [1, 2],
  ])('acepta el marcador %i-%i', (home, away) => {
    expect(() => validateCrowns(home, away, settings)).not.toThrow();
  });

  it('rechaza que ambos lleguen a 3 coronas', () => {
    expectDomainError(() => validateCrowns(3, 3, settings), 'INVALID_CROWNS');
  });

  it('rechaza coronas fuera de rango', () => {
    expectDomainError(() => validateCrowns(4, 0, settings), 'INVALID_CROWNS');
    expectDomainError(() => validateCrowns(-1, 2, settings), 'INVALID_CROWNS');
  });

  it('rechaza coronas no enteras', () => {
    expectDomainError(() => validateCrowns(1.5, 0, settings), 'INVALID_CROWNS');
  });

  it('rechaza el empate mientras el reglamento no lo defina', () => {
    expectDomainError(() => validateCrowns(1, 1, settings), 'DRAW_NOT_ALLOWED');
    expectDomainError(() => validateCrowns(0, 0, settings), 'DRAW_NOT_ALLOWED');
  });

  it('acepta el empate si el administrador lo configura', () => {
    const withDraws: TournamentSettings = {
      ...settings,
      scoring: { ...settings.scoring, draw: 1 },
    };
    expect(() => validateCrowns(2, 2, withDraws)).not.toThrow();
    expect(result(2, 2, withDraws).outcome).toBe('DRAW');
  });

  it('rechaza un partido de un jugador contra si mismo', () => {
    expectDomainError(
      () => resolveResult({ homeId: 'a', awayId: 'a' }, { homeCrowns: 3, awayCrowns: 0 }, settings),
      'SELF_MATCH',
    );
  });
});

describe('derivacion del resultado', () => {
  it('deduce ganador y perdedor del marcador', () => {
    const win = result(3, 1);
    expect(win.outcome).toBe('HOME_WIN');
    expect(win.winnerId).toBe('nimaben');
    expect(win.loserId).toBe('lyuk');

    const loss = result(1, 2);
    expect(loss.outcome).toBe('AWAY_WIN');
    expect(loss.winnerId).toBe('lyuk');
  });

  it('marca como MAX_CROWNS solo las victorias de 3 coronas', () => {
    expect(result(3, 0).victoryType).toBe('MAX_CROWNS');
    expect(result(3, 2).victoryType).toBe('MAX_CROWNS');
    expect(result(2, 1).victoryType).toBe('NORMAL');
    expect(result(1, 0).victoryType).toBe('NORMAL');
    expect(result(0, 3).victoryType).toBe('MAX_CROWNS');
  });

  /* ---------------------------------------------------------------------- */
  /* Incomparecencia (P-01, decidida el 10 de septiembre de 2026)             */
  /* ---------------------------------------------------------------------- */

  /**
   * Un walkover no es un marcador.
   *
   * Lo que se fija aquí no es la aritmética —tres puntos son tres puntos— sino
   * las tres formas en que esto se haría mal: inventar un 3-0, contarlo como
   * victoria por tres coronas, y deducir el ganador de un marcador que no
   * existe.
   */
  it('necesita saber quien no se presento: el marcador no lo dice', () => {
    expectDomainError(
      () =>
        resolveResult(pairing, { homeCrowns: 0, awayCrowns: 0, resolution: 'WALKOVER' }, settings),
      'ABSENT_PLAYER_REQUIRED',
    );
  });

  it('el ausente tiene que ser uno de los dos', () => {
    expectDomainError(
      () =>
        resolveResult(
          pairing,
          { homeCrowns: 0, awayCrowns: 0, resolution: 'WALKOVER', absentPlayerId: 'un-tercero' },
          settings,
        ),
      'ABSENT_PLAYER_NOT_IN_MATCH',
    );
  });

  it('no admite marcador: o hubo batalla o no la hubo', () => {
    expectDomainError(
      () =>
        resolveResult(
          pairing,
          { homeCrowns: 3, awayCrowns: 0, resolution: 'WALKOVER', absentPlayerId: 'lyuk' },
          settings,
        ),
      'WALKOVER_HAS_NO_SCORE',
    );
  });

  it('gana quien se presento, sin coronas para nadie', () => {
    const walkover = resolveResult(
      pairing,
      { homeCrowns: 0, awayCrowns: 0, resolution: 'WALKOVER', absentPlayerId: 'lyuk' },
      settings,
    );

    expect(walkover.winnerId).toBe('nimaben');
    expect(walkover.loserId).toBe('lyuk');
    expect(walkover.outcome).toBe('HOME_WIN');
    // Cero coronas: un marcador inventado contaminaria la diferencia de
    // coronas, que es el primer desempate despues de los puntos.
    expect(walkover.homeCrowns).toBe(0);
    expect(walkover.awayCrowns).toBe(0);
  });

  it('funciona igual cuando el ausente es el local', () => {
    const walkover = resolveResult(
      pairing,
      { homeCrowns: 0, awayCrowns: 0, resolution: 'WALKOVER', absentPlayerId: 'nimaben' },
      settings,
    );

    expect(walkover.winnerId).toBe('lyuk');
    expect(walkover.outcome).toBe('AWAY_WIN');
    expect(walkover.homeCrowns).toBe(0);
    expect(walkover.awayCrowns).toBe(0);
  });

  it('reparte 3 puntos, no 4: una victoria de 3 coronas hay que jugarla', () => {
    const walkover = resolveResult(
      pairing,
      { homeCrowns: 0, awayCrowns: 0, resolution: 'WALKOVER', absentPlayerId: 'lyuk' },
      settings,
    );

    expect(pointsForResult(walkover, settings)).toEqual({ home: 3, away: 0 });
    expect(walkover.victoryType).toBe('WALKOVER');
    // Y por tanto no cuenta como victoria maxima en ningun recuento.
    expect(walkover.victoryType).not.toBe('MAX_CROWNS');
  });

  it('sigue siendo distinguible de una victoria jugada', () => {
    const walkover = resolveResult(
      pairing,
      { homeCrowns: 0, awayCrowns: 0, resolution: 'WALKOVER', absentPlayerId: 'lyuk' },
      settings,
    );
    const jugada = result(3, 0);

    expect(walkover.resolution).toBe('WALKOVER');
    expect(jugada.resolution).toBe('PLAYED');
    expect(walkover.victoryType).not.toBe(jugada.victoryType);
  });

  it('un partido jugado no admite jugador ausente', () => {
    expectDomainError(
      () =>
        resolveResult(pairing, { homeCrowns: 3, awayCrowns: 0, absentPlayerId: 'lyuk' }, settings),
      'ABSENT_PLAYER_NOT_APPLICABLE',
    );
  });

  it('vuelve a fallar con PENDING_RULE si una temporada lo deja sin definir', () => {
    // La regla esta decidida para esta temporada, no grabada en el codigo: si
    // otra liga la deja abierta, el motor tiene que negarse igual que antes.
    const sinDecidir: TournamentSettings = {
      ...settings,
      scoring: { ...settings.scoring, walkoverWin: null, walkoverCrowns: null },
    };

    expectDomainError(
      () =>
        resolveResult(
          pairing,
          { homeCrowns: 0, awayCrowns: 0, resolution: 'WALKOVER', absentPlayerId: 'lyuk' },
          sinDecidir,
        ),
      'PENDING_RULE',
    );
  });
});

describe('sistema de puntuacion', () => {
  it('da 3 puntos por victoria normal', () => {
    expect(pointsForResult(result(2, 1), settings)).toEqual({ home: 3, away: 0 });
  });

  it('da 4 puntos por victoria de 3 coronas', () => {
    expect(pointsForResult(result(3, 0), settings)).toEqual({ home: 4, away: 0 });
    expect(pointsForResult(result(3, 2), settings)).toEqual({ home: 4, away: 0 });
  });

  it('da 0 puntos por derrota', () => {
    expect(pointsForResult(result(0, 3), settings)).toEqual({ home: 0, away: 4 });
    expect(pointsForResult(result(1, 2), settings)).toEqual({ home: 0, away: 3 });
  });

  it('se recalcula solo al cambiar el reglamento', () => {
    const custom: TournamentSettings = {
      ...settings,
      scoring: { ...settings.scoring, win: 2, winWithMaxCrowns: 5 },
    };
    expect(pointsForResult(result(3, 1, custom), custom)).toEqual({ home: 5, away: 0 });
    expect(pointsForResult(result(2, 1, custom), custom)).toEqual({ home: 2, away: 0 });
  });

  it('falla de forma explicita si aparece un empate sin regla', () => {
    const withDraws: TournamentSettings = {
      ...settings,
      scoring: { ...settings.scoring, draw: 1 },
    };
    const drawResult = result(2, 2, withDraws);
    expect(pointsForResult(drawResult, withDraws)).toEqual({ home: 1, away: 1 });
    expectDomainError(() => pointsForResult(drawResult, settings), 'PENDING_RULE');
  });
});
