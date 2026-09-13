/**
 * Normalizacion de una batalla externa.
 *
 * Convierte lo que devuelve la API en una forma estable que el resto del
 * sistema pueda guardar y comparar. Es codigo puro: no toca la base de datos,
 * no llama a nadie y no decide nada de competicion.
 *
 * Dos responsabilidades, y ninguna mas:
 *
 * 1. **Leer con desconfianza.** Todo campo puede faltar. Si falta algo sin lo
 *    cual la batalla no sirve, se dice cual y se descarta; no se rellena.
 * 2. **Calcular la huella** que sustituye al identificador que la API no da.
 */

import { createHash } from 'node:crypto';

import { normalizeTag } from './client.ts';
import type { ClashBattle, ClashBattleSide, ClashCard } from './types.ts';

/** Valor de `type` que identifica una amistosa. Verificado en el spike. */
export const FRIENDLY_BATTLE_TYPE = 'friendly';

/* -------------------------------------------------------------------------- */
/* Fechas                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `battleTime` llega como `20260910T050249.000Z`: sin guiones ni dos puntos, y
 * por tanto ilegible para `new Date()`. Se le devuelven los separadores.
 */
export function parseBattleTime(value: string | undefined): Date | null {
  if (typeof value !== 'string') return null;
  const iso = value.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6');
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* -------------------------------------------------------------------------- */
/* Huella                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Huella determinista de una batalla.
 *
 * La API **no da ningun identificador**, asi que la identidad se deriva de lo
 * unico que si es estable y coincide en los dos historiales: el instante y los
 * dos participantes.
 *
 * Las coronas quedan fuera a proposito. Si formaran parte de la huella, un
 * mismo enfrentamiento reimportado con un marcador distinto se guardaria como
 * dos batallas en vez de delatar la incoherencia.
 *
 * **Limitacion, dicha sin adornos:** dos batallas distintas entre las mismas
 * dos personas registradas en el mismo segundo producirian la misma huella. No
 * es imposible, solo improbable. Cuando una huella ya existente llega con datos
 * que no cuadran, el sistema **no la sobrescribe**: la marca para revision.
 */
export function battleFingerprint(battleTime: Date, tags: readonly string[]): string {
  const normalized = tags.map(normalizeTag).sort();
  const material = `${battleTime.toISOString()}|${normalized.join('|')}`;
  return createHash('sha256').update(material).digest('hex');
}

/* -------------------------------------------------------------------------- */
/* Forma normalizada                                                           */
/* -------------------------------------------------------------------------- */

export interface NormalizedCard {
  readonly cardId: number;
  readonly name: string;
  readonly level: number | null;
  readonly evolutionLevel: number | null;
  readonly starLevel: number | null;
  readonly rarity: string | null;
  readonly elixirCost: number | null;
  readonly iconUrl: string | null;
}

export interface NormalizedSide {
  readonly tag: string;
  readonly name: string | null;
  readonly crowns: number;
  readonly deck: readonly NormalizedCard[];
  readonly supportCards: readonly NormalizedCard[];
  /** Cuantas torres de princesa seguian en pie. `null` si la API no lo dijo. */
  readonly princessTowersStanding: number | null;
  readonly kingTowerHitPoints: number | null;
  readonly startingTrophies: number | null;
}

export interface NormalizedBattle {
  readonly fingerprint: string;
  readonly battleTime: Date;
  readonly type: string;
  readonly isFriendly: boolean;
  readonly gameModeId: number | null;
  readonly gameModeName: string | null;
  readonly arenaName: string | null;
  readonly deckSelection: string | null;
  readonly isHostedMatch: boolean | null;
  readonly tournamentTag: string | null;
  /** Exactamente dos lados, en el orden en que llegaron: `team`, `opponent`. */
  readonly sides: readonly [NormalizedSide, NormalizedSide];
}

/** Por que una batalla no se pudo normalizar. */
export type NormalizationProblem =
  /** Sin `battleTime` no hay ni fecha ni huella. */
  | 'MISSING_BATTLE_TIME'
  /** No es un uno contra uno: `team` u `opponent` no traen exactamente uno. */
  | 'NOT_ONE_VS_ONE'
  /** Algun lado llego sin etiqueta: sin ella no se puede identificar a nadie. */
  | 'MISSING_TAG'
  /** Algun lado llego sin coronas: no hay marcador que proponer. */
  | 'MISSING_CROWNS';

export type NormalizationResult =
  | { readonly ok: true; readonly battle: NormalizedBattle }
  | { readonly ok: false; readonly problem: NormalizationProblem };

/* -------------------------------------------------------------------------- */
/* Normalizacion                                                               */
/* -------------------------------------------------------------------------- */

function normalizeCards(cards: readonly ClashCard[] | undefined): NormalizedCard[] {
  if (!Array.isArray(cards)) return [];
  return cards
    .filter((card) => typeof card.id === 'number' && typeof card.name === 'string')
    .map((card) => ({
      cardId: card.id as number,
      name: card.name as string,
      level: typeof card.level === 'number' ? card.level : null,
      evolutionLevel: typeof card.evolutionLevel === 'number' ? card.evolutionLevel : null,
      starLevel: typeof card.starLevel === 'number' ? card.starLevel : null,
      rarity: typeof card.rarity === 'string' ? card.rarity : null,
      elixirCost: typeof card.elixirCost === 'number' ? card.elixirCost : null,
      iconUrl: card.iconUrls?.medium ?? null,
    }));
}

/** Un lado utilizable necesita etiqueta y coronas. Lo demas es contexto. */
function normalizeSide(side: ClashBattleSide | undefined): NormalizedSide | NormalizationProblem {
  if (side === undefined) return 'NOT_ONE_VS_ONE';
  if (typeof side.tag !== 'string' || side.tag.length === 0) return 'MISSING_TAG';
  if (typeof side.crowns !== 'number') return 'MISSING_CROWNS';

  return {
    tag: normalizeTag(side.tag),
    name: typeof side.name === 'string' ? side.name : null,
    crowns: side.crowns,
    deck: normalizeCards(side.cards),
    supportCards: normalizeCards(side.supportCards),
    princessTowersStanding: Array.isArray(side.princessTowersHitPoints)
      ? side.princessTowersHitPoints.length
      : null,
    kingTowerHitPoints:
      typeof side.kingTowerHitPoints === 'number' ? side.kingTowerHitPoints : null,
    startingTrophies: typeof side.startingTrophies === 'number' ? side.startingTrophies : null,
  };
}

/**
 * Convierte una batalla cruda en la forma normalizada.
 *
 * Solo se acepta el uno contra uno. La liga se juega asi, y el spike no observo
 * ninguna otra cosa; dar por buena una de dos contra dos significaria decidir
 * cual de los cuatro es «el jugador», que es justo el tipo de suposicion que
 * este proyecto no hace.
 */
export function normalizeBattle(raw: ClashBattle): NormalizationResult {
  const battleTime = parseBattleTime(raw.battleTime);
  if (battleTime === null) return { ok: false, problem: 'MISSING_BATTLE_TIME' };

  const team = raw.team ?? [];
  const opponent = raw.opponent ?? [];
  if (team.length !== 1 || opponent.length !== 1) {
    return { ok: false, problem: 'NOT_ONE_VS_ONE' };
  }

  const home = normalizeSide(team[0]);
  if (typeof home === 'string') return { ok: false, problem: home };
  const away = normalizeSide(opponent[0]);
  if (typeof away === 'string') return { ok: false, problem: away };

  const type = typeof raw.type === 'string' ? raw.type : '';

  return {
    ok: true,
    battle: {
      fingerprint: battleFingerprint(battleTime, [home.tag, away.tag]),
      battleTime,
      type,
      isFriendly: type === FRIENDLY_BATTLE_TYPE,
      gameModeId: typeof raw.gameMode?.id === 'number' ? raw.gameMode.id : null,
      gameModeName: typeof raw.gameMode?.name === 'string' ? raw.gameMode.name : null,
      arenaName: typeof raw.arena?.name === 'string' ? raw.arena.name : null,
      deckSelection: typeof raw.deckSelection === 'string' ? raw.deckSelection : null,
      isHostedMatch: typeof raw.isHostedMatch === 'boolean' ? raw.isHostedMatch : null,
      tournamentTag: typeof raw.tournamentTag === 'string' ? raw.tournamentTag : null,
      sides: [home, away],
    },
  };
}

/**
 * Normaliza un historial entero, separando lo aprovechable de lo que no.
 *
 * No se descarta en silencio: cada batalla inservible queda contada por su
 * motivo, para que la sincronizacion pueda informar de ello.
 */
export function normalizeBattlelog(battles: readonly ClashBattle[]): {
  readonly battles: readonly NormalizedBattle[];
  readonly skipped: Readonly<Record<NormalizationProblem, number>>;
} {
  const accepted: NormalizedBattle[] = [];
  const skipped: Record<NormalizationProblem, number> = {
    MISSING_BATTLE_TIME: 0,
    NOT_ONE_VS_ONE: 0,
    MISSING_TAG: 0,
    MISSING_CROWNS: 0,
  };

  for (const raw of battles) {
    const result = normalizeBattle(raw);
    if (result.ok) accepted.push(result.battle);
    else skipped[result.problem] += 1;
  }

  return { battles: accepted, skipped };
}

/**
 * Compara dos versiones de la misma batalla.
 *
 * La misma huella puede llegar dos veces: una desde el historial de cada
 * jugador. Deberian coincidir —se comprobo que coinciden—, pero si no lo
 * hacen, el sistema tiene que enterarse en lugar de quedarse con la ultima.
 */
export function battlesAgree(left: NormalizedBattle, right: NormalizedBattle): boolean {
  if (left.fingerprint !== right.fingerprint) return false;
  if (left.type !== right.type) return false;

  const crownsOf = (battle: NormalizedBattle): string =>
    [...battle.sides]
      .map((side) => `${side.tag}:${side.crowns}`)
      .sort()
      .join('|');

  return crownsOf(left) === crownsOf(right);
}
