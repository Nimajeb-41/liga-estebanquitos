/**
 * Errores HTTP y traduccion de los errores del dominio.
 *
 * El dominio no sabe nada de HTTP: senala `DomainError` con un `code` estable.
 * Aqui se decide que status le corresponde. La respuesta siempre tiene la misma
 * forma, para que el panel y cualquier cliente puedan tratarla igual:
 *
 *   { "error": { "code": "...", "message": "...", "details": {...} },
 *     "requestId": "..." }
 */

import { DomainError, type DomainErrorCode } from '@liga/domain';

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message: string, details?: Record<string, unknown>): HttpError =>
  new HttpError(404, 'NOT_FOUND', message, details);

export const unauthorized = (message = 'Necesitas iniciar sesion.'): HttpError =>
  new HttpError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'Tu rol no permite esta operacion.'): HttpError =>
  new HttpError(403, 'FORBIDDEN', message);

export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new HttpError(409, code, message, details);

export const badRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  new HttpError(400, code, message, details);

/**
 * Status que corresponde a cada codigo del dominio.
 *
 * 409 = el estado actual de la competicion no permite la operacion.
 * 422 = la operacion es imposible con estos datos (reglas de negocio).
 * 400 = la entrada esta mal formada.
 */
const DOMAIN_STATUS: Partial<Record<DomainErrorCode, number>> = {
  INVALID_STATUS_TRANSITION: 409,
  OPERATION_NOT_ALLOWED_IN_STATUS: 409,
  INVALID_MATCH_TRANSITION: 409,
  MATCH_NOT_POSTPONED: 409,
  ROSTER_FULL: 409,
  ROSTER_INCOMPLETE: 422,
  PLAYER_ALREADY_CONFIRMED: 409,
  PLAYER_NOT_CONFIRMED: 409,
  PLAYER_INACTIVE: 409,
  SLOT_TAKEN: 409,
  FIXTURE_ALREADY_EXISTS: 409,
  SETTINGS_LOCKED_BY_FIXTURE: 409,
  DISPUTE_WINDOW_CLOSED: 409,
  REPORT_NOT_ALLOWED: 403,
  PLAYER_NOT_FOUND: 404,
  DUPLICATE_PLAYER_NAME: 422,
  DUPLICATE_CLASH_TAG: 422,
  DUPLICATE_PLAYER_ID: 422,
  PENDING_RULE: 422,
  DRAW_NOT_ALLOWED: 422,
  INVALID_CROWNS: 422,
  SELF_MATCH: 422,
  ODD_PLAYER_COUNT: 422,
  NOT_ENOUGH_PLAYERS: 422,
  INVALID_FIXTURE: 422,
  POSTPONEMENT_REASON_REQUIRED: 400,
  INVALID_DATE: 400,
  SLOT_OUT_OF_RANGE: 400,
  INVALID_SETTINGS: 400,
  UNKNOWN_TIEBREAKER: 400,
};

export function statusForDomainError(error: DomainError): number {
  return DOMAIN_STATUS[error.code] ?? 422;
}

export interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>>;
  };
  readonly requestId: string;
}

export function toErrorBody(
  error: unknown,
  requestId: string,
): { status: number; body: ErrorBody } {
  if (error instanceof DomainError) {
    return {
      status: statusForDomainError(error),
      body: {
        error: { code: error.code, message: error.message, details: error.details },
        requestId,
      },
    };
  }
  if (error instanceof HttpError) {
    return {
      status: error.statusCode,
      body: {
        error: { code: error.code, message: error.message, details: error.details },
        requestId,
      },
    };
  }
  return {
    status: 500,
    body: {
      error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' },
      requestId,
    },
  };
}
