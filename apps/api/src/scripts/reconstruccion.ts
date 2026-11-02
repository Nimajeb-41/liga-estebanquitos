/**
 * Reconstrucción de la temporada 2026-1.
 *
 *     npm run reconstruccion:sortear
 *
 * En noviembre de 2026 se perdió la base de datos de la liga (`datos/liga`) y,
 * con ella, el registro partido a partido de las jornadas 1 a 7. Sobrevivió la
 * clasificación tras la jornada 7 —una captura del administrador— y la
 * propuesta de cruces para las jornadas 8 y 9. El administrador decidió
 * reconstruir lo perdido por sorteo.
 *
 * Este módulo hace ese sorteo y lo deja escrito en `temporada/2026-1.json`. No
 * toca ninguna base de datos: eso lo hace `restaurar.ts`, leyendo el JSON.
 *
 * Qué se sabe (y por tanto se respeta al pie de la letra):
 *
 * - La clasificación tras la jornada 7: PJ, VG, VP, DC y PTS de cada jugador.
 * - Solo Nimaben y Eli_as ganaron a tres coronas, dos partidos cada uno.
 * - Renuz perdió por incomparecencia los tres partidos que tenía pendientes,
 *   contra Eze23ml, Lucía y Herobrain.
 * - Los cruces de las jornadas 8 y 9.
 *
 * Qué se sortea, porque no se sabe:
 *
 * - **El calendario.** Lo genera el sorteo oficial (`generateFixture`, método
 *   del círculo) con una semilla. Se prueban semillas en orden hasta dar con un
 *   calendario que cumpla los criterios de coherencia de `CRITERIOS`: el
 *   sorteo elige solo entre los calendarios compatibles con lo que se sabe.
 * - **El marcador de cada partido de J1-J7.** Se sortean ganadores y coronas
 *   con la misma semilla, con la única condición de que la tabla resultante
 *   sea exactamente la de la captura.
 *
 * Todo es determinista: con la misma semilla sale el mismo JSON, y cualquiera
 * puede comprobarlo volviendo a ejecutar el sorteo.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  buildStandings,
  createRandom,
  DEFAULT_SETTINGS,
  generateFixture,
  resolveResult,
  shuffle,
  type Fixture,
  type MatchResult,
  type PlayedMatch,
} from '@liga/domain';

/* -------------------------------------------------------------------------- */
/* Lo que se sabe                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Plantilla por plaza. Las seis primeras son las del seed, en su orden; las
 * cuatro siguientes, las que se sumaron después desde el panel.
 *
 * El orden importa: el sorteo oficial baraja a los confirmados ordenados por
 * plaza, así que la misma semilla con otras plazas daría otro calendario.
 */
export const JUGADORES = [
  'Nimaben',
  'Lyuk',
  'Dullys',
  'Esteban',
  'Eze23ml',
  'LeonSB',
  'Eli_as',
  'Lucía',
  'Herobrain',
  'Renuz',
] as const;

export type Jugador = (typeof JUGADORES)[number];

interface FilaTabla {
  readonly pj: number;
  readonly vg: number;
  readonly vp: number;
  readonly dc: number;
  readonly pts: number;
}

/** Clasificación tras la jornada 7, tal como la guardó el administrador. */
export const CAPTURA_J7: Readonly<Record<Jugador, FilaTabla>> = {
  Esteban: { pj: 7, vg: 6, vp: 1, dc: 5, pts: 18 },
  LeonSB: { pj: 7, vg: 6, vp: 1, dc: 3, pts: 18 },
  Lyuk: { pj: 7, vg: 5, vp: 2, dc: 3, pts: 15 },
  Nimaben: { pj: 7, vg: 3, vp: 4, dc: 3, pts: 11 },
  Eli_as: { pj: 7, vg: 3, vp: 4, dc: 1, pts: 11 },
  Eze23ml: { pj: 6, vg: 3, vp: 3, dc: 1, pts: 9 },
  Lucía: { pj: 6, vg: 3, vp: 3, dc: 0, pts: 9 },
  Herobrain: { pj: 6, vg: 2, vp: 4, dc: -4, pts: 6 },
  Dullys: { pj: 7, vg: 1, vp: 6, dc: -7, pts: 3 },
  Renuz: { pj: 4, vg: 0, vp: 4, dc: -5, pts: 0 },
};

/** Victorias a tres coronas. Solo estos dos jugadores las tienen. */
export const VICTORIAS_TRES_CORONAS: Readonly<Partial<Record<Jugador, number>>> = {
  Nimaben: 2,
  Eli_as: 2,
};

/** Cruces de las jornadas 8 y 9 propuestos por el administrador. */
export const PROPUESTA_J8: readonly (readonly [Jugador, Jugador])[] = [
  ['Nimaben', 'Renuz'],
  ['LeonSB', 'Lyuk'],
  ['Eli_as', 'Esteban'],
  ['Eze23ml', 'Dullys'],
  ['Lucía', 'Herobrain'],
];
export const PROPUESTA_J9: readonly (readonly [Jugador, Jugador])[] = [
  ['Lyuk', 'Renuz'],
  ['Nimaben', 'Esteban'],
  ['LeonSB', 'Dullys'],
  ['Eli_as', 'Herobrain'],
  ['Eze23ml', 'Lucía'],
];

/** Partidos de Renuz que estaban pendientes tras J7 y perdió por incomparecencia. */
export const PENDIENTES_RENUZ: readonly Jugador[] = ['Herobrain', 'Lucía', 'Eze23ml'];

/**
 * Victorias por incomparecencia de LeonSB.
 *
 * El administrador recordaba que «puede» que LeonSB ganara así a Renuz y a
 * Eze23ml. No hay datos que lo confirmen ni lo descarten: la tabla admite las
 * dos cosas. Se incluyen porque es lo único que se recuerda, y porque sin ellas
 * el +3 de diferencia de coronas de LeonSB obligaría a seis victorias todas por
 * una corona y una derrota 0-3. Quitarlas es borrar esta lista y volver a
 * sortear.
 */
export const WALKOVERS_RECORDADOS: readonly { ganador: Jugador; ausente: Jugador }[] = [
  { ganador: 'LeonSB', ausente: 'Renuz' },
  { ganador: 'LeonSB', ausente: 'Eze23ml' },
];

/* -------------------------------------------------------------------------- */
/* Fechas                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Una jornada cada domingo a las 20:00 (UTC-03:00), un partido cada
 * quince minutos. La liga se preparó el 13 de septiembre; siete domingos desde
 * el 20 de septiembre llevan la J7 al 1 de noviembre, el día anterior a la
 * reconstrucción. Las fechas de J1-J7 son reconstruidas; las de J8 y J9 son
 * las que se proponen para jugar.
 */
export const PRIMERA_JORNADA = '2026-09-20T20:00:00-03:00';
export const INTERVALO_MINUTOS = 15;
export const JORNADAS_CON_FECHA = 9;

/** Los pendientes de Renuz se reprogramaron al cierre del domingo de la J7. */
export const REPROGRAMACION_PENDIENTES = '2026-11-01T21:15:00-03:00';

const DESFASE_MS = -3 * 60 * 60 * 1000;
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

/** ISO con desfase -03:00, la hora de la liga (sin horario de verano). */
export function isoMenos3(instante: number): string {
  return new Date(instante + DESFASE_MS).toISOString().replace(/\.\d{3}Z$/, '-03:00');
}

/* -------------------------------------------------------------------------- */
/* Sorteo del calendario                                                       */
/* -------------------------------------------------------------------------- */

export const PREFIJO_SEMILLA = 'liga-estabanquitos-2026-1/reconstruccion/';

export const CRITERIOS = [
  'Las jornadas 8 y 9 tienen exactamente los cruces propuestos, en ese orden. Eso obliga a que J1-J7 contengan los otros 35, que es lo que dice la tabla: cada jugador ya enfrentó a 7 rivales.',
  'Coincide en local y visitante con la propuesta en 9 de los 10 partidos de J8 y J9, el máximo posible: ningún calendario del método del círculo coincide en los 10.',
  'Los tres partidos pendientes de Renuz caen en tres jornadas seguidas: una ausencia de tres semanas es más creíble que tres sueltas.',
] as const;

const clave = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** `true` si el calendario cumple los tres criterios de coherencia. */
export function cumpleCriterios(fixture: Fixture): boolean {
  const j8 = fixture.rounds[7]?.matches ?? [];
  const j9 = fixture.rounds[8]?.matches ?? [];

  const mismosCruces = (
    partidos: readonly { homeId: string; awayId: string }[],
    propuesta: readonly (readonly [string, string])[],
  ): boolean => {
    const esperados = new Set(propuesta.map(([a, b]) => clave(a, b)));
    return (
      partidos.length === esperados.size &&
      partidos.every((partido) => esperados.has(clave(partido.homeId, partido.awayId)))
    );
  };
  if (!mismosCruces(j8, PROPUESTA_J8) || !mismosCruces(j9, PROPUESTA_J9)) return false;

  const localVisitante = new Set([...PROPUESTA_J8, ...PROPUESTA_J9].map(([l, v]) => `${l}>${v}`));
  const coincidencias = [...j8, ...j9].filter((partido) =>
    localVisitante.has(`${partido.homeId}>${partido.awayId}`),
  ).length;
  if (coincidencias < 9) return false;

  const jornadas = PENDIENTES_RENUZ.map((rival) => jornadaDe(fixture, 'Renuz', rival)).sort(
    (a, b) => a - b,
  );
  const [primera, segunda, tercera] = jornadas;
  return (
    primera !== undefined &&
    tercera !== undefined &&
    tercera <= 7 &&
    segunda === primera + 1 &&
    tercera === primera + 2
  );
}

/** Jornada de la ida en la que se cruzan dos jugadores. */
function jornadaDe(fixture: Fixture, a: string, b: string): number {
  const ronda = fixture.rounds.find(
    (round) =>
      round.leg === 1 &&
      round.matches.some((match) => clave(match.homeId, match.awayId) === clave(a, b)),
  );
  if (ronda === undefined) throw new Error(`${a} y ${b} no se cruzan en la ida.`);
  return ronda.number;
}

/**
 * Filtro rápido: ¿las jornadas 8 y 9 de este orden son las propuestas?
 *
 * Reproduce el emparejamiento del método del círculo de `generateFixture` solo
 * para esas dos jornadas, sobre índices, para poder probar millones de
 * semillas en segundos. Es solo un filtro: lo que pasa se vuelve a comprobar
 * con el generador oficial.
 */
function jornadas8y9Encajan(orden: readonly number[], j8: Uint8Array, j9: Uint8Array): boolean {
  const fijo = orden[0] as number;
  const giratorio = orden.slice(1);
  const n = giratorio.length;
  const encaja = (ronda: number, objetivo: Uint8Array): boolean => {
    const en = (j: number): number => giratorio[(((j - ronda) % n) + n) % n] as number;
    const parejas: [number, number][] = [
      [fijo, en(n - 1)],
      [en(0), en(n - 2)],
      [en(1), en(n - 3)],
      [en(2), en(n - 4)],
      [en(3), en(n - 5)],
    ];
    return parejas.every(([a, b]) => objetivo[Math.min(a, b) * 10 + Math.max(a, b)] === 1);
  };
  return encaja(7, j8) && encaja(8, j9);
}

export interface CalendarioSorteado {
  readonly semilla: string;
  /** Cuántas semillas se probaron hasta dar con esta. */
  readonly intento: number;
  readonly fixture: Fixture;
}

/**
 * Prueba `PREFIJO_SEMILLA + 1`, `+ 2`... y se queda con la primera semilla
 * cuyo calendario cumple los criterios. Tarda unos segundos.
 */
export function sortearCalendario(maxIntentos = 200_000_000): CalendarioSorteado {
  const indice = new Map<string, number>(JUGADORES.map((nombre, i) => [nombre, i]));
  const tabla = (propuesta: readonly (readonly [string, string])[]): Uint8Array => {
    const marcas = new Uint8Array(100);
    for (const [a, b] of propuesta) {
      const x = indice.get(a) as number;
      const y = indice.get(b) as number;
      marcas[Math.min(x, y) * 10 + Math.max(x, y)] = 1;
    }
    return marcas;
  };
  const j8 = tabla(PROPUESTA_J8);
  const j9 = tabla(PROPUESTA_J9);
  const plazas = JUGADORES.map((_, i) => i);

  for (let intento = 1; intento <= maxIntentos; intento += 1) {
    const semilla = `${PREFIJO_SEMILLA}${intento}`;
    if (!jornadas8y9Encajan(shuffle(plazas, createRandom(semilla)), j8, j9)) continue;
    const fixture = generateFixture([...JUGADORES], { seed: semilla, legs: 2 });
    if (cumpleCriterios(fixture)) return { semilla, intento, fixture };
  }
  throw new Error(`Ninguna de las ${maxIntentos} semillas cumple los criterios.`);
}

/* -------------------------------------------------------------------------- */
/* Sorteo de los resultados de J1-J7                                           */
/* -------------------------------------------------------------------------- */

export interface PartidoIda {
  readonly jornada: number;
  readonly local: Jugador;
  readonly visitante: Jugador;
}

export type Desenlace =
  | { readonly tipo: 'JUGADO'; readonly coronasLocal: number; readonly coronasVisitante: number }
  | { readonly tipo: 'WALKOVER'; readonly ausente: Jugador; readonly pendiente: boolean };

interface Objetivo {
  victorias: number;
  derrotas: number;
  dc: number;
  tresCoronas: number;
}

/** Marcadores posibles de una victoria: [coronas del ganador, del perdedor]. */
const NORMALES = [
  { marcador: [1, 0], peso: 4 },
  { marcador: [2, 1], peso: 3 },
  { marcador: [2, 0], peso: 2 },
] as const;
const TRES_CORONAS = [
  { marcador: [3, 0], peso: 3 },
  { marcador: [3, 1], peso: 2 },
  { marcador: [3, 2], peso: 1 },
] as const;

type Opcion = (typeof NORMALES)[number] | (typeof TRES_CORONAS)[number];

/** Permutación aleatoria ponderada: lo más frecuente tiende a probarse antes. */
function ordenPonderado<T extends { peso: number }>(
  opciones: readonly T[],
  azar: () => number,
): T[] {
  const quedan = opciones.slice();
  const salida: T[] = [];
  while (quedan.length > 0) {
    const total = quedan.reduce((suma, opcion) => suma + opcion.peso, 0);
    let punto = azar() * total;
    let elegido = quedan.length - 1;
    for (let i = 0; i < quedan.length; i += 1) {
      punto -= (quedan[i] as T).peso;
      if (punto < 0) {
        elegido = i;
        break;
      }
    }
    salida.push(...quedan.splice(elegido, 1));
  }
  return salida;
}

/**
 * Sortea ganador y marcador de cada partido jugado de J1-J7 de forma que cada
 * jugador termine con exactamente sus victorias, derrotas, diferencia de
 * coronas y victorias a tres coronas.
 *
 * Dos fases: primero quién gana cada partido (con las victorias y derrotas
 * justas de cada uno), después el marcador (con la DC y las tres coronas
 * justas). Si un reparto de ganadores no admite marcadores, se sortea otro.
 */
export function sortearResultados(
  partidos: readonly PartidoIda[],
  semilla: string,
): Map<PartidoIda, Desenlace> {
  const azar = createRandom(`${semilla}/resultados`);

  const desenlaces = new Map<PartidoIda, Desenlace>();
  const walkovers = new Map<string, { ausente: Jugador; pendiente: boolean }>();
  for (const rival of PENDIENTES_RENUZ) {
    walkovers.set(clave('Renuz', rival), { ausente: 'Renuz', pendiente: true });
  }
  for (const { ganador, ausente } of WALKOVERS_RECORDADOS) {
    walkovers.set(clave(ganador, ausente), { ausente, pendiente: false });
  }

  // Lo que le falta a cada uno una vez descontados los walkovers.
  const objetivo = new Map<Jugador, Objetivo>();
  for (const jugador of JUGADORES) {
    const fila = CAPTURA_J7[jugador];
    objetivo.set(jugador, {
      victorias: fila.vg,
      derrotas: fila.vp,
      dc: fila.dc,
      tresCoronas: VICTORIAS_TRES_CORONAS[jugador] ?? 0,
    });
  }
  // Los pendientes de Renuz no estaban en la captura: se suman como victoria.
  for (const rival of PENDIENTES_RENUZ) {
    (objetivo.get(rival) as Objetivo).victorias += 1;
    (objetivo.get('Renuz') as Objetivo).derrotas += 1;
  }

  const jugados: PartidoIda[] = [];
  for (const partido of partidos) {
    const walkover = walkovers.get(clave(partido.local, partido.visitante));
    if (walkover === undefined) {
      jugados.push(partido);
      continue;
    }
    desenlaces.set(partido, { tipo: 'WALKOVER', ...walkover });
    const ganador = walkover.ausente === partido.local ? partido.visitante : partido.local;
    (objetivo.get(ganador) as Objetivo).victorias -= 1;
    (objetivo.get(walkover.ausente) as Objetivo).derrotas -= 1;
  }
  if (desenlaces.size !== walkovers.size) {
    throw new Error('Algún walkover conocido no corresponde a un partido de J1-J7.');
  }
  for (const jugador of JUGADORES) {
    const meta = objetivo.get(jugador) as Objetivo;
    const cuenta = jugados.filter((p) => p.local === jugador || p.visitante === jugador).length;
    if (meta.victorias < 0 || meta.derrotas < 0 || meta.victorias + meta.derrotas !== cuenta) {
      throw new Error(`Los partidos de ${jugador} no cuadran con su tabla.`);
    }
  }

  for (let intento = 0; intento < 5_000; intento += 1) {
    const ganadores = sortearGanadores(jugados, objetivo, azar);
    if (ganadores === null) continue;
    const marcadores = sortearMarcadores(jugados, ganadores, objetivo, azar);
    if (marcadores === null) continue;

    jugados.forEach((partido, i) => {
      const [deGanador, dePerdedor] = marcadores[i] as readonly [number, number];
      const ganaLocal = ganadores[i] === partido.local;
      desenlaces.set(partido, {
        tipo: 'JUGADO',
        coronasLocal: ganaLocal ? deGanador : dePerdedor,
        coronasVisitante: ganaLocal ? dePerdedor : deGanador,
      });
    });
    return desenlaces;
  }
  throw new Error('No se encontró un reparto de resultados compatible con la tabla.');
}

function sortearGanadores(
  partidos: readonly PartidoIda[],
  objetivo: ReadonlyMap<Jugador, Objetivo>,
  azar: () => number,
): Jugador[] | null {
  const victorias = new Map([...objetivo].map(([j, o]) => [j, o.victorias]));
  const derrotas = new Map([...objetivo].map(([j, o]) => [j, o.derrotas]));
  const ganadores: Jugador[] = [];
  let nodos = 0;

  const asignar = (i: number): boolean => {
    if (i === partidos.length) return true;
    if ((nodos += 1) > 20_000) return false;
    const partido = partidos[i] as PartidoIda;
    const opciones: [Jugador, Jugador][] = [
      [partido.local, partido.visitante],
      [partido.visitante, partido.local],
    ];
    if (azar() < 0.5) opciones.reverse();
    for (const [gana, pierde] of opciones) {
      if ((victorias.get(gana) as number) === 0 || (derrotas.get(pierde) as number) === 0) continue;
      victorias.set(gana, (victorias.get(gana) as number) - 1);
      derrotas.set(pierde, (derrotas.get(pierde) as number) - 1);
      ganadores[i] = gana;
      if (asignar(i + 1)) return true;
      victorias.set(gana, (victorias.get(gana) as number) + 1);
      derrotas.set(pierde, (derrotas.get(pierde) as number) + 1);
    }
    return false;
  };

  return asignar(0) ? ganadores : null;
}

function sortearMarcadores(
  partidos: readonly PartidoIda[],
  ganadores: readonly Jugador[],
  objetivo: ReadonlyMap<Jugador, Objetivo>,
  azar: () => number,
): (readonly [number, number])[] | null {
  const dc = new Map<Jugador, number>(JUGADORES.map((j) => [j, 0]));
  const tresCoronas = new Map([...objetivo].map(([j, o]) => [j, o.tresCoronas]));
  // Partidos aún sin marcador, por jugador: los que gana y los que pierde.
  const ganaPendientes = new Map<Jugador, number>(JUGADORES.map((j) => [j, 0]));
  const pierdeContra = new Map<Jugador, Jugador[]>(JUGADORES.map((j) => [j, []]));
  partidos.forEach((partido, i) => {
    const gana = ganadores[i] as Jugador;
    const pierde = gana === partido.local ? partido.visitante : partido.local;
    ganaPendientes.set(gana, (ganaPendientes.get(gana) as number) + 1);
    (pierdeContra.get(pierde) as Jugador[]).push(gana);
  });

  /** ¿Puede cada jugador llegar todavía a su DC con lo que le queda? */
  const viable = (): boolean =>
    JUGADORES.every((jugador) => {
      const quedanVictorias = ganaPendientes.get(jugador) as number;
      const quedanTres = tresCoronas.get(jugador) as number;
      if (quedanTres > quedanVictorias) return false;
      const rivales = pierdeContra.get(jugador) as Jugador[];
      const minimo = quedanVictorias - rivales.reduce((s, r) => s + margenMaximo(r), 0);
      const maximo = 3 * quedanTres + 2 * (quedanVictorias - quedanTres) - rivales.length;
      const meta = (objetivo.get(jugador) as Objetivo).dc - (dc.get(jugador) as number);
      return minimo <= meta && meta <= maximo;
    });
  const margenMaximo = (ganador: Jugador): number =>
    (tresCoronas.get(ganador) as number) > 0 ? 3 : 2;

  const marcadores: (readonly [number, number])[] = [];
  let nodos = 0;

  const asignar = (i: number): boolean => {
    if (i === partidos.length) return true;
    if ((nodos += 1) > 50_000) return false;
    const partido = partidos[i] as PartidoIda;
    const gana = ganadores[i] as Jugador;
    const pierde = gana === partido.local ? partido.visitante : partido.local;

    const candidatas: Opcion[] = [];
    if ((tresCoronas.get(gana) as number) > 0) candidatas.push(...TRES_CORONAS);
    if ((tresCoronas.get(gana) as number) < (ganaPendientes.get(gana) as number)) {
      candidatas.push(...NORMALES);
    }

    for (const { marcador } of ordenPonderado(candidatas, azar)) {
      const [g, p] = marcador;
      const esTres = g === 3;
      const margen = g - p;
      ganaPendientes.set(gana, (ganaPendientes.get(gana) as number) - 1);
      const rivales = pierdeContra.get(pierde) as Jugador[];
      rivales.splice(rivales.indexOf(gana), 1);
      if (esTres) tresCoronas.set(gana, (tresCoronas.get(gana) as number) - 1);
      dc.set(gana, (dc.get(gana) as number) + margen);
      dc.set(pierde, (dc.get(pierde) as number) - margen);
      marcadores[i] = [g, p];

      if (viable() && asignar(i + 1)) return true;

      dc.set(gana, (dc.get(gana) as number) - margen);
      dc.set(pierde, (dc.get(pierde) as number) + margen);
      if (esTres) tresCoronas.set(gana, (tresCoronas.get(gana) as number) + 1);
      rivales.push(gana);
      ganaPendientes.set(gana, (ganaPendientes.get(gana) as number) + 1);
    }
    return false;
  };

  return viable() && asignar(0) ? marcadores : null;
}

/* -------------------------------------------------------------------------- */
/* La temporada reconstruida                                                   */
/* -------------------------------------------------------------------------- */

export interface ResultadoArchivo {
  readonly local: number;
  readonly visitante: number;
}

export interface WalkoverArchivo {
  readonly ausente: string;
  readonly motivo: string;
  /** Solo los pendientes: se aplazaron en su fecha y se reprogramaron. */
  readonly reprogramadoPara?: string;
}

export interface PartidoArchivo {
  readonly orden: number;
  readonly local: string;
  readonly visitante: string;
  readonly resultado?: ResultadoArchivo;
  readonly walkover?: WalkoverArchivo;
}

export interface JornadaArchivo {
  readonly jornada: number;
  readonly vuelta: number;
  /** Hora del primer partido. Sin fecha = todavía no se acordó. */
  readonly inicio: string | null;
  readonly partidos: readonly PartidoArchivo[];
}

export interface FilaEsperada {
  readonly posicion: number;
  readonly jugador: string;
  readonly pj: number;
  readonly vg: number;
  readonly vp: number;
  readonly dc: number;
  readonly pts: number;
}

export interface TemporadaArchivo {
  readonly formato: 1;
  readonly temporada: string;
  readonly aviso: string;
  readonly zonaHoraria: string;
  readonly jugadores: readonly { readonly nombre: string; readonly plaza: number }[];
  readonly sorteo: {
    readonly semilla: string;
    readonly intento: number;
    readonly criterios: readonly string[];
  };
  readonly intervaloMinutos: number;
  readonly notaResultados: string;
  readonly jornadas: readonly JornadaArchivo[];
  readonly clasificacionEsperada: readonly FilaEsperada[];
}

export const AVISO =
  'Reconstrucción. El registro de las jornadas 1 a 7 se perdió en noviembre de 2026. ' +
  'Lo que se conserva es real: la clasificación tras la J7, quién ganó a tres coronas, ' +
  'los walkovers de Renuz y los cruces de J8 y J9. El orden del calendario, los marcadores ' +
  'de J1-J7 y sus fechas salen de un sorteo con semilla que reproduce exactamente esa ' +
  'clasificación. Se puede regenerar con «npm run reconstruccion:sortear».';

export const NOTA_RESULTADO =
  'Resultado reconstruido por sorteo: el registro original de J1-J7 se perdió. ' +
  'La clasificación tras la J7 es la real.';

/** Construye la temporada a partir de un calendario ya sorteado. */
export function construirTemporada(calendario: CalendarioSorteado): TemporadaArchivo {
  const { fixture, semilla } = calendario;
  if (!cumpleCriterios(fixture)) throw new Error('El calendario no cumple los criterios.');

  const ida: PartidoIda[] = fixture.rounds
    .filter((round) => round.number <= 7)
    .flatMap((round) =>
      round.matches.map((match) => ({
        jornada: round.number,
        local: match.homeId as Jugador,
        visitante: match.awayId as Jugador,
      })),
    );
  const desenlaces = sortearResultados(ida, semilla);

  const inicioJ1 = Date.parse(PRIMERA_JORNADA);
  let reprogramados = 0;

  const jornadas: JornadaArchivo[] = fixture.rounds.map((round) => ({
    jornada: round.number,
    vuelta: round.leg,
    inicio:
      round.number <= JORNADAS_CON_FECHA
        ? isoMenos3(inicioJ1 + (round.number - 1) * SEMANA_MS)
        : null,
    partidos: round.matches.map((match) => {
      const base = { orden: match.order, local: match.homeId, visitante: match.awayId };
      const partido = ida.find(
        (p) =>
          p.jornada === round.number && p.local === match.homeId && p.visitante === match.awayId,
      );
      const desenlace = partido === undefined ? undefined : desenlaces.get(partido);
      if (desenlace === undefined) return base;
      if (desenlace.tipo === 'JUGADO') {
        return {
          ...base,
          resultado: { local: desenlace.coronasLocal, visitante: desenlace.coronasVisitante },
        };
      }
      if (!desenlace.pendiente) {
        return {
          ...base,
          walkover: {
            ausente: desenlace.ausente,
            motivo: `Incomparecencia de ${desenlace.ausente} según recuerda la administración (registro original perdido).`,
          },
        };
      }
      const reprogramadoPara = isoMenos3(
        Date.parse(REPROGRAMACION_PENDIENTES) + reprogramados++ * INTERVALO_MINUTOS * 60_000,
      );
      return {
        ...base,
        walkover: {
          ausente: desenlace.ausente,
          motivo: `${desenlace.ausente} no se presentó al partido pendiente.`,
          reprogramadoPara,
        },
      };
    }),
  }));

  return {
    formato: 1,
    temporada: '2026-1',
    aviso: AVISO,
    zonaHoraria: 'UTC-03:00',
    jugadores: JUGADORES.map((nombre, i) => ({ nombre, plaza: i + 1 })),
    sorteo: { semilla, intento: calendario.intento, criterios: [...CRITERIOS] },
    intervaloMinutos: INTERVALO_MINUTOS,
    notaResultados: NOTA_RESULTADO,
    jornadas,
    clasificacionEsperada: clasificacionDe(jornadas),
  };
}

/** Resultado de un partido del archivo según el motor de la liga; `null` si no se jugó. */
function resultadoDe(partido: PartidoArchivo): MatchResult | null {
  const pareja = { homeId: partido.local, awayId: partido.visitante };
  if (partido.resultado !== undefined) {
    return resolveResult(
      pareja,
      { homeCrowns: partido.resultado.local, awayCrowns: partido.resultado.visitante },
      DEFAULT_SETTINGS,
    );
  }
  if (partido.walkover !== undefined) {
    return resolveResult(
      pareja,
      {
        homeCrowns: 0,
        awayCrowns: 0,
        resolution: 'WALKOVER',
        absentPlayerId: partido.walkover.ausente,
      },
      DEFAULT_SETTINGS,
    );
  }
  return null;
}

/**
 * Clasificación que sale de las jornadas, calculada con el motor de la liga.
 *
 * Antes de devolverla comprueba lo que no puede fallar: que sin los pendientes
 * de Renuz es exactamente la captura de la J7, y que solo Nimaben y Eli_as
 * tienen victorias a tres coronas.
 */
export function clasificacionDe(jornadas: readonly JornadaArchivo[]): FilaEsperada[] {
  const partidos: PlayedMatch[] = [];
  let pendientes = 0;
  for (const jornada of jornadas) {
    for (const partido of jornada.partidos) {
      const resultado = resultadoDe(partido);
      if (resultado === null) continue;
      if (partido.walkover?.reprogramadoPara !== undefined) pendientes += 1;
      partidos.push({
        id: `${jornada.jornada}-${partido.orden}`,
        roundNumber: jornada.jornada,
        leg: jornada.vuelta,
        homeId: partido.local,
        awayId: partido.visitante,
        status: 'COMPLETED',
        result: resultado,
      });
    }
  }

  const tabla = (lista: readonly PlayedMatch[]) =>
    buildStandings({
      playerIds: [...JUGADORES],
      matches: lista,
      sanctions: [],
      settings: DEFAULT_SETTINGS,
    });

  // Comprobación 1: sin los pendientes de Renuz, la captura de la J7.
  const sinPendientes = tabla(
    partidos.filter(
      (p) =>
        !(
          p.result.resolution === 'WALKOVER' &&
          p.result.loserId === 'Renuz' &&
          PENDIENTES_RENUZ.includes(p.result.winnerId as Jugador)
        ),
    ),
  );
  if (pendientes !== PENDIENTES_RENUZ.length) {
    throw new Error('Faltan partidos pendientes de Renuz.');
  }
  for (const fila of sinPendientes) {
    const captura = CAPTURA_J7[fila.playerId as Jugador];
    const real = {
      pj: fila.played,
      vg: fila.wins,
      vp: fila.losses,
      dc: fila.crownDiff,
      pts: fila.points,
    };
    if (JSON.stringify(real) !== JSON.stringify(captura)) {
      throw new Error(
        `${fila.playerId} no coincide con la captura: ${JSON.stringify(real)} frente a ${JSON.stringify(captura)}.`,
      );
    }
    if (fila.maxCrownWins !== (VICTORIAS_TRES_CORONAS[fila.playerId as Jugador] ?? 0)) {
      throw new Error(`${fila.playerId} no tiene las victorias a tres coronas que le tocan.`);
    }
  }

  return tabla(partidos).map((fila) => ({
    posicion: fila.position,
    jugador: fila.playerId,
    pj: fila.played,
    vg: fila.wins,
    vp: fila.losses,
    dc: fila.crownDiff,
    pts: fila.points,
  }));
}

/* -------------------------------------------------------------------------- */
/* Línea de comandos                                                           */
/* -------------------------------------------------------------------------- */

export const RUTA_TEMPORADA = path.resolve(
  import.meta.dirname,
  '../../../../temporada/2026-1.json',
);

function main(): void {
  const inicio = Date.now();
  const calendario = sortearCalendario();
  const temporada = construirTemporada(calendario);

  mkdirSync(path.dirname(RUTA_TEMPORADA), { recursive: true });
  writeFileSync(RUTA_TEMPORADA, `${JSON.stringify(temporada, null, 2)}\n`);

  console.log(
    `Semilla ${calendario.semilla} (intento ${calendario.intento}, ${((Date.now() - inicio) / 1000).toFixed(1)} s).`,
  );
  for (const jornada of temporada.jornadas.slice(0, 9)) {
    const partidos = jornada.partidos.map((p) => {
      const marcador =
        p.resultado !== undefined
          ? ` ${p.resultado.local}-${p.resultado.visitante}`
          : p.walkover !== undefined
            ? ` WO (falta ${p.walkover.ausente})`
            : '';
      return `${p.local}-${p.visitante}${marcador}`;
    });
    console.log(`  J${jornada.jornada}: ${partidos.join(', ')}`);
  }
  console.log('\nClasificación esperada:');
  for (const fila of temporada.clasificacionEsperada) {
    const dc = fila.dc > 0 ? `+${fila.dc}` : String(fila.dc);
    console.log(
      `  ${String(fila.posicion).padStart(2)} ${fila.jugador.padEnd(10)} ${fila.pj} ${fila.vg} ${fila.vp} ${dc.padStart(3)} ${fila.pts}`,
    );
  }
  console.log(`\nEscrito en ${RUTA_TEMPORADA}`);
}

if (process.argv[1] !== undefined && import.meta.filename === process.argv[1]) {
  main();
}
