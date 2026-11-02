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
 * - Los siete partidos de Nimaben en J1-J7, con su marcador.
 * - Los cruces de la jornada 8.
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

export interface ResultadoRecordado {
  readonly ganador: Jugador;
  readonly perdedor: Jugador;
  /** Coronas del ganador primero. */
  readonly coronas: readonly [ganador: number, perdedor: number];
}

/**
 * Resultados de J1-J7 que recuerda el administrador.
 *
 * Cuadran con la tabla: Nimaben y Eli_as recuerdan sus siete partidos, y en los
 * dos casos victorias, derrotas, diferencia de coronas y victorias a tres
 * coronas salen exactas. Del 3-0 de Nimaben a Eli_as, Nimaben recordaba solo
 * que fue a tres coronas; lo que recuerda de Eli_as lo confirma.
 */
export const RESULTADOS_RECORDADOS: readonly ResultadoRecordado[] = [
  // Los siete de Nimaben.
  { ganador: 'Nimaben', perdedor: 'Herobrain', coronas: [1, 0] },
  { ganador: 'Lucía', perdedor: 'Nimaben', coronas: [1, 0] },
  { ganador: 'Nimaben', perdedor: 'Dullys', coronas: [3, 0] },
  { ganador: 'Esteban', perdedor: 'Nimaben', coronas: [1, 0] },
  { ganador: 'Lyuk', perdedor: 'Nimaben', coronas: [1, 0] },
  { ganador: 'LeonSB', perdedor: 'Nimaben', coronas: [1, 0] },
  { ganador: 'Nimaben', perdedor: 'Eli_as', coronas: [3, 0] },
  // Los otros seis de Eli_as.
  { ganador: 'Eli_as', perdedor: 'Renuz', coronas: [3, 0] },
  { ganador: 'Eli_as', perdedor: 'Dullys', coronas: [3, 0] },
  { ganador: 'Eli_as', perdedor: 'Lucía', coronas: [1, 0] },
  { ganador: 'Esteban', perdedor: 'Eli_as', coronas: [1, 0] },
  { ganador: 'Eze23ml', perdedor: 'Eli_as', coronas: [1, 0] },
  { ganador: 'Lyuk', perdedor: 'Eli_as', coronas: [1, 0] },
  // Sueltos de Lyuk, Eze23ml y LeonSB.
  { ganador: 'Herobrain', perdedor: 'Lyuk', coronas: [1, 0] },
  { ganador: 'Lucía', perdedor: 'Lyuk', coronas: [1, 0] },
  { ganador: 'Eze23ml', perdedor: 'Lucía', coronas: [1, 0] },
  { ganador: 'Lyuk', perdedor: 'LeonSB', coronas: [1, 0] },
];

/**
 * Rivales de Nimaben en el orden en que los contó. Del primero dijo que fue la
 * primera fecha, y eso se respeta. El resto («luego», «después», «aquí me
 * olvido») solo sirve para acercarse: con todo lo demás que se sabe, ningún
 * calendario permite J2 Lucía y J3 Dullys, así que ese orden debe de ser el
 * de los partidos jugados, no el de las jornadas.
 */
export const ORDEN_CONTADO_NIMABEN: readonly Jugador[] = [
  'Herobrain',
  'Lucía',
  'Dullys',
  'Esteban',
  'Lyuk',
  'LeonSB',
  'Eli_as',
];

/** Partidos de Renuz que estaban pendientes tras J7 y perdió por incomparecencia. */
export const PENDIENTES_RENUZ: readonly Jugador[] = ['Herobrain', 'Lucía', 'Eze23ml'];

/**
 * Otras victorias por incomparecencia que se recuerdan.
 *
 * LeonSB a Eze23ml está confirmada. LeonSB a Renuz se recordaba como posible, y
 * la tabla la pide: con lo recordado, a LeonSB le quedan cuatro victorias que
 * deben sumar +3 de diferencia de coronas, y eso solo es posible si una de
 * ellas fue sin jugar.
 */
export const WALKOVERS_RECORDADOS: readonly { ganador: Jugador; ausente: Jugador }[] = [
  { ganador: 'LeonSB', ausente: 'Eze23ml' },
  { ganador: 'LeonSB', ausente: 'Renuz' },
];

/**
 * Incomparecencias que nadie recuerda pero la tabla exige.
 *
 * Dullys perdió 0-3 con Nimaben y con Eli_as: −6. Para acabar en −7 con una
 * victoria y cuatro derrotas más, esas cuatro derrotas no pueden ser todas
 * jugadas (sumarían al menos −4 y su victoria, como mucho, +2). Con una sola
 * incomparecencia sale: gana 2-0 y pierde las otras tres por una corona. Contra
 * quién no se sabe: se sortea.
 */
export const AUSENCIAS_EXIGIDAS: readonly Jugador[] = ['Dullys'];

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
  'Todos los partidos recordados, con resultado o por walkover, caen entre la J1 y la J7.',
  'Nimaben juega la primera fecha contra Herobrain.',
  'Los resultados de J1-J7 pueden dar la tabla con una sola incomparecencia además de las recordadas, la de Dullys: el mínimo, porque con lo recordado su diferencia de coronas no sale sin ninguna.',
  'Los rivales de Nimaben, jornada a jornada, se parecen lo más posible al orden en que los contó: 3 inversiones respecto de «Herobrain, Lucía, Dullys y después el resto» y 7 respecto del orden completo, el mínimo con todo lo anterior. Ningún calendario permite J2 Lucía y J3 Dullys a la vez.',
] as const;

const clave = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Parejas que se sabe que ya se enfrentaron en J1-J7. */
const PAREJAS_JUGADAS: readonly (readonly [Jugador, Jugador])[] = [
  ...RESULTADOS_RECORDADOS.map((r) => [r.ganador, r.perdedor] as const),
  ...WALKOVERS_RECORDADOS.map((w) => [w.ganador, w.ausente] as const),
  ...PENDIENTES_RENUZ.map((rival) => ['Renuz', rival] as const),
];

/** Rival de un jugador en una jornada. */
function rivalEn(fixture: Fixture, jornada: number, jugador: string): string | undefined {
  const partido = fixture.rounds
    .find((round) => round.number === jornada)
    ?.matches.find((match) => match.homeId === jugador || match.awayId === jugador);
  if (partido === undefined) return undefined;
  return partido.homeId === jugador ? partido.awayId : partido.homeId;
}

/**
 * Inversiones del orden real de Nimaben respecto del contado: la parcial solo
 * mira a los tres primeros (lo que contó en orden) contra todos los demás; la
 * completa, a todas las parejas.
 */
export function inversionesNimaben(fixture: Fixture): { parcial: number; completa: number } {
  const real = [1, 2, 3, 4, 5, 6, 7].map((n) => rivalEn(fixture, n, 'Nimaben'));
  const posicion = (jugador: string) => real.indexOf(jugador);
  let parcial = 0;
  let completa = 0;
  ORDEN_CONTADO_NIMABEN.forEach((antes, i) => {
    for (const despues of ORDEN_CONTADO_NIMABEN.slice(i + 1)) {
      if (posicion(antes) > posicion(despues)) {
        completa += 1;
        if (i < 3) parcial += 1;
      }
    }
  });
  return { parcial, completa };
}

/** `true` si el calendario cumple los criterios que no dependen de los resultados. */
export function cumpleCriterios(fixture: Fixture): boolean {
  if (PAREJAS_JUGADAS.some(([a, b]) => jornadaDe(fixture, a, b) > 7)) return false;
  if (rivalEn(fixture, 1, 'Nimaben') !== ORDEN_CONTADO_NIMABEN[0]) return false;
  const { parcial, completa } = inversionesNimaben(fixture);
  return parcial <= 3 && completa <= 7;
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
 * Parejas de una jornada de la ida (0 = J1) para un orden de jugadores.
 *
 * Reproduce el emparejamiento del método del círculo de `generateFixture`
 * sobre índices, para poder probar millones de semillas en segundos. Es solo
 * un filtro: lo que pasa se vuelve a comprobar con el generador oficial.
 */
function parejasDeRonda(orden: readonly number[], ronda: number): [number, number][] {
  const fijo = orden[0] as number;
  const giratorio = orden.slice(1);
  const n = giratorio.length;
  const en = (j: number): number => giratorio[(((j - ronda) % n) + n) % n] as number;
  const parejas: [number, number][] = [[fijo, en(n - 1)]];
  for (let i = 0; i < (n - 1) / 2; i += 1) parejas.push([en(i), en(n - 2 - i)]);
  return parejas;
}

export interface CalendarioSorteado {
  readonly semilla: string;
  /** Cuántas semillas se probaron hasta dar con esta. */
  readonly intento: number;
  readonly fixture: Fixture;
}

/**
 * Prueba `PREFIJO_SEMILLA + 1`, `+ 2`... y se queda con la primera semilla
 * cuyo calendario cumple los criterios y admite resultados. Tarda unos
 * segundos.
 */
export function sortearCalendario(maxIntentos = 200_000_000): CalendarioSorteado {
  const indice = new Map<string, number>(JUGADORES.map((nombre, i) => [nombre, i]));
  const nimaben = indice.get('Nimaben') as number;
  const primerRival = indice.get(ORDEN_CONTADO_NIMABEN[0] as string) as number;
  const jugadas = new Uint8Array(100);
  for (const [a, b] of PAREJAS_JUGADAS) {
    const x = indice.get(a) as number;
    const y = indice.get(b) as number;
    jugadas[Math.min(x, y) * 10 + Math.max(x, y)] = 1;
  }
  const plazas = JUGADORES.map((_, i) => i);

  const encaja = (orden: readonly number[]): boolean =>
    parejasDeRonda(orden, 0).some(
      ([a, b]) => (a === nimaben && b === primerRival) || (b === nimaben && a === primerRival),
    ) &&
    [7, 8].every((ronda) =>
      parejasDeRonda(orden, ronda).every(
        ([a, b]) => jugadas[Math.min(a, b) * 10 + Math.max(a, b)] === 0,
      ),
    );

  for (let intento = 1; intento <= maxIntentos; intento += 1) {
    const semilla = `${PREFIJO_SEMILLA}${intento}`;
    if (!encaja(shuffle(plazas, createRandom(semilla)))) continue;
    const fixture = generateFixture([...JUGADORES], { seed: semilla, legs: 2 });
    if (!cumpleCriterios(fixture)) continue;
    try {
      sortearResultados(partidosDeIda(fixture), semilla);
    } catch {
      continue;
    }
    return { semilla, intento, fixture };
  }
  throw new Error(`Ninguna de las ${maxIntentos} semillas cumple los criterios.`);
}

function partidosDeIda(fixture: Fixture): PartidoIda[] {
  return fixture.rounds
    .filter((round) => round.number <= 7)
    .flatMap((round) =>
      round.matches.map((match) => ({
        jornada: round.number,
        local: match.homeId as Jugador,
        visitante: match.awayId as Jugador,
      })),
    );
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
  | {
      readonly tipo: 'JUGADO';
      readonly coronasLocal: number;
      readonly coronasVisitante: number;
      /** `true` si el marcador sale de un recuerdo y no del sorteo. */
      readonly recordado: boolean;
    }
  | {
      readonly tipo: 'WALKOVER';
      readonly ausente: Jugador;
      /** Pendiente de Renuz, recordado, o exigido por la tabla. */
      readonly origen: 'PENDIENTE' | 'RECORDADO' | 'EXIGIDO';
    };

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
 * Los walkovers y los partidos de Nimaben no se sortean: se ponen como se
 * recuerdan y se descuentan de lo que le falta a cada uno.
 *
 * Dos fases para el resto: primero quién gana cada partido (con las victorias
 * y derrotas justas de cada uno), después el marcador (con la DC y las tres
 * coronas justas). Si un reparto de ganadores no admite marcadores, se sortea
 * otro.
 */
export function sortearResultados(
  partidos: readonly PartidoIda[],
  semilla: string,
): Map<PartidoIda, Desenlace> {
  const azar = createRandom(`${semilla}/resultados`);

  const desenlaces = new Map<PartidoIda, Desenlace>();
  const walkovers = new Map<string, { ausente: Jugador; origen: 'PENDIENTE' | 'RECORDADO' }>();
  for (const rival of PENDIENTES_RENUZ) {
    walkovers.set(clave('Renuz', rival), { ausente: 'Renuz', origen: 'PENDIENTE' });
  }
  for (const { ganador, ausente } of WALKOVERS_RECORDADOS) {
    walkovers.set(clave(ganador, ausente), { ausente, origen: 'RECORDADO' });
  }
  const recordados = new Map(RESULTADOS_RECORDADOS.map((r) => [clave(r.ganador, r.perdedor), r]));

  // Lo que le falta a cada uno una vez descontado lo que se sabe.
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
  const meta = (jugador: Jugador) => objetivo.get(jugador) as Objetivo;

  const libres: PartidoIda[] = [];
  for (const partido of partidos) {
    const walkover = walkovers.get(clave(partido.local, partido.visitante));
    if (walkover !== undefined) {
      desenlaces.set(partido, { tipo: 'WALKOVER', ...walkover });
      const ganador = walkover.ausente === partido.local ? partido.visitante : partido.local;
      meta(ganador).victorias -= 1;
      meta(walkover.ausente).derrotas -= 1;
      continue;
    }

    const recuerdo = recordados.get(clave(partido.local, partido.visitante));
    if (recuerdo !== undefined) {
      const [deGanador, dePerdedor] = recuerdo.coronas;
      const ganaLocal = partido.local === recuerdo.ganador;
      desenlaces.set(partido, {
        tipo: 'JUGADO',
        coronasLocal: ganaLocal ? deGanador : dePerdedor,
        coronasVisitante: ganaLocal ? dePerdedor : deGanador,
        recordado: true,
      });
      const margen = deGanador - dePerdedor;
      meta(recuerdo.ganador).victorias -= 1;
      meta(recuerdo.ganador).dc -= margen;
      if (deGanador === 3) meta(recuerdo.ganador).tresCoronas -= 1;
      meta(recuerdo.perdedor).derrotas -= 1;
      meta(recuerdo.perdedor).dc += margen;
      continue;
    }

    libres.push(partido);
  }
  if (desenlaces.size !== walkovers.size + recordados.size) {
    throw new Error('Algún walkover o resultado recordado no corresponde a un partido de J1-J7.');
  }

  /*
    Las incomparecencias exigidas: se prueba contra qué rival, en orden
    aleatorio, hasta dar con una que admita el resto de resultados.
  */
  const probar = (ausencias: readonly Jugador[], jugados: readonly PartidoIda[]): boolean => {
    const [ausente, ...resto] = ausencias;
    if (ausente === undefined) {
      for (const jugador of JUGADORES) {
        const m = meta(jugador);
        const cuenta = jugados.filter((p) => p.local === jugador || p.visitante === jugador).length;
        if (m.victorias < 0 || m.derrotas < 0 || m.tresCoronas < 0) return false;
        if (m.victorias + m.derrotas !== cuenta) return false;
      }
      for (let intento = 0; intento < 300; intento += 1) {
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
            recordado: false,
          });
        });
        return true;
      }
      return false;
    }

    const opciones = ordenPonderado(
      jugados
        .filter((p) => p.local === ausente || p.visitante === ausente)
        .map((partido) => ({ partido, peso: 1 })),
      azar,
    );
    for (const { partido } of opciones) {
      const rival = partido.local === ausente ? partido.visitante : partido.local;
      meta(rival).victorias -= 1;
      meta(ausente).derrotas -= 1;
      desenlaces.set(partido, { tipo: 'WALKOVER', ausente, origen: 'EXIGIDO' });
      if (
        probar(
          resto,
          jugados.filter((p) => p !== partido),
        )
      )
        return true;
      desenlaces.delete(partido);
      meta(rival).victorias += 1;
      meta(ausente).derrotas += 1;
    }
    return false;
  };

  if (!probar(AUSENCIAS_EXIGIDAS, libres)) {
    throw new Error('No se encontró un reparto de resultados compatible con la tabla.');
  }
  return desenlaces;
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
  /** Nota propia del resultado. Sin ella se usa `notaResultados`. */
  readonly nota?: string;
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
  'los walkovers de Renuz y de LeonSB y los resultados que recuerda la administración ' +
  '(los siete de Nimaben y de Eli_as, y algunos de Lyuk, Eze23ml y LeonSB). El orden del ' +
  'calendario, el resto de marcadores de J1-J7, una incomparecencia de Dullys que la tabla ' +
  'exige y las fechas salen de un sorteo con semilla que reproduce exactamente esa ' +
  'clasificación. Los cruces de J8 y J9 salen de ese calendario: la propuesta inicial ' +
  'incluía partidos ya jugados. Se puede regenerar con «npm run reconstruccion:sortear».';

export const NOTA_RESULTADO =
  'Resultado reconstruido por sorteo: el registro original de J1-J7 se perdió. ' +
  'La clasificación tras la J7 es la real.';

export const NOTA_RECORDADO =
  'Resultado según lo recuerda la administración: el registro original de J1-J7 se perdió.';

/** Construye la temporada a partir de un calendario ya sorteado. */
export function construirTemporada(calendario: CalendarioSorteado): TemporadaArchivo {
  const { fixture, semilla } = calendario;
  if (!cumpleCriterios(fixture)) throw new Error('El calendario no cumple los criterios.');

  const ida = partidosDeIda(fixture);
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
          ...(desenlace.recordado ? { nota: NOTA_RECORDADO } : {}),
        };
      }
      if (desenlace.origen !== 'PENDIENTE') {
        return {
          ...base,
          walkover: {
            ausente: desenlace.ausente,
            motivo:
              desenlace.origen === 'RECORDADO'
                ? `Incomparecencia de ${desenlace.ausente} según recuerda la administración (registro original perdido).`
                : `Incomparecencia de ${desenlace.ausente} reconstruida: con los resultados recordados, la clasificación la exige. El rival es sorteado (registro original perdido).`,
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
