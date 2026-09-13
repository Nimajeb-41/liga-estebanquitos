/**
 * Configuracion del torneo.
 *
 * Todo lo que el administrador puede cambiar sin tocar codigo vive aqui:
 * puntuacion, coronas, sanciones, tamano de la plantilla y orden de desempate.
 * Los valores por defecto son los acordados para la Liga Estabanquitos 2026-1.
 */

import { DomainError } from '../errors.ts';
import { isTiebreakerId, type TiebreakerId } from '../standings/tiebreakers.ts';

export interface ScoringRules {
  /** Victoria normal. */
  readonly win: number;
  /**
   * Victoria consiguiendo el maximo de coronas. Interpretacion oficial: cuenta
   * cualquier victoria en la que el ganador llegue a 3 coronas, sea 3-0, 3-1
   * o 3-2.
   */
  readonly winWithMaxCrowns: number;
  /** Derrota. */
  readonly loss: number;
  /**
   * Empate. `null` = el reglamento NO admite empates (decidido el 2026-09-08):
   * un marcador con coronas iguales se rechaza y el partido debe resolverse
   * con un ganador.
   */
  readonly draw: number | null;
  /**
   * Puntos del ganador por incomparecencia.
   *
   * Decidido el 10 de septiembre de 2026 (regla P-01): **3 puntos**, los de una
   * victoria normal. No son 4: una victoria por tres coronas hay que
   * conseguirla jugando.
   *
   * `null` sigue significando «sin definir»: si una temporada futura vuelve a
   * dejarlo abierto, registrar un walkover falla con PENDING_RULE en lugar de
   * inventar una puntuacion.
   */
  readonly walkoverWin: number | null;
  /**
   * Coronas que se reparten en una incomparecencia.
   *
   * Decidido (P-01): **ninguna**, `[0, 0]`. No hubo batalla, asi que no hay
   * coronas; y sobre todo, un marcador inventado contaminaria la diferencia de
   * coronas, que es el primer criterio de desempate despues de los puntos.
   */
  readonly walkoverCrowns: readonly [winner: number, loser: number] | null;
}

export interface CrownRules {
  /** Maximo de coronas que puede conseguir un jugador en un partido. */
  readonly maxPerMatch: number;
}

export interface SanctionRules {
  /** Penalizacion por defecto (negativa). */
  readonly defaultPoints: number;
  /** Cota inferior de seguridad para una sancion individual. */
  readonly minPoints: number;
}

export interface DisputeRules {
  /**
   * Horas que tiene un jugador para impugnar un resultado ya cerrado.
   * Vencido el plazo solo cabe correccion administrativa, siempre auditada.
   */
  readonly windowHours: number;
}

export interface NoShowRules {
  /** Minutos de tolerancia antes de considerar una incomparecencia. */
  readonly toleranceMinutes: number;
  /**
   * Siempre `false`: pasado el plazo el partido **no** se convierte en derrota
   * por si solo.
   *
   * P-01 ya define cuanto vale una incomparecencia, pero eso no la hace
   * automatica: alguien tiene que dar fe de que el jugador no aparecio. Un
   * temporizador no distingue «no se presento» de «la plataforma tenia mal la
   * hora», y la diferencia decide una jornada.
   */
  readonly automatic: false;
}

export interface TournamentSettings {
  /** Numero exacto de participantes confirmados requerido para cerrar la plantilla. */
  readonly rosterSize: number;
  /** Vueltas: 2 = ida y vuelta. */
  readonly legs: number;
  readonly scoring: ScoringRules;
  readonly crowns: CrownRules;
  readonly sanctions: SanctionRules;
  readonly disputes: DisputeRules;
  readonly noShow: NoShowRules;
  /** Orden de aplicacion de los criterios de desempate. */
  readonly tiebreakers: readonly TiebreakerId[];
  /** Version del reglamento con el que se calculo la tabla. */
  readonly rulesVersion: string;
}

export const DEFAULT_SETTINGS: TournamentSettings = {
  rosterSize: 10,
  legs: 2,
  scoring: {
    win: 3,
    winWithMaxCrowns: 4,
    loss: 0,
    draw: null,
    // P-01, decidida el 10 de septiembre de 2026: la victoria por
    // incomparecencia vale lo mismo que una victoria normal, y no reparte
    // coronas. Ver docs/walkover.md.
    walkoverWin: 3,
    walkoverCrowns: [0, 0],
  },
  crowns: {
    maxPerMatch: 3,
  },
  sanctions: {
    defaultPoints: -2,
    minPoints: -20,
  },
  disputes: {
    windowHours: 24,
  },
  noShow: {
    toleranceMinutes: 15,
    automatic: false,
  },
  tiebreakers: ['POINTS', 'CROWN_DIFF', 'WINS', 'HEAD_TO_HEAD', 'MAX_CROWN_WINS'],
  // 2026-1.2: cierre de P-01 (incomparecencias). Ver docs/tournament-rules.md.
  rulesVersion: '2026-1.2',
};

export interface FormatSummary {
  readonly players: number;
  readonly legs: number;
  readonly rounds: number;
  readonly matchesPerRound: number;
  readonly totalMatches: number;
  readonly matchesPerPlayer: number;
}

/** Deriva la forma de la competicion a partir del cupo y las vueltas. */
export function describeFormat(settings: TournamentSettings): FormatSummary {
  const players = settings.rosterSize;
  const roundsPerLeg = players - 1;
  const matchesPerRound = players / 2;
  return {
    players,
    legs: settings.legs,
    rounds: roundsPerLeg * settings.legs,
    matchesPerRound,
    totalMatches: roundsPerLeg * settings.legs * matchesPerRound,
    matchesPerPlayer: roundsPerLeg * settings.legs,
  };
}

export function validateSettings(settings: TournamentSettings): void {
  const problems: string[] = [];

  if (!Number.isInteger(settings.rosterSize) || settings.rosterSize < 4) {
    problems.push('rosterSize debe ser un entero >= 4.');
  }
  if (settings.rosterSize % 2 !== 0) {
    problems.push('rosterSize debe ser par: el generador de fixture no usa descansos.');
  }
  if (!Number.isInteger(settings.legs) || settings.legs < 1 || settings.legs > 2) {
    problems.push('legs debe ser 1 (solo ida) o 2 (ida y vuelta).');
  }
  if (!Number.isInteger(settings.crowns.maxPerMatch) || settings.crowns.maxPerMatch < 1) {
    problems.push('crowns.maxPerMatch debe ser un entero >= 1.');
  }
  if (settings.sanctions.defaultPoints > 0) {
    problems.push('sanctions.defaultPoints debe ser <= 0.');
  }
  if (settings.sanctions.minPoints > settings.sanctions.defaultPoints) {
    problems.push('sanctions.minPoints debe ser menor o igual que defaultPoints.');
  }
  if (settings.disputes.windowHours < 0) {
    problems.push('disputes.windowHours no puede ser negativo.');
  }
  if (settings.noShow.toleranceMinutes < 0) {
    problems.push('noShow.toleranceMinutes no puede ser negativo.');
  }
  if (settings.tiebreakers.length === 0) {
    problems.push('Debe haber al menos un criterio de desempate.');
  }
  const seen = new Set<string>();
  for (const id of settings.tiebreakers) {
    if (!isTiebreakerId(id)) problems.push(`Criterio de desempate desconocido: ${id}.`);
    if (seen.has(id)) problems.push(`Criterio de desempate duplicado: ${id}.`);
    seen.add(id);
  }

  if (problems.length > 0) {
    throw new DomainError('INVALID_SETTINGS', `Configuracion invalida: ${problems.join(' ')}`, {
      problems,
    });
  }
}
