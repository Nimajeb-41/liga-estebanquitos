/**
 * Deteccion de candidatos.
 *
 * Cruza una batalla observada con el calendario y propone a que partido
 * **podria** corresponder. Codigo puro: no consulta nada, no escribe nada y,
 * sobre todo, no confirma nada.
 *
 * La regla que sostiene todo el diseño:
 *
 *   Un candidato es una sospecha bien argumentada, no un resultado.
 *
 * `confidence` sirve para ordenar la cola de revision y para que el
 * administrador sepa donde mirar primero. **No autoriza nada.** Un 100 y un 40
 * necesitan exactamente la misma confirmacion humana; lo unico que cambia es
 * cuanto va a tardar la persona en decidirse.
 *
 * Por eso cada candidato viaja con sus motivos y sus ambiguedades: si el numero
 * no se puede explicar, el numero no vale.
 */

import type { NormalizedBattle } from './normalizer.ts';

/* -------------------------------------------------------------------------- */
/* Entrada                                                                     */
/* -------------------------------------------------------------------------- */

/** Lo que la deteccion necesita saber de un partido de la liga. */
export interface MatchForMatching {
  readonly id: string;
  readonly roundNumber: number;
  readonly status: 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'POSTPONED' | 'CANCELLED' | 'DISPUTED';
  readonly scheduledAt: Date | null;
  readonly homePlayerId: string;
  readonly awayPlayerId: string;
  readonly hasResult: boolean;
  /** Si ya se confirmo otra batalla externa para este partido. */
  readonly hasConfirmedCandidate: boolean;
}

export interface MatchingOptions {
  /**
   * Cuanto puede separarse la batalla de la hora prevista y seguir siendo
   * creible.
   *
   * **No sale de ninguna medicion**: el spike no midio esto, y no podia. Es un
   * valor de operacion, configurable, que habra que ajustar cuando la liga lleve
   * jornadas jugadas y se vea cuanto se desvian de su horario en la practica.
   */
  readonly timeWindowMinutes: number;
}

export const DEFAULT_MATCHING_OPTIONS: MatchingOptions = { timeWindowMinutes: 180 };

/* -------------------------------------------------------------------------- */
/* Salida                                                                      */
/* -------------------------------------------------------------------------- */

/** Por que se propuso este candidato. Suman confianza. */
export type MatchReason =
  /** Las dos etiquetas estan vinculadas a los dos participantes del partido. */
  | 'BOTH_PLAYERS_LINKED'
  /** `type === "friendly"`, que es como se juega la liga. */
  | 'FRIENDLY_BATTLE'
  /** La batalla cae dentro de la ventana alrededor de la hora prevista. */
  | 'WITHIN_TIME_WINDOW'
  /** El partido esta esperando resultado. */
  | 'MATCH_AWAITING_RESULT';

/** Que no encaja del todo. Restan confianza y se muestran al administrador. */
export type MatchAmbiguity =
  /** No es una amistosa: puede ser una partida cualquiera entre los dos. */
  | 'NOT_A_FRIENDLY_BATTLE'
  /** Se jugo lejos de la hora prevista. */
  | 'OUTSIDE_TIME_WINDOW'
  /** El partido no tiene fecha, asi que no hay nada con lo que comparar. */
  | 'MATCH_HAS_NO_SCHEDULE'
  /** Ya hay resultado registrado: confirmar esto seria corregirlo. */
  | 'MATCH_ALREADY_HAS_RESULT'
  /** Aplazado: no cuenta como jugado mientras lo este. */
  | 'MATCH_POSTPONED'
  /** En disputa: el resultado no es definitivo. */
  | 'MATCH_DISPUTED'
  /** Cancelado. */
  | 'MATCH_CANCELLED'
  /** La misma pareja juega ida y vuelta: la batalla encaja en mas de uno. */
  | 'MULTIPLE_MATCHES_POSSIBLE'
  /** Este partido ya tiene otra batalla confirmada. */
  | 'ANOTHER_BATTLE_ALREADY_CONFIRMED'
  /** Mismas coronas: el reglamento no admite empates (R-01). */
  | 'EQUAL_CROWNS';

export interface CandidateAssessment {
  readonly matchId: string;
  readonly roundNumber: number;
  /** 0..100. Orientativo. Nunca autoriza por si solo. */
  readonly confidence: number;
  readonly reasons: readonly MatchReason[];
  readonly ambiguities: readonly MatchAmbiguity[];
  /** Marcador que se propondria, en el orden local-visitante del partido. */
  readonly proposedScore: { readonly home: number; readonly away: number };
  /**
   * Si el sistema recomienda apartarlo en lugar de dejarlo en la cola normal.
   * Sigue siendo el administrador quien decide.
   */
  readonly needsReview: boolean;
}

/** Por que una batalla no produce ningun candidato. */
export type NoCandidateReason =
  /** Alguna etiqueta no esta vinculada a ningun participante de la liga. */
  | 'PLAYERS_NOT_LINKED'
  /** Las dos etiquetas son del mismo participante. */
  | 'SAME_PLAYER_BOTH_SIDES'
  /** No hay ningun partido entre esos dos en el calendario. */
  | 'NO_MATCH_BETWEEN_PLAYERS';

export type MatchingResult =
  | { readonly ok: true; readonly candidates: readonly CandidateAssessment[] }
  | { readonly ok: false; readonly reason: NoCandidateReason };

/* -------------------------------------------------------------------------- */
/* Puntuacion                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Cuanto suma o resta cada señal.
 *
 * Los numeros son un criterio de ordenacion, no una medida de probabilidad. Se
 * eligieron para que lo evidente quede arriba y lo dudoso abajo, y estan aqui
 * juntos para que se puedan discutir de un vistazo en lugar de andar repartidos
 * por el codigo.
 */
const WEIGHTS: Readonly<Record<MatchReason | MatchAmbiguity, number>> = {
  // El suelo: sin esto no hay candidato en absoluto.
  BOTH_PLAYERS_LINKED: 50,
  FRIENDLY_BATTLE: 25,
  WITHIN_TIME_WINDOW: 20,
  MATCH_AWAITING_RESULT: 5,

  NOT_A_FRIENDLY_BATTLE: -30,
  OUTSIDE_TIME_WINDOW: -20,
  MATCH_HAS_NO_SCHEDULE: -15,
  MATCH_ALREADY_HAS_RESULT: -25,
  MATCH_POSTPONED: -20,
  MATCH_DISPUTED: -20,
  MATCH_CANCELLED: -40,
  MULTIPLE_MATCHES_POSSIBLE: -15,
  ANOTHER_BATTLE_ALREADY_CONFIRMED: -40,
  EQUAL_CROWNS: -25,
};

/** Ambiguedades que aconsejan apartar el candidato en vez de encolarlo. */
const REVIEW_TRIGGERS: readonly MatchAmbiguity[] = [
  'MATCH_ALREADY_HAS_RESULT',
  'MATCH_POSTPONED',
  'MATCH_DISPUTED',
  'MATCH_CANCELLED',
  'ANOTHER_BATTLE_ALREADY_CONFIRMED',
  'EQUAL_CROWNS',
];

function score(reasons: readonly MatchReason[], ambiguities: readonly MatchAmbiguity[]): number {
  const total = [...reasons, ...ambiguities].reduce((sum, key) => sum + WEIGHTS[key], 0);
  return Math.max(0, Math.min(100, total));
}

/* -------------------------------------------------------------------------- */
/* Deteccion                                                                   */
/* -------------------------------------------------------------------------- */

function withinWindow(battleTime: Date, scheduledAt: Date, minutes: number): boolean {
  const diff = Math.abs(battleTime.getTime() - scheduledAt.getTime());
  return diff <= minutes * 60_000;
}

/**
 * Propone a que partidos podria corresponder una batalla.
 *
 * Exige que **las dos** etiquetas esten vinculadas a participantes de la liga.
 * Es deliberado: sin eso no se sabe de quien es la batalla, y adivinarlo por el
 * nombre visible seria justo la clase de atajo que acaba asignando un resultado
 * a quien no jugo.
 *
 * Puede devolver varios candidatos. La misma pareja se enfrenta **dos veces**
 * por temporada, ida y vuelta, y si ninguno de los dos partidos tiene fecha no
 * hay forma honesta de elegir: se proponen los dos, marcados como ambiguos, y
 * decide una persona.
 */
export function detectCandidates(
  battle: NormalizedBattle,
  matches: readonly MatchForMatching[],
  /** Etiqueta de Clash Royale -> identificador del participante en la liga. */
  linkedTags: ReadonlyMap<string, string>,
  options: MatchingOptions = DEFAULT_MATCHING_OPTIONS,
): MatchingResult {
  const [first, second] = battle.sides;
  const firstPlayer = linkedTags.get(first.tag);
  const secondPlayer = linkedTags.get(second.tag);

  if (firstPlayer === undefined || secondPlayer === undefined) {
    return { ok: false, reason: 'PLAYERS_NOT_LINKED' };
  }
  if (firstPlayer === secondPlayer) {
    return { ok: false, reason: 'SAME_PLAYER_BOTH_SIDES' };
  }

  const pair = new Set([firstPlayer, secondPlayer]);
  const between = matches.filter(
    (match) => pair.has(match.homePlayerId) && pair.has(match.awayPlayerId),
  );

  if (between.length === 0) {
    return { ok: false, reason: 'NO_MATCH_BETWEEN_PLAYERS' };
  }

  const candidates = between.map((match) => {
    const reasons: MatchReason[] = ['BOTH_PLAYERS_LINKED'];
    const ambiguities: MatchAmbiguity[] = [];

    if (battle.isFriendly) reasons.push('FRIENDLY_BATTLE');
    else ambiguities.push('NOT_A_FRIENDLY_BATTLE');

    if (match.scheduledAt === null) {
      ambiguities.push('MATCH_HAS_NO_SCHEDULE');
    } else if (withinWindow(battle.battleTime, match.scheduledAt, options.timeWindowMinutes)) {
      reasons.push('WITHIN_TIME_WINDOW');
    } else {
      ambiguities.push('OUTSIDE_TIME_WINDOW');
    }

    if (match.status === 'SCHEDULED' || match.status === 'LIVE') {
      reasons.push('MATCH_AWAITING_RESULT');
    }
    if (match.status === 'POSTPONED') ambiguities.push('MATCH_POSTPONED');
    if (match.status === 'DISPUTED') ambiguities.push('MATCH_DISPUTED');
    if (match.status === 'CANCELLED') ambiguities.push('MATCH_CANCELLED');
    if (match.hasResult) ambiguities.push('MATCH_ALREADY_HAS_RESULT');
    if (match.hasConfirmedCandidate) ambiguities.push('ANOTHER_BATTLE_ALREADY_CONFIRMED');
    if (between.length > 1) ambiguities.push('MULTIPLE_MATCHES_POSSIBLE');

    // El marcador se escribe en el orden del partido, no en el de la API: el
    // historial consultado puede ser el del visitante.
    const homeSide = match.homePlayerId === firstPlayer ? first : second;
    const awaySide = homeSide === first ? second : first;
    if (homeSide.crowns === awaySide.crowns) ambiguities.push('EQUAL_CROWNS');

    return {
      matchId: match.id,
      roundNumber: match.roundNumber,
      confidence: score(reasons, ambiguities),
      reasons,
      ambiguities,
      proposedScore: { home: homeSide.crowns, away: awaySide.crowns },
      needsReview: ambiguities.some((entry) => REVIEW_TRIGGERS.includes(entry)),
    } satisfies CandidateAssessment;
  });

  // El mas creible primero, y a igualdad el de la jornada mas temprana, para
  // que el orden no dependa de como vino la lista.
  return {
    ok: true,
    candidates: [...candidates].sort(
      (left, right) => right.confidence - left.confidence || left.roundNumber - right.roundNumber,
    ),
  };
}
