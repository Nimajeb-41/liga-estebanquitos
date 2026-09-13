/**
 * Efectos de sonido.
 *
 * Los sonidos se **sintetizan** con la Web Audio API en vez de cargar archivos.
 * Tres razones, por orden de importancia:
 *
 * 1. No hay nada que descargar. Un puñado de MP3 pesa más que toda la web.
 * 2. Funciona sin conexión, que es la mitad del sentido de una PWA.
 * 3. Un bip sintetizado no se puede quedar desafinado respecto al resto: no hay
 *    «resto».
 *
 * Dos reglas que no se negocian:
 *
 * - **Silencio por defecto.** Una web que suena sin que nadie se lo pida es una
 *   web que se cierra. El sonido se enciende desde el interruptor y la elección
 *   se recuerda en este navegador.
 * - **`prefers-reduced-motion` también apaga el sonido.** Quien pide menos
 *   estímulo no se refería solo al movimiento.
 */

const STORAGE_KEY = 'liga:sfx';

export type SfxName = 'hover' | 'click' | 'live' | 'success' | 'error' | 'reveal';

interface Tone {
  /** Frecuencia inicial y final, en Hz. Iguales, si no hay barrido. */
  readonly from: number;
  readonly to: number;
  readonly duration: number;
  readonly type: OscillatorType;
  readonly gain: number;
  /** Un segundo oscilador desafinado. Es lo que suena a «sintético». */
  readonly detune?: number;
}

/**
 * El repertorio.
 *
 * Todo por debajo de 0.09 de ganancia y de 220 ms: son señales, no música. Un
 * sonido de interfaz que se nota es un sonido de interfaz que molesta.
 */
const TONES: Readonly<Record<SfxName, Tone>> = {
  hover: { from: 1180, to: 1180, duration: 0.035, type: 'sine', gain: 0.018 },
  click: { from: 660, to: 880, duration: 0.07, type: 'triangle', gain: 0.045, detune: 12 },
  live: { from: 420, to: 1240, duration: 0.19, type: 'sawtooth', gain: 0.05, detune: -18 },
  success: { from: 620, to: 1320, duration: 0.16, type: 'sine', gain: 0.05 },
  error: { from: 300, to: 150, duration: 0.2, type: 'square', gain: 0.04, detune: 20 },
  reveal: { from: 880, to: 1760, duration: 0.11, type: 'sine', gain: 0.025 },
};

let context: AudioContext | null = null;
let enabled = false;

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Lo que el navegador recuerda de la última visita.
 *
 * Envuelto en `try` porque en ventana privada o con las cookies de sitio
 * bloqueadas el simple hecho de leer lanza. Sin preferencia guardada, silencio.
 */
function stored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function remember(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
  } catch {
    /* Si no se puede guardar, la elección vale solo para esta visita. */
  }
}

/**
 * El contexto se crea tarde a propósito.
 *
 * Los navegadores no dejan arrancar audio sin un gesto del usuario, y crearlo
 * al cargar solo consigue un contexto suspendido y un aviso en la consola.
 */
function audio(): AudioContext | null {
  if (context !== null) return context;
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor === undefined) return null;
  try {
    context = new Ctor();
    return context;
  } catch {
    return null;
  }
}

export function isEnabled(): boolean {
  return enabled;
}

export function setEnabled(value: boolean): void {
  enabled = value;
  remember(value);
  if (value) {
    const ctx = audio();
    // Retomar el contexto es lo que convierte el clic del interruptor en el
    // gesto que el navegador exige.
    if (ctx !== null && ctx.state === 'suspended') void ctx.resume();
    play('success');
  }
  document.documentElement.dataset['sfx'] = value ? 'on' : 'off';
  window.dispatchEvent(new CustomEvent('liga:sfx', { detail: { enabled: value } }));
}

export function play(name: SfxName): void {
  if (!enabled || reducedMotion()) return;
  const ctx = audio();
  if (ctx === null || ctx.state === 'closed') return;

  const tone = TONES[name];
  const now = ctx.currentTime;

  const gain = ctx.createGain();
  /*
    Ataque de 8 ms y caída exponencial. Sin el ataque se oye un chasquido: el
    salto de 0 al volumen final en una sola muestra es, literalmente, un clic.
  */
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(tone.gain, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration);
  gain.connect(ctx.destination);

  const voices: OscillatorNode[] = [];
  const make = (detune: number): OscillatorNode => {
    const osc = ctx.createOscillator();
    osc.type = tone.type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(tone.from, now);
    if (tone.to !== tone.from) {
      osc.frequency.exponentialRampToValueAtTime(tone.to, now + tone.duration);
    }
    osc.connect(gain);
    return osc;
  };

  voices.push(make(0));
  if (tone.detune !== undefined) voices.push(make(tone.detune));

  for (const voice of voices) {
    voice.start(now);
    voice.stop(now + tone.duration + 0.02);
  }
}

/**
 * Engancha el sonido a la página.
 *
 * Se escucha en el documento y no elemento a elemento: el sitio navega con
 * transiciones de vista, y volver a enganchar oyentes en cada cambio de página
 * los iría acumulando.
 */
export function initSfx(): void {
  enabled = stored();
  document.documentElement.dataset['sfx'] = enabled ? 'on' : 'off';

  /*
    `event.target` no siempre es un elemento: entrando o saliendo del documento
    llega el propio `document`, y un nodo de texto tampoco tiene `closest`. Se
    comprueba en vez de afirmarlo con un `as`.
  */
  const armed = (event: Event): HTMLElement | null => {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    return target.closest<HTMLElement>('[data-sfx]');
  };

  /*
    `pointerover` en vez de `pointerenter` porque burbujea: un solo oyente en el
    documento cubre todo, incluido lo que se pinte después.
  */
  document.addEventListener('pointerover', (event) => {
    const target = armed(event);
    if (target === null) return;
    if (target.dataset['sfx'] === 'hover') play('hover');
  });

  document.addEventListener('click', (event) => {
    const target = armed(event);
    if (target === null) return;
    const name = target.dataset['sfx'];
    play(name === 'live' ? 'live' : name === 'error' ? 'error' : 'click');
  });
}
