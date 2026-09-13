/**
 * Formas de la API oficial de Clash Royale.
 *
 * Todo lo que hay aqui se **observo en una respuesta real** durante el spike del
 * 10 de septiembre de 2026 (ver `docs/clash-royale-spike.md`). No hay ni un
 * campo inventado: si no aparecio en la respuesta, no aparece en estos tipos.
 *
 * Casi todo es opcional, y no por comodidad. Es una API de terceros sin
 * contrato publicado: puede añadir campos y puede dejar de enviar alguno sin
 * avisar. El spike ya encontro diferencias entre tipos de batalla —una amistosa
 * no trae `trophyChange`, una de torneo si trae `tournamentTag`—, asi que dar
 * por seguro un campo porque aparecio una vez seria un error.
 */

/** Etiqueta de jugador tal y como la escribe la gente: `#ABC123`. */
export type ClashPlayerTag = string;

/**
 * Iconos de una carta. Las tres variantes se observaron en el catalogo real.
 * `evolutionMedium` solo tiene sentido en cartas con evolucion.
 */
export interface ClashIconUrls {
  readonly medium?: string;
  readonly heroMedium?: string;
  readonly evolutionMedium?: string;
}

/**
 * Una carta dentro del mazo de una batalla.
 *
 * Claves observadas: `name, id, level, evolutionLevel, maxLevel,
 * maxEvolutionLevel, rarity, elixirCost, iconUrls, starLevel`.
 */
export interface ClashCard {
  readonly name?: string;
  readonly id?: number;
  readonly level?: number;
  readonly maxLevel?: number;
  readonly evolutionLevel?: number;
  readonly maxEvolutionLevel?: number;
  readonly starLevel?: number;
  readonly rarity?: string;
  /** Las tropas de torre (`supportCards`) llegan sin coste de elixir. */
  readonly elixirCost?: number;
  readonly iconUrls?: ClashIconUrls;
}

/**
 * Un lado de la batalla. La API usa `team[]` y `opponent[]` con esta forma.
 *
 * Claves observadas: `tag, name, crowns, cards, supportCards, clan,
 * startingTrophies, trophyChange, elixirLeaked, globalRank,
 * kingTowerHitPoints, princessTowersHitPoints`.
 */
export interface ClashBattleSide {
  readonly tag?: ClashPlayerTag;
  readonly name?: string;
  readonly startingTrophies?: number;
  /** Ausente en las amistosas: no reparten trofeos. */
  readonly trophyChange?: number;
  /** Coronas conseguidas. Presente en los 62 lados observados. */
  readonly crowns?: number;
  readonly clan?: { readonly tag?: string; readonly name?: string } | null;
  /** Ocho cartas en todas las batallas observadas. */
  readonly cards?: readonly ClashCard[];
  /** Tropa de torre. Observada con 0 o 1 elementos. */
  readonly supportCards?: readonly ClashCard[];
  readonly elixirLeaked?: number;
  readonly globalRank?: number | null;
  readonly kingTowerHitPoints?: number | null;
  /**
   * Vida de las torres de princesa que seguian en pie. **Su longitud dice
   * cuantas quedaban**: el perdedor de la amistosa observada traia una sola
   * entrada, el ganador dos.
   */
  readonly princessTowersHitPoints?: readonly number[] | null;
}

/**
 * Una batalla del historial.
 *
 * Claves observadas: `type, battleTime, arena, gameMode, deckSelection,
 * isHostedMatch, isLadderTournament, leagueNumber, team, opponent` y, solo en
 * las de torneo, `tournamentTag`.
 *
 * **No existe ningun identificador propio de la batalla.** Se busco y no lo
 * hay; `gameMode.id` y `arena.id` son ids de catalogo. Por eso la deduplicacion
 * se apoya en una huella derivada de los datos. Ver `normalizer.ts`.
 */
export interface ClashBattle {
  /**
   * Tipo de batalla. Valores observados: `friendly`, `PvP`, `tournament`.
   * Es el **unico discriminador fiable** de una amistosa: `isHostedMatch` vino
   * en `false` en la amistosa que se jugo para el spike.
   */
  readonly type?: string;
  /** Formato `20260910T050249.000Z`, sin guiones ni dos puntos. */
  readonly battleTime?: string;
  readonly arena?: { readonly id?: number; readonly name?: string; readonly rawName?: string };
  readonly gameMode?: { readonly id?: number; readonly name?: string };
  /** Como se eligio el mazo. Observado: `collection`. */
  readonly deckSelection?: string;
  readonly isHostedMatch?: boolean;
  readonly isLadderTournament?: boolean;
  readonly leagueNumber?: number;
  /** Solo en las batallas de torneo del juego. */
  readonly tournamentTag?: string;
  readonly team?: readonly ClashBattleSide[];
  readonly opponent?: readonly ClashBattleSide[];
}

export interface ClashPlayer {
  readonly tag: ClashPlayerTag;
  readonly name?: string;
  readonly expLevel?: number;
  readonly trophies?: number;
  readonly bestTrophies?: number;
  readonly clan?: { readonly tag?: string; readonly name?: string } | null;
  readonly currentDeck?: readonly ClashCard[];
}

/**
 * Una carta del catalogo (`GET /cards`).
 *
 * Claves observadas en el catalogo real de 123 cartas: `id, name, elixirCost,
 * rarity, maxLevel, maxEvolutionLevel, iconUrls`. Rarezas observadas: `common`,
 * `rare`, `epic`, `legendary`, `champion`. Las cartas del catalogo **no traen
 * `level`**: ese es un dato del jugador, no de la carta.
 */
export interface ClashCatalogueCard {
  readonly id?: number;
  readonly name?: string;
  readonly elixirCost?: number;
  readonly rarity?: string;
  readonly maxLevel?: number;
  readonly maxEvolutionLevel?: number;
  readonly iconUrls?: ClashIconUrls;
}

/**
 * Respuesta de `GET /cards`.
 *
 * Verificado: devuelve `{ items, supportItems }`. `supportItems` es el catalogo
 * de tropas de torre, las mismas que aparecen como `supportCards` en una
 * batalla.
 */
export interface ClashCardsResponse {
  readonly items?: readonly ClashCatalogueCard[];
  readonly supportItems?: readonly ClashCatalogueCard[];
}

/** Respuesta de error de la API. `reason` es el codigo estable. */
export interface ClashErrorBody {
  readonly reason?: string;
  readonly message?: string;
  readonly type?: string;
}

export type ClashErrorKind =
  /** 400 */
  | 'BAD_REQUEST'
  /** 403: token invalido, caducado o usado desde una IP no declarada. */
  | 'FORBIDDEN'
  /** 404: la etiqueta no existe. */
  | 'NOT_FOUND'
  /** 429: `RequestThrottled`. Los umbrales no estan publicados. */
  | 'THROTTLED'
  /** 500, 503: fallo del lado de Supercell. */
  | 'UPSTREAM'
  /** La peticion no llego a completarse. */
  | 'UNREACHABLE';

export class ClashRoyaleError extends Error {
  readonly kind: ClashErrorKind;
  readonly status: number | null;
  readonly reason: string | null;

  constructor(kind: ClashErrorKind, message: string, status: number | null, reason: string | null) {
    super(message);
    this.name = 'ClashRoyaleError';
    this.kind = kind;
    this.status = status;
    this.reason = reason;
  }
}
