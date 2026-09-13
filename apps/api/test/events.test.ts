/**
 * Capa de eventos internos.
 *
 * Lo que importa aqui no es que el bus reparta mensajes —eso es un `Set`— sino
 * las dos garantias que lo hacen seguro de usar desde un servicio: que un
 * suscriptor roto no puede tumbar la operacion que lo disparo, y que lo que
 * viaja no lleva secretos.
 */

import { describe, expect, it, vi } from 'vitest';

import { createEventBus, createMatchRevisions, type LeagueEvent } from '../src/events.ts';

const event = (matchId = 'match-1'): LeagueEvent => ({
  type: 'MATCH_STATUS_CHANGED',
  at: '2026-10-08T22:00:00.000Z',
  tournamentId: 'torneo-1',
  matchId,
  status: 'LIVE',
});

describe('bus de eventos', () => {
  it('entrega a todos los suscriptores', () => {
    const bus = createEventBus();
    const first = vi.fn();
    const second = vi.fn();
    bus.on(first);
    bus.on(second);

    bus.emit(event());

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('un suscriptor roto no impide que el resto se entere', () => {
    /*
      La operacion que provoco el evento ya termino y es valida. Propagar el
      fallo la haria parecer fallida cuando no lo es.
    */
    const errors: unknown[] = [];
    const bus = createEventBus({ onListenerError: (error) => errors.push(error) });
    const after = vi.fn();

    bus.on(() => {
      throw new Error('me rompo');
    });
    bus.on(after);

    expect(() => bus.emit(event())).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
  });

  it('darse de baja deja de recibir', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    const off = bus.on(listener);

    bus.emit(event());
    off();
    bus.emit(event());

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('revisiones de partido', () => {
  it('empieza en cero para un partido del que no se sabe nada', () => {
    const revisions = createMatchRevisions();
    expect(revisions.get('desconocido')).toBe(0);
  });

  it('sube una vez por cada evento de ese partido', () => {
    const bus = createEventBus();
    const revisions = createMatchRevisions();
    revisions.subscribe(bus);

    bus.emit(event('a'));
    bus.emit(event('a'));
    bus.emit(event('b'));

    expect(revisions.get('a')).toBe(2);
    expect(revisions.get('b')).toBe(1);
  });

  it('un evento que no es de un partido no mueve ningun contador', () => {
    const bus = createEventBus();
    const revisions = createMatchRevisions();
    revisions.subscribe(bus);

    bus.emit({
      type: 'SEASON_FINISHED',
      at: '2026-12-01T00:00:00.000Z',
      tournamentId: 'torneo-1',
    });

    expect(revisions.get('a')).toBe(0);
  });
});
