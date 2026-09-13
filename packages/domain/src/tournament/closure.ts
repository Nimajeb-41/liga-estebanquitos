/**
 * ¿Se puede cerrar la temporada?
 *
 * Cerrar una temporada es la operación más definitiva del sistema: de
 * `FINISHED` no se sale, y la clasificación de ese momento queda como el
 * resultado de la competición. Así que antes hay que poder contestar, con
 * nombres concretos, a «¿queda algo sin resolver?».
 *
 * Lo que este módulo **no** hace es decidir qué pasa con lo que queda. Un
 * partido sin jugar a estas alturas puede ser un abandono (**P-05**), una
 * incomparecencia que nadie declaró (R-09) o un aplazamiento que se quedó sin
 * fecha (**P-08**). Las tres tienen consecuencias distintas y ninguna está
 * decidida aquí: el sistema las enumera y quien lleva la liga decide.
 */

import type { MatchStatus } from '../matches/status.ts';

/** Un motivo concreto por el que la temporada todavía no está cerrada. */
export interface ClosureBlocker {
  /** Código estable. La interfaz traduce; nadie depende del texto. */
  readonly code:
    'MATCHES_NOT_PLAYED' | 'MATCHES_LIVE' | 'MATCHES_POSTPONED' | 'MATCHES_DISPUTED' | 'NO_FIXTURE';
  readonly count: number;
  /** Identificadores de los partidos afectados, para poder ir a ellos. */
  readonly matchIds: readonly string[];
}

export interface ClosureReport {
  /** `true` solo si no queda ningún bloqueo. */
  readonly closeable: boolean;
  readonly blockers: readonly ClosureBlocker[];
  readonly total: number;
  readonly completed: number;
  readonly cancelled: number;
}

export interface ClosureMatch {
  readonly id: string;
  readonly status: MatchStatus;
}

/**
 * Estados que impiden cerrar, y por qué cada uno.
 *
 * `CANCELLED` no está: un partido cancelado ya está resuelto —no se va a jugar
 * y no cuenta para nadie—, así que no impide nada. Es justamente la diferencia
 * entre cancelar y dejar pendiente.
 */
const BLOCKING: Readonly<Partial<Record<MatchStatus, ClosureBlocker['code']>>> = {
  SCHEDULED: 'MATCHES_NOT_PLAYED',
  LIVE: 'MATCHES_LIVE',
  POSTPONED: 'MATCHES_POSTPONED',
  DISPUTED: 'MATCHES_DISPUTED',
};

export function seasonClosureReport(matches: readonly ClosureMatch[]): ClosureReport {
  const grouped = new Map<ClosureBlocker['code'], string[]>();

  for (const match of matches) {
    const code = BLOCKING[match.status];
    if (code === undefined) continue;
    const list = grouped.get(code) ?? [];
    list.push(match.id);
    grouped.set(code, list);
  }

  const blockers: ClosureBlocker[] = [...grouped.entries()].map(([code, matchIds]) => ({
    code,
    count: matchIds.length,
    // Ordenados para que el informe sea reproducible entre ejecuciones.
    matchIds: [...matchIds].sort(),
  }));

  // Una temporada sin calendario no se cierra: no llegó a empezar.
  if (matches.length === 0) {
    blockers.push({ code: 'NO_FIXTURE', count: 0, matchIds: [] });
  }

  blockers.sort((left, right) => left.code.localeCompare(right.code));

  return {
    closeable: blockers.length === 0,
    blockers,
    total: matches.length,
    completed: matches.filter((match) => match.status === 'COMPLETED').length,
    cancelled: matches.filter((match) => match.status === 'CANCELLED').length,
  };
}
