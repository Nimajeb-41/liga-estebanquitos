/**
 * Qué se puede cambiar del reglamento, y cuándo.
 *
 * La clasificación de esta liga **se deriva**: no se guarda. Cambiar
 * `scoring.win` no actualiza una tabla, la **reescribe entera y hacia atrás**,
 * incluidas las jornadas ya jugadas. Eso es una propiedad deseable —corregir un
 * error de configuración no obliga a tocar históricos— y a la vez el riesgo más
 * silencioso del sistema: nadie se entera de que la tabla de la jornada 4 ya no
 * dice lo que decía.
 *
 * Este módulo pone las dos barreras que hacen que ese riesgo sea manejable:
 *
 * 1. **Hay parámetros que no se tocan una vez hay calendario.** El número de
 *    participantes y las vueltas *definen* el calendario: cambiarlos con 90
 *    partidos ya sorteados deja una competición que no cuadra consigo misma.
 * 2. **Cambiar las reglas cambia la versión del reglamento.** La versión viaja
 *    en cada respuesta de clasificación precisamente para poder decir «esto se
 *    calculó con estas reglas». Si cambian las reglas y no cambia la versión,
 *    esa frase pasa a ser mentira.
 *
 * Lo que este módulo **no** decide es si cambiar la puntuación a mitad de
 * temporada es buena idea. Eso es criterio de quien lleva la liga; aquí solo se
 * garantiza que quede dicho y fechado.
 */

import { DomainError } from '../errors.ts';
import type { TournamentStatus } from './status.ts';

/**
 * Parámetros que definen la **forma** de la competición.
 *
 * De ellos sale el calendario: 10 participantes y 2 vueltas son 18 jornadas de
 * 5 partidos. Cambiarlos cuando el calendario ya existe no es un ajuste, es
 * otra competición.
 */
export const FORMAT_SETTINGS = ['rosterSize', 'legs'] as const;

/**
 * Parámetros que cambian **cómo se puntúa** lo ya jugado.
 *
 * Se pueden cambiar en cualquier momento —corregir un error de configuración no
 * debería obligar a rehacer la temporada— pero recalculan la tabla hacia atrás,
 * así que suben la versión del reglamento.
 */
export const SCORING_SETTINGS = ['scoring', 'crowns', 'tiebreakers', 'sanctions'] as const;

/**
 * Parámetros de **operación**: plazos y tolerancias.
 *
 * No recalculan nada de lo ya jugado; afectan a lo que viene. Cambiarlos no
 * sube la versión del reglamento, pero queda en auditoría como todo lo demás.
 */
export const OPERATIONAL_SETTINGS = ['disputes', 'noShow'] as const;

export type ConfigurableSetting =
  | (typeof FORMAT_SETTINGS)[number]
  | (typeof SCORING_SETTINGS)[number]
  | (typeof OPERATIONAL_SETTINGS)[number];

/** Estados en los que el calendario ya existe y la forma está fijada. */
const FORMAT_LOCKED_FROM: readonly TournamentStatus[] = [
  'SCHEDULED',
  'LIVE',
  'FINISHED',
  'CANCELLED',
];

/** Estados terminales: la competición acabó y su reglamento es historia. */
const FROZEN: readonly TournamentStatus[] = ['FINISHED', 'CANCELLED'];

export interface SettingsChangeVerdict {
  /** Campos que se pueden aplicar. */
  readonly allowed: readonly ConfigurableSetting[];
  /** `true` si alguno recalcula la tabla ya jugada. */
  readonly recalculatesStandings: boolean;
}

/**
 * ¿Se pueden cambiar estos parámetros con el torneo en este estado?
 *
 * Falla con el detalle de qué campo y por qué, en vez de aplicar «lo que se
 * pueda»: una configuración a medias es peor que un error.
 */
export function assertSettingsChangeAllowed(
  status: TournamentStatus,
  changed: readonly ConfigurableSetting[],
): SettingsChangeVerdict {
  if (FROZEN.includes(status)) {
    throw new DomainError(
      'OPERATION_NOT_ALLOWED_IN_STATUS',
      `El reglamento de un torneo en ${status} es historia: no se cambia.`,
      { status, changed: [...changed] },
    );
  }

  const blocked = changed.filter(
    (field) =>
      (FORMAT_SETTINGS as readonly string[]).includes(field) && FORMAT_LOCKED_FROM.includes(status),
  );

  if (blocked.length > 0) {
    throw new DomainError(
      'SETTINGS_LOCKED_BY_FIXTURE',
      `Con el calendario ya generado no se puede cambiar ${blocked.join(', ')}: de esos parámetros sale el propio calendario.`,
      { status, blocked, changed: [...changed] },
    );
  }

  return {
    allowed: changed,
    recalculatesStandings: changed.some((field) =>
      (SCORING_SETTINGS as readonly string[]).includes(field),
    ),
  };
}

/**
 * Sube la versión del reglamento.
 *
 * `2026-1.2` → `2026-1.3`. Si la versión no tiene esa forma —porque alguien la
 * escribió a mano— se le añade un sufijo en lugar de inventarse un formato: es
 * preferible una versión fea a dos tablas distintas con la misma etiqueta.
 */
export function nextRulesVersion(current: string): string {
  const match = /^(.*\.)(\d+)$/.exec(current);
  if (match === null) return `${current}.1`;
  return `${match[1]}${Number(match[2]) + 1}`;
}
