import { describe, expect, it } from 'vitest';

import { EMPTY_SLOT_LABEL } from '../src/labels/es.ts';
import { maskClashTag, normalizeClashTag } from '../src/roster/participant.ts';
import {
  addParticipant,
  assertRosterReady,
  confirmParticipant,
  confirmedParticipants,
  removeParticipant,
  replaceParticipant,
  rosterSummary,
  unconfirmParticipant,
  updateParticipant,
  withdrawParticipant,
  type Roster,
} from '../src/roster/roster.ts';
import { DEFAULT_SETTINGS } from '../src/tournament/settings.ts';
import { expectDomainError, rosterOf, slug } from './helpers.ts';

const settings = DEFAULT_SETTINGS;

/** Los seis participantes confirmados a dia de hoy. Los otros cuatro son TBD. */
const CONFIRMED_TODAY = ['Nimaben', 'Lyuk', 'Dullys', 'Esteban', 'Eze23ml', 'LeonSB'];

describe('altas, bajas y ediciones', () => {
  it('da de alta a un participante como inscrito, sin plaza', () => {
    const roster = addParticipant([], { id: 'nimaben', displayName: 'Nimaben' }, settings);
    expect(roster).toHaveLength(1);
    expect(roster[0]?.status).toBe('REGISTERED');
    expect(roster[0]?.slot).toBeNull();
  });

  it('rechaza nombres duplicados sin distinguir mayusculas', () => {
    const roster = addParticipant([], { id: 'lyuk', displayName: 'Lyuk' }, settings);
    expectDomainError(
      () => addParticipant(roster, { id: 'lyuk-2', displayName: 'lyuk' }, settings),
      'DUPLICATE_PLAYER_NAME',
    );
  });

  it('rechaza ids duplicados', () => {
    const roster = addParticipant([], { id: 'lyuk', displayName: 'Lyuk' }, settings);
    expectDomainError(
      () => addParticipant(roster, { id: 'lyuk', displayName: 'Otro' }, settings),
      'DUPLICATE_PLAYER_ID',
    );
  });

  it('normaliza y valida el tag de Clash Royale', () => {
    expect(normalizeClashTag(' 2p0lyq0 ')).toBe('#2P0LYQ0');
    expect(normalizeClashTag('#2P0LYQ0')).toBe('#2P0LYQ0');
    expectDomainError(() => normalizeClashTag('##'), 'INVALID_SETTINGS');
  });

  it('enmascara el tag de quien no juega la liga', () => {
    // Deja lo justo para reconocer repeticiones sin poder buscar la cuenta.
    expect(maskClashTag('#2P0LYQ0')).toBe('#••••YQ0');
    expect(maskClashTag('2P0LYQ0')).toBe('#••••YQ0');
    // No se conserva la longitud a costa de destapar el principio.
    expect(maskClashTag('#2P0LYQ0')).not.toContain('2P0');
    // Un tag corto se tapa entero antes que dejarlo casi visible.
    expect(maskClashTag('#ABC')).toBe('#•••');
  });

  it('rechaza dos participantes con el mismo tag', () => {
    let roster = addParticipant([], { id: 'a', displayName: 'A', clashTag: '#2P0LYQ0' }, settings);
    expectDomainError(
      () => addParticipant(roster, { id: 'b', displayName: 'B', clashTag: '2p0lyq0' }, settings),
      'DUPLICATE_CLASH_TAG',
    );
    roster = addParticipant(roster, { id: 'b', displayName: 'B' }, settings);
    expect(roster).toHaveLength(2);
  });

  it('edita nombre, tag y notas', () => {
    let roster = addParticipant([], { id: 'a', displayName: 'A' }, settings);
    roster = updateParticipant(roster, 'a', {
      displayName: 'Alfa',
      clashTag: '#9YJUPV',
      notes: 'confirma por Discord',
    });
    expect(roster[0]?.displayName).toBe('Alfa');
    expect(roster[0]?.clashTag).toBe('#9YJUPV');
    expect(roster[0]?.notes).toBe('confirma por Discord');
  });

  it('elimina a un participante que todavia no forma parte del calendario', () => {
    let roster = addParticipant([], { id: 'a', displayName: 'A' }, settings);
    roster = removeParticipant(roster, 'a');
    expect(roster).toHaveLength(0);
  });

  it('falla al operar sobre un participante inexistente', () => {
    expectDomainError(() => removeParticipant([], 'fantasma'), 'PLAYER_NOT_FOUND');
  });
});

describe('confirmacion y plazas', () => {
  it('asigna la primera plaza libre al confirmar', () => {
    let roster: Roster = [];
    roster = addParticipant(roster, { id: 'a', displayName: 'A' }, settings);
    roster = addParticipant(roster, { id: 'b', displayName: 'B' }, settings);
    roster = confirmParticipant(roster, 'a', settings);
    roster = confirmParticipant(roster, 'b', settings);
    expect(roster.map((participant) => participant.slot)).toEqual([1, 2]);
  });

  it('permite elegir la plaza y protege las ocupadas', () => {
    let roster: Roster = [];
    roster = addParticipant(roster, { id: 'a', displayName: 'A' }, settings);
    roster = addParticipant(roster, { id: 'b', displayName: 'B' }, settings);
    roster = confirmParticipant(roster, 'a', settings, 7);
    expect(roster[0]?.slot).toBe(7);
    expectDomainError(() => confirmParticipant(roster, 'b', settings, 7), 'SLOT_TAKEN');
    expectDomainError(() => confirmParticipant(roster, 'b', settings, 11), 'SLOT_OUT_OF_RANGE');
  });

  it('libera la plaza al desconfirmar', () => {
    let roster = addParticipant([], { id: 'a', displayName: 'A' }, settings);
    roster = confirmParticipant(roster, 'a', settings);
    roster = unconfirmParticipant(roster, 'a');
    expect(roster[0]?.status).toBe('REGISTERED');
    expect(roster[0]?.slot).toBeNull();
    expectDomainError(() => unconfirmParticipant(roster, 'a'), 'PLAYER_NOT_CONFIRMED');
  });

  it('no confirma a un participante retirado', () => {
    let roster = addParticipant([], { id: 'a', displayName: 'A' }, settings);
    roster = withdrawParticipant(roster, 'a');
    expectDomainError(() => confirmParticipant(roster, 'a', settings), 'PLAYER_INACTIVE');
  });

  it('no confirma a un undecimo participante', () => {
    let roster = rosterOf(
      Array.from({ length: 10 }, (_, index) => `Jugador ${index + 1}`),
      settings,
    );
    roster = addParticipant(roster, { id: 'extra', displayName: 'Suplente' }, settings);
    expectDomainError(() => confirmParticipant(roster, 'extra', settings), 'ROSTER_FULL');
  });

  it('admite mas inscritos que plazas mientras no se confirmen', () => {
    let roster = rosterOf(
      Array.from({ length: 10 }, (_, index) => `Jugador ${index + 1}`),
      settings,
    );
    roster = addParticipant(roster, { id: 'extra', displayName: 'Suplente' }, settings);
    const summary = rosterSummary(roster, settings);
    expect(summary.confirmed).toBe(10);
    expect(summary.registered).toBe(11);
  });
});

describe('estado real de la Liga Estabanquitos 2026-1', () => {
  const roster = rosterOf(CONFIRMED_TODAY, settings);

  it('reconoce 6 confirmados y 4 plazas por confirmar', () => {
    const summary = rosterSummary(roster, settings);
    expect(summary.confirmed).toBe(6);
    expect(summary.pending).toBe(4);
    expect(summary.complete).toBe(false);
  });

  it('expone las plazas libres como TBD, sin inventar jugadores', () => {
    const summary = rosterSummary(roster, settings);
    const free = summary.slots.filter((slot) => slot.participant === null);
    expect(free.map((slot) => slot.slot)).toEqual([7, 8, 9, 10]);
    expect(EMPTY_SLOT_LABEL).toBe('TBD / POR CONFIRMAR');
  });

  it('no deja cerrar la plantilla con 6 confirmados', () => {
    const error = expectDomainError(() => assertRosterReady(roster, settings), 'ROSTER_INCOMPLETE');
    expect(error.details['confirmed']).toBe(6);
  });

  it('deja cerrar la plantilla al llegar exactamente a 10', () => {
    let full: Roster = roster;
    for (const name of ['TBD-7', 'TBD-8', 'TBD-9', 'TBD-10']) {
      full = addParticipant(full, { id: slug(name), displayName: name }, settings);
      full = confirmParticipant(full, slug(name), settings);
    }
    expect(() => assertRosterReady(full, settings)).not.toThrow();
    expect(confirmedParticipants(full)).toHaveLength(10);
  });
});

describe('sustitucion de participantes', () => {
  it('traspasa la plaza y el estado al entrante y marca al saliente', () => {
    let roster = rosterOf(['Uno', 'Dos'], settings);
    roster = replaceParticipant(roster, 'dos', { id: 'tres', displayName: 'Tres' }, settings);

    const outgoing = roster.find((participant) => participant.id === 'dos');
    const incoming = roster.find((participant) => participant.id === 'tres');

    expect(outgoing?.status).toBe('REPLACED');
    expect(outgoing?.slot).toBeNull();
    expect(outgoing?.replacedByPlayerId).toBe('tres');
    expect(incoming?.status).toBe('CONFIRMED');
    expect(incoming?.slot).toBe(2);
  });

  it('mantiene el cupo intacto tras la sustitucion', () => {
    let roster = rosterOf(
      Array.from({ length: 10 }, (_, index) => `Jugador ${index + 1}`),
      settings,
    );
    roster = replaceParticipant(
      roster,
      slug('Jugador 3'),
      { id: 'sustituto', displayName: 'Sustituto' },
      settings,
    );
    expect(rosterSummary(roster, settings).confirmed).toBe(10);
    expect(() => assertRosterReady(roster, settings)).not.toThrow();
  });

  it('no sustituye a alguien ya retirado', () => {
    let roster = rosterOf(['Uno'], settings);
    roster = withdrawParticipant(roster, 'uno');
    expectDomainError(
      () => replaceParticipant(roster, 'uno', { id: 'dos', displayName: 'Dos' }, settings),
      'PLAYER_INACTIVE',
    );
  });
});
