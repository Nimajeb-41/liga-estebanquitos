/** Participante del torneo y su ciclo de vida. */

import { DomainError } from '../errors.ts';

export type PlayerId = string;

/**
 * Ciclo de vida de un participante. Separa deliberadamente "existe" de
 * "esta confirmado" de "sigue compitiendo":
 *
 * - REGISTERED: existe en el sistema, todavia no confirmo su plaza.
 * - CONFIRMED:  el administrador lo dio por confirmado; cuenta para el cupo.
 * - WITHDRAWN:  se dio de baja o fue dado de baja antes/durante la competicion.
 * - REPLACED:   fue sustituido por otro participante en la misma plaza.
 */
export const PARTICIPANT_STATUSES = ['REGISTERED', 'CONFIRMED', 'WITHDRAWN', 'REPLACED'] as const;

export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export interface Participant {
  readonly id: PlayerId;
  readonly displayName: string;
  /** Tag de Clash Royale (con '#'), o null mientras no se conozca. */
  readonly clashTag: string | null;
  readonly status: ParticipantStatus;
  /** Plaza 1..rosterSize, o null si todavia no ocupa ninguna. */
  readonly slot: number | null;
  readonly notes: string | null;
  /** Participante que ocupo su plaza, cuando status === 'REPLACED'. */
  readonly replacedByPlayerId: PlayerId | null;
}

/** Cuenta para el cupo de plazas confirmadas. */
export function isConfirmed(participant: Participant): boolean {
  return participant.status === 'CONFIRMED';
}

/** Sigue formando parte de la competicion. */
export function isActive(participant: Participant): boolean {
  return participant.status === 'REGISTERED' || participant.status === 'CONFIRMED';
}

/** Normaliza un nombre para comparaciones (duplicados). */
export function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase('es');
}

const CLASH_TAG_PATTERN = /^#[0-9A-Z]{3,15}$/;

/**
 * Normaliza un tag de Clash Royale: sin espacios, en mayusculas y con '#'.
 *
 * La validacion es deliberadamente permisiva: el alfabeto exacto que usa
 * Supercell no se ha verificado todavia contra la API oficial, y preferimos no
 * rechazar tags validos. La verificacion real sera contra la API (ver
 * docs/clash-royale-api.md).
 */
export function normalizeClashTag(tag: string): string {
  const cleaned = tag.trim().toUpperCase().replace(/\s+/g, '');
  const withHash = cleaned.startsWith('#') ? cleaned : `#${cleaned}`;
  if (!CLASH_TAG_PATTERN.test(withHash)) {
    throw new DomainError('INVALID_SETTINGS', `Tag de Clash Royale con formato invalido: ${tag}.`, {
      tag,
    });
  }
  return withHash;
}

/**
 * Version publicable de un tag ajeno.
 *
 * El tag de un participante es publico: el mismo lo declaro al inscribirse. El
 * de cualquier otra persona que aparezca en una batalla observada, no —nadie le
 * pidio permiso para publicarlo—. Esta funcion deja lo justo para reconocer
 * repeticiones sin poder buscar la cuenta.
 *
 * No es un hash ni pretende serlo: es un tag recortado. Quien ya conozca el tag
 * completo lo seguira reconociendo, y eso es aceptable; lo que se evita es
 * publicar el identificador entero de alguien que no juega la liga.
 */
export function maskClashTag(tag: string): string {
  const body = tag.startsWith('#') ? tag.slice(1) : tag;
  if (body.length <= 3) return `#${'•'.repeat(body.length)}`;
  return `#${'•'.repeat(body.length - 3)}${body.slice(-3)}`;
}
