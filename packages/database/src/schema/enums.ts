/**
 * Tipos enumerados de PostgreSQL.
 *
 * Los valores son exactamente los mismos que usa @liga/domain: la base de datos
 * no conoce reglas de competicion, pero si el vocabulario. Cualquier cambio
 * aqui exige una migracion, que es justo lo que queremos para algo tan estable.
 */

import { pgEnum } from 'drizzle-orm/pg-core';

export const tournamentStatusEnum = pgEnum('tournament_status', [
  'DRAFT',
  'REGISTRATION',
  'READY',
  'SCHEDULED',
  'LIVE',
  'FINISHED',
  'CANCELLED',
]);

export const participantStatusEnum = pgEnum('participant_status', [
  'REGISTERED',
  'CONFIRMED',
  'WITHDRAWN',
  'REPLACED',
]);

export const matchStatusEnum = pgEnum('match_status', [
  'SCHEDULED',
  'LIVE',
  'COMPLETED',
  'POSTPONED',
  'CANCELLED',
  'DISPUTED',
]);

export const matchResolutionEnum = pgEnum('match_resolution', [
  'PLAYED',
  'WALKOVER',
  'ADMIN_DECISION',
]);

export const sanctionTypeEnum = pgEnum('sanction_type', ['BM', 'NO_SHOW', 'RULE_BREACH', 'OTHER']);

export const sanctionStatusEnum = pgEnum('sanction_status', ['ACTIVE', 'REVOKED']);

export const postponementReasonEnum = pgEnum('postponement_reason', [
  'PERSONAL',
  'TECHNICAL',
  'CONNECTION',
  'SCHEDULE',
  'UNAVAILABLE',
  'ADMIN_DECISION',
  'OTHER',
]);

export const postponementEventEnum = pgEnum('postponement_event', ['POSTPONED', 'RESCHEDULED']);

export const adminRoleEnum = pgEnum('admin_role', ['OWNER', 'ADMIN', 'REFEREE', 'VIEWER']);

export const deckSourceEnum = pgEnum('deck_source', ['MANUAL', 'CLASH_API']);

/**
 * Estado de un candidato a resultado.
 *
 * `PENDING` espera revision, `NEEDS_REVIEW` es un candidato con algo que no
 * cuadra y que se ha apartado a proposito. Ninguno de los dos puntua: solo
 * `CONFIRMED` produce un resultado, y solo lo produce un administrador.
 */
export const battleCandidateStatusEnum = pgEnum('battle_candidate_status', [
  'PENDING',
  'NEEDS_REVIEW',
  'CONFIRMED',
  'REJECTED',
]);

/**
 * Estado de la vinculacion entre un participante y una cuenta de Clash Royale.
 *
 * `VERIFIED` existe en el tipo pero **el sistema no lo asigna nunca**: verificar
 * la propiedad de una cuenta exigiria `verifytoken`, que Supercell no documenta.
 * Vincular no es verificar, y P-11 sigue abierta. Ver ADR 0015.
 */
export const clashLinkStatusEnum = pgEnum('clash_link_status', ['UNVERIFIED', 'VERIFIED']);
