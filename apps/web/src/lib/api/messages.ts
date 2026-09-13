/**
 * Traducción de los errores de la API a algo que una persona entienda.
 *
 * El backend devuelve códigos estables (`PENDING_RULE`, `ROSTER_FULL`…). Aquí
 * se decide cómo se cuentan. El código técnico solo se enseña en desarrollo.
 */

import { ApiError, ApiUnreachableError, ContractError } from './client.ts';

const BY_CODE: Readonly<Record<string, string>> = {
  PENDING_RULE:
    'Esta acción todavía no puede realizarse: la regla del torneo que la define está pendiente de definición.',
  DRAW_NOT_ALLOWED: 'El reglamento no admite empates: el partido debe resolverse con un ganador.',
  INVALID_CROWNS: 'El marcador no es válido para este formato de partido.',
  ROSTER_FULL: 'La plantilla ya está completa: no quedan plazas libres.',
  ROSTER_INCOMPLETE:
    'Todavía no hay los participantes confirmados que exige el reglamento para este paso.',
  PLAYER_ALREADY_CONFIRMED: 'Ese participante ya estaba confirmado.',
  PLAYER_NOT_CONFIRMED: 'Ese participante no está confirmado.',
  PLAYER_INACTIVE: 'Ese participante ya no está activo en el torneo.',
  PLAYER_NOT_FOUND: 'No existe ese participante.',
  DUPLICATE_PLAYER_NAME: 'Ya hay un participante con ese nombre.',
  DUPLICATE_CLASH_TAG: 'Ese tag de Clash Royale ya está en uso.',
  SLOT_TAKEN: 'Esa plaza ya está ocupada.',
  SLOT_OUT_OF_RANGE: 'Esa plaza no existe.',
  FIXTURE_ALREADY_EXISTS:
    'Ya hay un calendario oficial. Regenerarlo borraría el anterior y exige confirmarlo expresamente.',
  INVALID_STATUS_TRANSITION: 'El torneo no puede pasar a ese estado desde el actual.',
  OPERATION_NOT_ALLOWED_IN_STATUS: 'El estado actual del torneo no permite esta operación.',
  INVALID_MATCH_TRANSITION: 'El partido no puede pasar a ese estado desde el actual.',
  MATCH_NOT_POSTPONED: 'Solo se reprograma un partido que esté aplazado.',
  MATCH_NOT_PLAYABLE: 'No se puede registrar el resultado de un partido en ese estado.',
  POSTPONEMENT_REASON_REQUIRED: 'Todo aplazamiento necesita un motivo escrito.',
  DISPUTE_WINDOW_CLOSED:
    'El plazo para impugnar este resultado ya venció. Solo cabe una corrección administrativa.',
  REPORT_NOT_ALLOWED: 'Ese reporte no está permitido para este partido.',
  NO_RESULT_TO_CORRECT: 'Este partido todavía no tiene resultado que corregir.',
  REASON_REQUIRED: 'Hace falta indicar un motivo.',
  VALIDATION_ERROR: 'Revisa los datos: hay algún campo incorrecto.',
  UNAUTHORIZED: 'Necesitas iniciar sesión.',
  FORBIDDEN: 'Tu rol no permite esta operación.',
  NOT_FOUND: 'No encontramos lo que buscabas.',
  INTERNAL_ERROR: 'Ha ocurrido un error en el servidor.',
};

const BY_STATUS: Readonly<Record<number, string>> = {
  401: 'Necesitas iniciar sesión.',
  403: 'No tienes permiso para hacer esto.',
  404: 'No encontramos lo que buscabas.',
  409: 'El estado actual no permite esta operación.',
  422: 'Esta operación incumple una regla del torneo.',
  429: 'Demasiadas peticiones seguidas. Espera unos segundos.',
  500: 'Ha ocurrido un error en el servidor.',
};

export interface FriendlyError {
  readonly message: string;
  /** Código técnico. Solo se muestra en desarrollo. */
  readonly code: string | null;
  readonly status: number | null;
  readonly requestId: string | null;
}

export function friendlyError(error: unknown): FriendlyError {
  if (error instanceof ApiUnreachableError) {
    return {
      message: 'No se pudo contactar con el servidor de la liga. Inténtalo de nuevo en un momento.',
      code: 'API_UNREACHABLE',
      status: null,
      requestId: null,
    };
  }

  if (error instanceof ApiError) {
    return {
      message: BY_CODE[error.code] ?? BY_STATUS[error.status] ?? error.message,
      code: error.code,
      status: error.status,
      requestId: error.requestId,
    };
  }

  if (error instanceof ContractError) {
    // Pasa cuando el backend y el frontend van a versiones distintas. Al
    // visitante no le sirve el detalle, pero en desarrollo es justo lo que hace
    // falta para no perder media hora buscando en el sitio equivocado.
    return {
      message: showTechnicalDetails()
        ? error.message
        : 'La información llegó en un formato que esta versión del sitio no entiende. Vuelve a intentarlo en un momento.',
      code: 'CONTRACT_MISMATCH',
      status: null,
      requestId: null,
    };
  }

  return {
    message: 'Ha ocurrido un error inesperado.',
    code: null,
    status: null,
    requestId: null,
  };
}

/** ¿Se muestran los códigos técnicos? Solo fuera de producción. */
export function showTechnicalDetails(): boolean {
  return import.meta.env.DEV;
}
