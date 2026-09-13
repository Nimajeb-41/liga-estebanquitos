/**
 * Gestion de la plantilla (roster).
 *
 * Todas las operaciones son funciones puras: reciben la lista de participantes
 * y devuelven una lista nueva. La persistencia y los permisos son problema de
 * las capas de arriba; aqui solo viven las invariantes de la competicion.
 *
 * Modelo de plazas: hay `settings.rosterSize` plazas numeradas. Una plaza se
 * ocupa al CONFIRMAR a un participante y se libera al desconfirmarlo. Las
 * plazas libres son las que la interfaz muestra como TBD / POR CONFIRMAR.
 */

import { DomainError } from '../errors.ts';
import type { TournamentSettings } from '../tournament/settings.ts';
import {
  isActive,
  isConfirmed,
  normalizeClashTag,
  normalizeName,
  type Participant,
  type PlayerId,
} from './participant.ts';

export type Roster = readonly Participant[];

export interface NewParticipantInput {
  readonly id: PlayerId;
  readonly displayName: string;
  readonly clashTag?: string | null | undefined;
  readonly notes?: string | null | undefined;
}

export interface ParticipantPatch {
  readonly displayName?: string | undefined;
  readonly clashTag?: string | null | undefined;
  readonly notes?: string | null | undefined;
}

/* -------------------------------------------------------------------------- */
/* Consultas                                                                   */
/* -------------------------------------------------------------------------- */

export function findParticipant(roster: Roster, id: PlayerId): Participant | undefined {
  return roster.find((participant) => participant.id === id);
}

export function requireParticipant(roster: Roster, id: PlayerId): Participant {
  const participant = findParticipant(roster, id);
  if (participant === undefined) {
    throw new DomainError('PLAYER_NOT_FOUND', `No existe el participante ${id}.`, { id });
  }
  return participant;
}

/** Participantes confirmados, ordenados por plaza. */
export function confirmedParticipants(roster: Roster): readonly Participant[] {
  return roster
    .filter(isConfirmed)
    .slice()
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
}

export interface RosterSlot {
  readonly slot: number;
  /** `null` = plaza libre: la interfaz la muestra como TBD / POR CONFIRMAR. */
  readonly participant: Participant | null;
}

export interface RosterSummary {
  readonly rosterSize: number;
  /** Participantes dados de alta que siguen en juego (REGISTERED + CONFIRMED). */
  readonly registered: number;
  readonly confirmed: number;
  /** Plazas todavia sin confirmar. */
  readonly pending: number;
  readonly slots: readonly RosterSlot[];
  /** `true` cuando hay exactamente `rosterSize` confirmados. */
  readonly complete: boolean;
}

export function rosterSummary(roster: Roster, settings: TournamentSettings): RosterSummary {
  const bySlot = new Map<number, Participant>();
  for (const participant of roster) {
    if (isConfirmed(participant) && participant.slot !== null) {
      bySlot.set(participant.slot, participant);
    }
  }

  const slots: RosterSlot[] = [];
  for (let slot = 1; slot <= settings.rosterSize; slot += 1) {
    slots.push({ slot, participant: bySlot.get(slot) ?? null });
  }

  const confirmed = bySlot.size;
  return {
    rosterSize: settings.rosterSize,
    registered: roster.filter(isActive).length,
    confirmed,
    pending: settings.rosterSize - confirmed,
    slots,
    complete: confirmed === settings.rosterSize,
  };
}

/**
 * Comprueba que la plantilla puede cerrarse: exactamente `rosterSize`
 * participantes confirmados, cada uno en una plaza distinta.
 */
export function assertRosterReady(roster: Roster, settings: TournamentSettings): void {
  const confirmed = confirmedParticipants(roster);
  if (confirmed.length !== settings.rosterSize) {
    throw new DomainError(
      'ROSTER_INCOMPLETE',
      `Se requieren exactamente ${settings.rosterSize} participantes confirmados; hay ${confirmed.length}.`,
      { required: settings.rosterSize, confirmed: confirmed.length },
    );
  }
  const slots = new Set(confirmed.map((participant) => participant.slot));
  if (slots.size !== confirmed.length || slots.has(null)) {
    throw new DomainError('ROSTER_INCOMPLETE', 'Hay plazas duplicadas o sin asignar.', {
      slots: [...slots],
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Mutaciones                                                                  */
/* -------------------------------------------------------------------------- */

function assertNameAvailable(roster: Roster, displayName: string, exceptId?: PlayerId): void {
  const normalized = normalizeName(displayName);
  const clash = roster.find(
    (participant) =>
      participant.id !== exceptId &&
      isActive(participant) &&
      normalizeName(participant.displayName) === normalized,
  );
  if (clash !== undefined) {
    throw new DomainError('DUPLICATE_PLAYER_NAME', `Ya existe un participante "${displayName}".`, {
      displayName,
      existingId: clash.id,
    });
  }
}

function assertTagAvailable(roster: Roster, clashTag: string, exceptId?: PlayerId): void {
  const clash = roster.find(
    (participant) =>
      participant.id !== exceptId && isActive(participant) && participant.clashTag === clashTag,
  );
  if (clash !== undefined) {
    throw new DomainError('DUPLICATE_CLASH_TAG', `El tag ${clashTag} ya esta en uso.`, {
      clashTag,
      existingId: clash.id,
    });
  }
}

function firstFreeSlot(roster: Roster, settings: TournamentSettings): number {
  const taken = new Set(roster.filter(isConfirmed).map((participant) => participant.slot));
  for (let slot = 1; slot <= settings.rosterSize; slot += 1) {
    if (!taken.has(slot)) return slot;
  }
  throw new DomainError(
    'ROSTER_FULL',
    `No quedan plazas libres: la plantilla ya tiene ${settings.rosterSize} confirmados.`,
    { rosterSize: settings.rosterSize },
  );
}

export function addParticipant(
  roster: Roster,
  input: NewParticipantInput,
  _settings: TournamentSettings,
): Roster {
  if (findParticipant(roster, input.id) !== undefined) {
    throw new DomainError('DUPLICATE_PLAYER_ID', `Ya existe un participante con id ${input.id}.`, {
      id: input.id,
    });
  }
  const displayName = input.displayName.trim();
  if (displayName.length === 0) {
    throw new DomainError('INVALID_SETTINGS', 'El nombre del participante no puede estar vacio.');
  }
  assertNameAvailable(roster, displayName);

  const clashTag =
    input.clashTag === undefined || input.clashTag === null
      ? null
      : normalizeClashTag(input.clashTag);
  if (clashTag !== null) assertTagAvailable(roster, clashTag);

  const participant: Participant = {
    id: input.id,
    displayName,
    clashTag,
    status: 'REGISTERED',
    slot: null,
    notes: input.notes ?? null,
    replacedByPlayerId: null,
  };
  return [...roster, participant];
}

export function updateParticipant(roster: Roster, id: PlayerId, patch: ParticipantPatch): Roster {
  const current = requireParticipant(roster, id);

  const displayName =
    patch.displayName === undefined ? current.displayName : patch.displayName.trim();
  if (displayName.length === 0) {
    throw new DomainError('INVALID_SETTINGS', 'El nombre del participante no puede estar vacio.');
  }
  if (displayName !== current.displayName) assertNameAvailable(roster, displayName, id);

  let clashTag = current.clashTag;
  if (patch.clashTag !== undefined) {
    clashTag = patch.clashTag === null ? null : normalizeClashTag(patch.clashTag);
    if (clashTag !== null && clashTag !== current.clashTag)
      assertTagAvailable(roster, clashTag, id);
  }

  const updated: Participant = {
    ...current,
    displayName,
    clashTag,
    notes: patch.notes === undefined ? current.notes : patch.notes,
  };
  return roster.map((participant) => (participant.id === id ? updated : participant));
}

/** Baja definitiva. Solo tiene sentido antes de generar el fixture. */
export function removeParticipant(roster: Roster, id: PlayerId): Roster {
  requireParticipant(roster, id);
  return roster.filter((participant) => participant.id !== id);
}

export function confirmParticipant(
  roster: Roster,
  id: PlayerId,
  settings: TournamentSettings,
  slot?: number,
): Roster {
  const current = requireParticipant(roster, id);
  if (current.status === 'CONFIRMED') {
    throw new DomainError(
      'PLAYER_ALREADY_CONFIRMED',
      `${current.displayName} ya esta confirmado.`,
      {
        id,
      },
    );
  }
  if (!isActive(current)) {
    throw new DomainError(
      'PLAYER_INACTIVE',
      `${current.displayName} esta ${current.status} y no puede confirmarse.`,
      { id, status: current.status },
    );
  }

  let targetSlot: number;
  if (slot === undefined) {
    targetSlot = firstFreeSlot(roster, settings);
  } else {
    if (!Number.isInteger(slot) || slot < 1 || slot > settings.rosterSize) {
      throw new DomainError('SLOT_OUT_OF_RANGE', `La plaza ${slot} esta fuera de rango.`, {
        slot,
        rosterSize: settings.rosterSize,
      });
    }
    const occupant = roster.find(
      (participant) => isConfirmed(participant) && participant.slot === slot,
    );
    if (occupant !== undefined) {
      throw new DomainError('SLOT_TAKEN', `La plaza ${slot} ya la ocupa ${occupant.displayName}.`, {
        slot,
        occupantId: occupant.id,
      });
    }
    targetSlot = slot;
  }

  return roster.map((participant) =>
    participant.id === id ? { ...participant, status: 'CONFIRMED', slot: targetSlot } : participant,
  );
}

export function unconfirmParticipant(roster: Roster, id: PlayerId): Roster {
  const current = requireParticipant(roster, id);
  if (current.status !== 'CONFIRMED') {
    throw new DomainError('PLAYER_NOT_CONFIRMED', `${current.displayName} no esta confirmado.`, {
      id,
      status: current.status,
    });
  }
  return roster.map((participant) =>
    participant.id === id ? { ...participant, status: 'REGISTERED', slot: null } : participant,
  );
}

export function withdrawParticipant(roster: Roster, id: PlayerId): Roster {
  requireParticipant(roster, id);
  return roster.map((participant) =>
    participant.id === id ? { ...participant, status: 'WITHDRAWN', slot: null } : participant,
  );
}

/**
 * Sustituye a un participante por otro conservando su plaza.
 *
 * El saliente queda como REPLACED (no se borra: su rastro debe poder auditarse)
 * y el entrante hereda la plaza y el estado del saliente. Que ocurre con los
 * partidos ya jugados del saliente es una regla PENDIENTE DE DEFINICION; esta
 * funcion solo toca la plantilla.
 */
export function replaceParticipant(
  roster: Roster,
  outgoingId: PlayerId,
  incoming: NewParticipantInput,
  settings: TournamentSettings,
): Roster {
  const outgoing = requireParticipant(roster, outgoingId);
  if (!isActive(outgoing)) {
    throw new DomainError(
      'PLAYER_INACTIVE',
      `${outgoing.displayName} esta ${outgoing.status} y no puede sustituirse.`,
      { outgoingId, status: outgoing.status },
    );
  }

  const withIncoming = addParticipant(roster, incoming, settings);
  const slot = outgoing.slot;
  const status = outgoing.status;

  return withIncoming.map((participant) => {
    if (participant.id === outgoingId) {
      return {
        ...participant,
        status: 'REPLACED' as const,
        slot: null,
        replacedByPlayerId: incoming.id,
      };
    }
    if (participant.id === incoming.id) {
      return { ...participant, status, slot };
    }
    return participant;
  });
}
