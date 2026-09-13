/**
 * Efectos de sonido.
 *
 * Lo que se prueba es lo que puede molestar a alguien: que el sitio **no suene**
 * hasta que se lo pidan, que recuerde la elección, y que respete a quien pide
 * menos estímulo. La síntesis en sí no se prueba —jsdom no tiene Web Audio— y
 * tampoco hace falta: si sonara mal se oiría.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** jsdom no trae `matchMedia`. Se declara lo mínimo que el módulo consulta. */
function stubMotion(reduce: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

/** Un contexto de audio de mentira que cuenta cuántas voces se crearon. */
function stubAudio(): { voices: number } {
  const state = { voices: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });

  /*
    Una clase, no un `vi.fn(() => ...)`.

    El módulo hace `new AudioContext()`, y una función flecha no se puede
    construir: lanzaría, el `catch` del módulo lo tragaría y el contexto se
    quedaría en `null`. El test seguiría verde sin haber probado nada.
  */
  class FakeAudioContext {
    readonly currentTime = 0;
    readonly state = 'running';
    readonly destination = {};
    resume = vi.fn();
    createGain = () => ({ gain: param(), connect: vi.fn() });
    createOscillator = () => {
      state.voices += 1;
      return {
        type: 'sine',
        detune: { value: 0 },
        frequency: param(),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    };
  }
  const Ctor = FakeAudioContext;

  /*
    Se pone en `window` y no solo en el global: el módulo lee `window.AudioContext`
    porque es lo que existe en un navegador, y en jsdom los dos no siempre son el
    mismo objeto.
  */
  vi.stubGlobal('AudioContext', Ctor);
  (window as unknown as { AudioContext: unknown }).AudioContext = Ctor;

  return state;
}

async function load() {
  // Módulo con estado propio: se reimporta limpio en cada caso.
  vi.resetModules();
  return import('../src/scripts/sfx.ts');
}

/** El contador de voces del caso en curso. Lo prepara `beforeEach`. */
let audio: { voices: number };

beforeEach(() => {
  window.localStorage.clear();
  stubMotion(false);
  audio = stubAudio();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sonido', () => {
  it('empieza apagado en una visita nueva', async () => {
    // Una web que suena sin que nadie se lo pida es una web que se cierra.
    const sfx = await load();
    sfx.initSfx();

    expect(sfx.isEnabled()).toBe(false);
  });

  it('no suena mientras está apagado', async () => {
    const sfx = await load();
    sfx.initSfx();

    sfx.play('click');

    expect(audio.voices).toBe(0);
  });

  it('recuerda que se encendió', async () => {
    const first = await load();
    first.initSfx();
    first.setEnabled(true);

    const second = await load();
    second.initSfx();

    expect(second.isEnabled()).toBe(true);
  });

  it('quien pide menos movimiento tampoco recibe sonido', async () => {
    /*
      `prefers-reduced-motion` no habla solo de movimiento: quien lo activa
      pide menos estímulo, y un pitido en cada clic es estímulo.
    */
    stubMotion(true);
    const sfx = await load();
    sfx.initSfx();
    sfx.setEnabled(true);

    sfx.play('live');

    expect(audio.voices).toBe(0);
  });

  it('sobrevive a un almacenamiento que lanza', async () => {
    // Ventana privada, o cookies de sitio bloqueadas: leer ya lanza.
    const boom = () => {
      throw new Error('bloqueado');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);

    const sfx = await load();

    expect(() => sfx.initSfx()).not.toThrow();
    expect(sfx.isEnabled()).toBe(false);
    expect(() => sfx.setEnabled(true)).not.toThrow();

    vi.restoreAllMocks();
  });

  it('un sonido con dos voces crea dos osciladores', async () => {
    // `live` lleva una segunda voz desafinada: es lo que suena a sintético.
    const sfx = await load();
    sfx.initSfx();
    sfx.setEnabled(true);
    const afterToggle = audio.voices;

    sfx.play('live');

    expect(audio.voices - afterToggle).toBe(2);
  });
});
