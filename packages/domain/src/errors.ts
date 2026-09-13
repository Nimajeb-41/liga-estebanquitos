/**
 * Errores del dominio.
 *
 * Todo el motor senaliza los fallos de regla de negocio con `DomainError` y un
 * `code` estable: la capa HTTP puede mapear el codigo a un status y la interfaz
 * puede traducir el mensaje sin depender del texto en ingles/espanol.
 */

export const DOMAIN_ERROR_CODES = [
  // Estado del torneo
  'INVALID_STATUS_TRANSITION',
  'OPERATION_NOT_ALLOWED_IN_STATUS',
  // Roster
  'PLAYER_NOT_FOUND',
  'DUPLICATE_PLAYER_NAME',
  'DUPLICATE_CLASH_TAG',
  'ROSTER_FULL',
  'ROSTER_INCOMPLETE',
  'PLAYER_ALREADY_CONFIRMED',
  'PLAYER_NOT_CONFIRMED',
  'PLAYER_INACTIVE',
  'SLOT_OUT_OF_RANGE',
  'SLOT_TAKEN',
  // Fixture
  'ODD_PLAYER_COUNT',
  'NOT_ENOUGH_PLAYERS',
  'DUPLICATE_PLAYER_ID',
  'INVALID_FIXTURE',
  // Partidos
  'INVALID_MATCH_TRANSITION',
  'MATCH_NOT_POSTPONED',
  'POSTPONEMENT_REASON_REQUIRED',
  'INVALID_DATE',
  // Resultados
  'INVALID_CROWNS',
  'DRAW_NOT_ALLOWED',
  'SELF_MATCH',
  // Incomparecencia (P-01). Un walkover no se resuelve por marcador: hay que
  // decir quien falto, y no puede llevar coronas.
  'ABSENT_PLAYER_REQUIRED',
  'ABSENT_PLAYER_NOT_IN_MATCH',
  'ABSENT_PLAYER_NOT_APPLICABLE',
  'WALKOVER_HAS_NO_SCORE',
  'REPORT_NOT_ALLOWED',
  'DISPUTE_WINDOW_CLOSED',
  'FIXTURE_ALREADY_EXISTS',
  // Configuracion
  'INVALID_SETTINGS',
  // Con el calendario generado, el numero de participantes y las vueltas ya no
  // se tocan: de esos parametros sale el propio calendario.
  'SETTINGS_LOCKED_BY_FIXTURE',
  'UNKNOWN_TIEBREAKER',
  'PENDING_RULE',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: DomainErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}

/**
 * Regla que el administrador todavia no ha decidido (ver docs/pending-rules.md).
 * Preferimos fallar de forma explicita antes que inventar un comportamiento.
 */
export function pendingRule(rule: string, reference: string): DomainError {
  return new DomainError(
    'PENDING_RULE',
    `La regla "${rule}" todavia no esta definida. Ver ${reference}.`,
    { rule, reference },
  );
}
