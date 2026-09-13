/**
 * Estadisticas: de donde sale cada numero.
 *
 * Esta es la distincion que sostiene toda la Fase 4, y es de tipos a proposito:
 * confundir las dos cosas tiene que ser un error de compilacion, no un descuido
 * de maquetacion.
 *
 *   OFICIAL   Se deriva del dominio: partidos finalizados, resultados
 *             confirmados y sanciones. Es lo que decide la clasificacion, y
 *             responde ante el reglamento.
 *
 *   OBSERVADA Se deriva de lo que Clash Royale devolvio. Es evidencia: util,
 *             ilustrativa y **parcial**. No decide nada, y siempre viaja con el
 *             tamaño de la muestra, porque «tres batallas» y «trescientas» no
 *             se leen igual.
 *
 * Un numero observado nunca se presenta sin decir sobre cuantas batallas se
 * calculo. Un numero oficial no lo necesita: se calcula sobre todos los
 * partidos que cuentan, que es una cifra conocida.
 */

/** Procedencia de un dato. */
export type StatisticSource = 'OFFICIAL' | 'OBSERVED';

/**
 * Rendimiento oficial de un participante.
 *
 * Todo sale de partidos **finalizados**. Un aplazado no cuenta como jugado y un
 * disputado no cuenta como definitivo: eso lo decide el dominio antes de llegar
 * aqui, y por eso `played` puede ser menor que los partidos del calendario.
 */
export interface OfficialPlayerStatistics {
  readonly source: 'OFFICIAL';
  readonly playerId: string;

  /* Volumen */
  readonly played: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;

  /* Eficacia. `null` cuando no hay partidos: cero seria mentir. */
  readonly winRate: number | null;
  readonly maxCrownWins: number;
  readonly maxCrownWinRate: number | null;

  /*
    Incomparecencias. A favor = el rival no apareció; en contra = fue este
    participante quien no apareció. Se cuentan aparte porque no son victorias
    ni derrotas normales: no hubo batalla, y sus coronas no se promedian.
  */
  readonly walkoversFor: number;
  readonly walkoversAgainst: number;

  /* Coronas */
  readonly crownsFor: number;
  readonly crownsAgainst: number;
  readonly crownDiff: number;
  readonly averageCrownsFor: number | null;
  readonly averageCrownsAgainst: number | null;

  /* Puntos */
  readonly matchPoints: number;
  readonly sanctionPoints: number;
  readonly points: number;

  /* Rachas */
  readonly currentStreak: { readonly type: 'W' | 'L' | 'D'; readonly length: number } | null;
  readonly bestWinStreak: number;
  readonly worstLossStreak: number;

  /* Reparto local / visitante */
  readonly home: OfficialSplit;
  readonly away: OfficialSplit;
}

/** Rendimiento en una condicion concreta: como local o como visitante. */
export interface OfficialSplit {
  readonly played: number;
  readonly wins: number;
  readonly losses: number;
  readonly crownsFor: number;
  readonly crownsAgainst: number;
  readonly points: number;
  readonly winRate: number | null;
}

/**
 * Un dato observado en un proveedor externo.
 *
 * `sampleSize` no es opcional. Es la mitad del dato: sin el, «usa Hog Rider el
 * 100 % de las veces» puede significar cualquier cosa.
 */
export interface ObservedStatistic<T> {
  readonly source: 'OBSERVED';
  readonly provider: string;
  readonly value: T;
  /** Sobre cuantas batallas observadas se calculo. */
  readonly sampleSize: number;
}

/** Envuelve un valor como observado, obligando a declarar la muestra. */
export function observed<T>(
  value: T,
  sampleSize: number,
  provider = 'CLASH_ROYALE',
): ObservedStatistic<T> {
  return { source: 'OBSERVED', provider, value, sampleSize };
}
