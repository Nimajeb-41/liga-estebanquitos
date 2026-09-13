/**
 * Estadisticas oficiales.
 *
 * Lo que se prueba aqui no es la aritmetica —eso es facil— sino las decisiones
 * que hacen que un numero mienta: contar un aplazado como derrota, presentar un
 * cero donde no hay datos, o mezclar la racha en curso con la mejor de la
 * temporada.
 */

import { describe, expect, it } from 'vitest';

import {
  computePlayerStatistics,
  DEFAULT_SETTINGS,
  leadersBy,
  resolveResult,
  type MatchStatus,
  type PlayedMatch,
  type Sanction,
  type TournamentSettings,
} from '../src/index.ts';

const SETTINGS: TournamentSettings = DEFAULT_SETTINGS;

const A = 'player-a';
const B = 'player-b';
const C = 'player-c';

let counter = 0;

/** Un partido con su resultado ya derivado por el dominio. */
function match(
  homeId: string,
  awayId: string,
  homeCrowns: number,
  awayCrowns: number,
  options: { round?: number; status?: MatchStatus } = {},
): PlayedMatch {
  counter += 1;
  return {
    id: `match-${String(counter).padStart(3, '0')}`,
    roundNumber: options.round ?? counter,
    leg: 1,
    homeId,
    awayId,
    status: options.status ?? 'COMPLETED',
    result: resolveResult({ homeId, awayId }, { homeCrowns, awayCrowns }, SETTINGS),
  };
}

const statsFor = (matches: PlayedMatch[], sanctions: Sanction[] = [], players = [A, B, C]) =>
  computePlayerStatistics({ playerIds: players, matches, sanctions, settings: SETTINGS });

const of = <T extends { playerId: string }>(rows: readonly T[], playerId: string): T =>
  rows.find((row) => row.playerId === playerId)!;

describe('computePlayerStatistics', () => {
  it('marca las estadisticas como oficiales', () => {
    const rows = statsFor([match(A, B, 3, 1)]);
    expect(of(rows, A).source).toBe('OFFICIAL');
  });

  it('cuenta victorias, derrotas y coronas de los dos lados', () => {
    const rows = statsFor([match(A, B, 3, 1)]);

    expect(of(rows, A)).toMatchObject({
      played: 1,
      wins: 1,
      losses: 0,
      crownsFor: 3,
      crownsAgainst: 1,
      crownDiff: 2,
    });
    expect(of(rows, B)).toMatchObject({
      played: 1,
      wins: 0,
      losses: 1,
      crownsFor: 1,
      crownsAgainst: 3,
      crownDiff: -2,
    });
  });

  it('reparte los puntos segun el reglamento, no por su cuenta', () => {
    // 3-1 es victoria con el maximo de coronas: 4 puntos (R-02).
    const conMaximo = statsFor([match(A, B, 3, 1)]);
    expect(of(conMaximo, A).points).toBe(SETTINGS.scoring.winWithMaxCrowns);

    const normal = statsFor([match(A, B, 2, 1)]);
    expect(of(normal, A).points).toBe(SETTINGS.scoring.win);
  });

  it('NO cuenta un aplazado como jugado ni como derrota', () => {
    // R-04. Es el error mas facil de cometer y el mas dañino.
    const rows = statsFor([match(A, B, 3, 1, { status: 'POSTPONED' })]);

    expect(of(rows, A).played).toBe(0);
    expect(of(rows, B).played).toBe(0);
    expect(of(rows, B).losses).toBe(0);
    expect(of(rows, A).points).toBe(0);
  });

  it('NO cuenta un partido en disputa: no es definitivo', () => {
    const rows = statsFor([match(A, B, 3, 1, { status: 'DISPUTED' })]);
    expect(of(rows, A).played).toBe(0);
  });

  it('tampoco cuenta lo cancelado, lo programado ni lo que esta en juego', () => {
    for (const status of ['CANCELLED', 'SCHEDULED', 'LIVE'] as const) {
      const rows = statsFor([match(A, B, 3, 1, { status })]);
      expect(of(rows, A).played).toBe(0);
    }
  });

  describe('cero y «sin datos» no son lo mismo', () => {
    it('quien no ha jugado tiene winRate null, no 0', () => {
      const rows = statsFor([]);

      expect(of(rows, A).played).toBe(0);
      expect(of(rows, A).winRate).toBeNull();
      expect(of(rows, A).averageCrownsFor).toBeNull();
      expect(of(rows, A).averageCrownsAgainst).toBeNull();
    });

    it('quien jugo y perdio siempre tiene winRate 0, que si es un dato', () => {
      const rows = statsFor([match(A, B, 0, 3)]);
      expect(of(rows, A).winRate).toBe(0);
    });

    it('sin victorias no hay porcentaje de victorias por 3 coronas', () => {
      const rows = statsFor([match(A, B, 0, 3)]);
      expect(of(rows, A).maxCrownWins).toBe(0);
      expect(of(rows, A).maxCrownWinRate).toBeNull();
    });
  });

  it('calcula el porcentaje de victorias sobre los partidos jugados', () => {
    const rows = statsFor([match(A, B, 3, 1), match(A, C, 1, 3), match(A, B, 2, 0)]);
    // 2 de 3.
    expect(of(rows, A).winRate).toBeCloseTo(0.6667, 3);
  });

  it('calcula la proporcion de victorias por 3 coronas sobre las victorias', () => {
    const rows = statsFor([match(A, B, 3, 0), match(A, C, 2, 1)]);
    // Dos victorias, una de ellas con el maximo.
    expect(of(rows, A).maxCrownWins).toBe(1);
    expect(of(rows, A).maxCrownWinRate).toBe(0.5);
  });

  it('promedia coronas a favor y en contra', () => {
    const rows = statsFor([match(A, B, 3, 1), match(A, C, 1, 2)]);
    expect(of(rows, A).averageCrownsFor).toBe(2);
    expect(of(rows, A).averageCrownsAgainst).toBe(1.5);
  });
  describe('incomparecencias', () => {
    /** Un partido que nadie jugo: falto `absent`. */
    function walkover(homeId: string, awayId: string, absent: string): PlayedMatch {
      counter += 1;
      return {
        id: `wo-${String(counter).padStart(3, '0')}`,
        roundNumber: counter,
        leg: 1,
        homeId,
        awayId,
        status: 'COMPLETED',
        result: resolveResult(
          { homeId, awayId },
          { homeCrowns: 0, awayCrowns: 0, resolution: 'WALKOVER', absentPlayerId: absent },
          SETTINGS,
        ),
      };
    }

    it('cuenta a favor la del rival y en contra la propia', () => {
      const rows = statsFor([walkover(A, B, B), walkover(A, C, A)]);

      expect(of(rows, A).walkoversFor).toBe(1);
      expect(of(rows, A).walkoversAgainst).toBe(1);
      expect(of(rows, B).walkoversAgainst).toBe(1);
      expect(of(rows, C).walkoversFor).toBe(1);
    });

    it('sigue siendo un partido jugado, con su victoria y sus puntos', () => {
      const rows = statsFor([walkover(A, B, B)]);

      expect(of(rows, A).played).toBe(1);
      expect(of(rows, A).wins).toBe(1);
      expect(of(rows, A).points).toBe(SETTINGS.scoring.walkoverWin);
      expect(of(rows, B).losses).toBe(1);
    });

    it('no entra en la media de coronas: no hubo batalla que promediar', () => {
      /*
      Con la incomparecencia dentro, la media de A seria 1.5 en vez de 3, y
      estaria diciendo que hace menos coronas por no haber jugado un partido
      al que si se presento.
    */
      const rows = statsFor([match(A, B, 3, 1), walkover(A, C, C)]);

      expect(of(rows, A).averageCrownsFor).toBe(3);
      expect(of(rows, A).averageCrownsAgainst).toBe(1);
      // El total si las incluye: son coronas reales de la temporada.
      expect(of(rows, A).crownsFor).toBe(3);
    });

    it('solo incomparecencias deja las medias en null, no en cero', () => {
      // Cero significaria «se midio y salio cero»; aqui no se midio nada.
      const rows = statsFor([walkover(A, B, B)]);

      expect(of(rows, A).averageCrownsFor).toBeNull();
      expect(of(rows, A).averageCrownsAgainst).toBeNull();
    });

    it('una victoria por incomparecencia no cuenta como victoria por 3 coronas', () => {
      const rows = statsFor([walkover(A, B, B)]);

      expect(of(rows, A).maxCrownWins).toBe(0);
    });

    it('quien nunca falto ni se beneficio tiene cero, no null', () => {
      // Aqui el cero si es un dato: se conto y salio cero.
      const rows = statsFor([match(A, B, 3, 1)]);

      expect(of(rows, A).walkoversFor).toBe(0);
      expect(of(rows, A).walkoversAgainst).toBe(0);
    });
  });

  describe('rachas', () => {
    it('distingue la racha en curso de la mejor de la temporada', () => {
      // Gana tres, luego pierde dos. La mejor sigue siendo de tres.
      const rows = statsFor([
        match(A, B, 3, 0, { round: 1 }),
        match(A, C, 3, 1, { round: 2 }),
        match(A, B, 2, 1, { round: 3 }),
        match(A, C, 0, 3, { round: 4 }),
        match(A, B, 1, 3, { round: 5 }),
      ]);

      expect(of(rows, A).currentStreak).toEqual({ type: 'L', length: 2 });
      expect(of(rows, A).bestWinStreak).toBe(3);
      expect(of(rows, A).worstLossStreak).toBe(2);
    });

    it('sin partidos no hay racha en curso', () => {
      const rows = statsFor([]);
      expect(of(rows, A).currentStreak).toBeNull();
      expect(of(rows, A).bestWinStreak).toBe(0);
      expect(of(rows, A).worstLossStreak).toBe(0);
    });

    it('el orden es el de las jornadas, no el de llegada', () => {
      // Se entregan al reves a proposito.
      const rows = statsFor([match(A, B, 0, 3, { round: 9 }), match(A, C, 3, 0, { round: 1 })]);
      // Gano primero y perdio despues: la racha en curso es de derrota.
      expect(of(rows, A).currentStreak).toEqual({ type: 'L', length: 1 });
    });
  });

  describe('local y visitante', () => {
    it('separa el rendimiento en cada condicion', () => {
      const rows = statsFor([match(A, B, 3, 0), match(C, A, 1, 3)]);
      const stats = of(rows, A);

      expect(stats.home).toMatchObject({ played: 1, wins: 1, crownsFor: 3 });
      expect(stats.away).toMatchObject({ played: 1, wins: 1, crownsFor: 3 });
      expect(stats.home.played + stats.away.played).toBe(stats.played);
    });

    it('sin partidos en una condicion, su porcentaje es null', () => {
      const rows = statsFor([match(A, B, 3, 0)]);
      expect(of(rows, A).away.played).toBe(0);
      expect(of(rows, A).away.winRate).toBeNull();
    });

    it('las coronas de cada condicion suman el total', () => {
      const rows = statsFor([match(A, B, 3, 1), match(C, A, 2, 1)]);
      const stats = of(rows, A);
      expect(stats.home.crownsFor + stats.away.crownsFor).toBe(stats.crownsFor);
      expect(stats.home.crownsAgainst + stats.away.crownsAgainst).toBe(stats.crownsAgainst);
    });
  });

  it('descuenta las sanciones activas y no las anuladas', () => {
    const base: Omit<Sanction, 'status' | 'points' | 'id'> = {
      playerId: A,
      matchId: null,
      type: 'BM',
      reason: 'prueba',
      evidenceUrl: null,
      notes: null,
      issuedByAdminId: 'admin',
      issuedAt: '2026-10-01T00:00:00.000Z',
      revokedAt: null,
      revokedByAdminId: null,
      revokedReason: null,
    } as never;

    const rows = statsFor(
      [match(A, B, 3, 1)],
      [
        { ...base, id: 's1', points: -2, status: 'ACTIVE' } as Sanction,
        { ...base, id: 's2', points: -2, status: 'REVOKED' } as Sanction,
      ],
    );

    expect(of(rows, A).sanctionPoints).toBe(-2);
    expect(of(rows, A).points).toBe(of(rows, A).matchPoints - 2);
  });

  it('coincide con la clasificacion: son la misma fuente', () => {
    const matches = [match(A, B, 3, 1), match(B, C, 2, 0), match(C, A, 1, 3)];
    const rows = statsFor(matches);

    // La suma de coronas a favor de todos es la de coronas en contra de todos.
    const totalFor = rows.reduce((sum, row) => sum + row.crownsFor, 0);
    const totalAgainst = rows.reduce((sum, row) => sum + row.crownsAgainst, 0);
    expect(totalFor).toBe(totalAgainst);
  });
});

describe('leadersBy', () => {
  const rows = [
    { playerId: A, value: 5 as number | null },
    { playerId: B, value: 5 as number | null },
    { playerId: C, value: 2 as number | null },
  ];

  it('devuelve a TODOS los empatados en el primer puesto', () => {
    // Elegir uno seria inventarse un desempate.
    expect(leadersBy(rows, (row) => row.value)).toEqual({ value: 5, playerIds: [A, B] });
  });

  it('sabe buscar el minimo cuando la metrica es mejor cuanto menor', () => {
    expect(leadersBy(rows, (row) => row.value, 'LOWEST')).toEqual({ value: 2, playerIds: [C] });
  });

  it('quien no tiene dato no lidera nada', () => {
    const conNulos = [
      { playerId: A, value: null as number | null },
      { playerId: B, value: 1 as number | null },
    ];
    expect(leadersBy(conNulos, (row) => row.value)).toEqual({ value: 1, playerIds: [B] });
  });

  it('sin ningun dato no hay lider', () => {
    const vacio = [{ playerId: A, value: null as number | null }];
    expect(leadersBy(vacio, (row) => row.value)).toBeNull();
  });
});
