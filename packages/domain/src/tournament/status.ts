/**
 * Maquina de estados del torneo.
 *
 * DRAFT -> REGISTRATION -> READY -> SCHEDULED -> LIVE -> FINISHED
 *
 * Se conservan los nombres propuestos por el administrador. La unica precision
 * anadida es semantica: READY significa "plantilla cerrada y validada" y
 * SCHEDULED significa "fixture oficial generado y persistido". Son dos hechos
 * distintos y por eso siguen siendo dos estados distintos.
 */

import { DomainError } from '../errors.ts';

export const TOURNAMENT_STATUSES = [
  'DRAFT',
  'REGISTRATION',
  'READY',
  'SCHEDULED',
  'LIVE',
  'FINISHED',
  'CANCELLED',
] as const;

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

/**
 * Transiciones permitidas. Las transiciones "hacia atras" existen a proposito:
 * durante la preparacion el administrador debe poder corregirse sin borrar el
 * torneo (reabrir inscripciones, descartar un fixture mal generado).
 */
const TRANSITIONS: Readonly<Record<TournamentStatus, readonly TournamentStatus[]>> = {
  DRAFT: ['REGISTRATION', 'CANCELLED'],
  REGISTRATION: ['DRAFT', 'READY', 'CANCELLED'],
  READY: ['REGISTRATION', 'SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['READY', 'LIVE', 'CANCELLED'],
  LIVE: ['FINISHED', 'CANCELLED'],
  FINISHED: [],
  CANCELLED: [],
};

export function allowedTransitions(from: TournamentStatus): readonly TournamentStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: TournamentStatus, to: TournamentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: TournamentStatus, to: TournamentStatus): void {
  if (!canTransition(from, to)) {
    throw new DomainError('INVALID_STATUS_TRANSITION', `No se puede pasar de ${from} a ${to}.`, {
      from,
      to,
      allowed: TRANSITIONS[from],
    });
  }
}

export function isTerminal(status: TournamentStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/* -------------------------------------------------------------------------- */
/* Capacidades por estado                                                      */
/* -------------------------------------------------------------------------- */

export const TOURNAMENT_CAPABILITIES = [
  /** Alta, baja y confirmacion de participantes: quien compite. */
  'MANAGE_ROSTER',
  /**
   * Cambiar el nombre con el que figura alguien que ya compite.
   *
   * Separada de `MANAGE_ROSTER` a proposito. Quien esta en la competicion queda
   * fijado en cuanto hay calendario —cambiarlo dejaria partidos apuntando a
   * gente que ya no juega—, pero **como se llama** es una etiqueta: no mueve un
   * solo partido ni un solo punto.
   *
   * En una liga de amigos los apodos cambian a mitad de temporada, y obligar a
   * cerrar el torneo para corregir una tilde seria absurdo.
   */
  'RENAME_PLAYER',
  /** Generar (o regenerar) el fixture oficial. */
  'GENERATE_FIXTURE',
  /** Cargar y corregir resultados. */
  'RECORD_RESULTS',
  /** Registrar sanciones. */
  'RECORD_SANCTIONS',
  /** Sustituir un participante por otro conservando el fixture. */
  'REPLACE_PLAYER',
] as const;

export type TournamentCapability = (typeof TOURNAMENT_CAPABILITIES)[number];

const CAPABILITIES: Readonly<Record<TournamentStatus, readonly TournamentCapability[]>> = {
  DRAFT: ['MANAGE_ROSTER', 'RENAME_PLAYER'],
  REGISTRATION: ['MANAGE_ROSTER', 'RENAME_PLAYER'],
  READY: ['MANAGE_ROSTER', 'RENAME_PLAYER', 'GENERATE_FIXTURE'],
  SCHEDULED: ['RENAME_PLAYER', 'GENERATE_FIXTURE', 'REPLACE_PLAYER', 'RECORD_SANCTIONS'],
  LIVE: ['RENAME_PLAYER', 'RECORD_RESULTS', 'RECORD_SANCTIONS', 'REPLACE_PLAYER'],
  /*
    Una temporada cerrada es historia: ni siquiera los nombres se tocan. La
    instantanea guarda la clasificacion con los nombres de entonces, y
    cambiarlos despues haria que el acta y la pantalla dijeran cosas distintas.
  */
  FINISHED: [],
  CANCELLED: [],
};

export function can(status: TournamentStatus, capability: TournamentCapability): boolean {
  return CAPABILITIES[status].includes(capability);
}

export function assertCan(status: TournamentStatus, capability: TournamentCapability): void {
  if (!can(status, capability)) {
    throw new DomainError(
      'OPERATION_NOT_ALLOWED_IN_STATUS',
      `La operacion ${capability} no esta permitida con el torneo en estado ${status}.`,
      { status, capability, allowed: CAPABILITIES[status] },
    );
  }
}

export function capabilitiesOf(status: TournamentStatus): readonly TournamentCapability[] {
  return CAPABILITIES[status];
}
