import { expect } from 'vitest';

import { DomainError, type DomainErrorCode } from '../src/errors.ts';
import type { Participant, PlayerId } from '../src/roster/participant.ts';
import { addParticipant, confirmParticipant, type Roster } from '../src/roster/roster.ts';
import type { TournamentSettings } from '../src/tournament/settings.ts';

/** Comprueba que la funcion lanza un DomainError con el codigo esperado. */
export function expectDomainError(fn: () => unknown, code: DomainErrorCode): DomainError {
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(DomainError);
  const error = thrown as DomainError;
  expect(error.code).toBe(code);
  return error;
}

export function slug(name: string): PlayerId {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** Construye una plantilla con los nombres dados, todos confirmados. */
export function rosterOf(names: readonly string[], settings: TournamentSettings): Roster {
  let roster: Roster = [];
  for (const name of names) {
    roster = addParticipant(roster, { id: slug(name), displayName: name }, settings);
    roster = confirmParticipant(roster, slug(name), settings);
  }
  return roster;
}

export function idsOf(roster: readonly Participant[]): PlayerId[] {
  return roster.map((participant) => participant.id);
}
