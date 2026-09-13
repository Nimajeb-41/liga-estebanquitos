/**
 * Cliente de la API oficial de Clash Royale.
 *
 * Vive en el backend y solo en el backend. El token esta ligado a las IP que se
 * declararon al crearlo, asi que ni siquiera funcionaria desde el navegador; y
 * aunque funcionase, exponerlo seria regalar la clave.
 *
 *   Frontend -> nuestro backend -> Clash Royale
 *
 * Nunca al reves.
 *
 * En la Fase 2 este cliente **no se usa**: no hay ninguna ruta que lo invoque.
 * Esta escrito y probado para que la Fase 3 empiece por el spike que despeja
 * las dudas de `docs/clash-royale-api.md`, no por la fontaneria.
 *
 * Lo que si resuelve ya, porque es lo unico que la investigacion dejo claro:
 *
 * - la autenticacion por `Authorization: Bearer`;
 * - el 403 cuando el token no vale o la IP no esta declarada;
 * - el 429 `RequestThrottled`, cuyos umbrales **no estan publicados**: por eso
 *   no se asume ninguno y se reintenta con espera creciente;
 * - el escapado de la etiqueta, que empieza por `#` y hay que codificar.
 */

import {
  ClashRoyaleError,
  type ClashBattle,
  type ClashCardsResponse,
  type ClashCatalogueCard,
  type ClashPlayer,
  type ClashPlayerTag,
} from './types.ts';

export interface ClashRoyaleClientOptions {
  readonly baseUrl: string;
  /** Token del portal de desarrolladores. Nunca se registra ni se devuelve. */
  readonly token: string;
  readonly timeoutMs?: number;
  /** Reintentos ante 429 o fallo del servidor. */
  readonly maxRetries?: number;
  /** Reloj de espera, inyectable para poder probarlo sin esperar de verdad. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly fetch?: typeof globalThis.fetch;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normaliza una etiqueta: mayusculas, con `#` delante y sin espacios.
 *
 * La gente la copia de mil formas (`abc123`, `#abc123`, ` #ABC123 `) y la API
 * solo entiende una.
 */
export function normalizeTag(tag: string): ClashPlayerTag {
  const clean = tag.trim().replace(/^#/, '').toUpperCase();
  return `#${clean}`;
}

/**
 * Forma admisible de una etiqueta.
 *
 * Supercell usa un alfabeto reducido para las etiquetas, pero cual es
 * exactamente no esta documentado en el portal, asi que aqui no se adivina: se
 * exige lo que si se puede afirmar —solo letras y digitos, entre 3 y 15
 * caracteres— y se rechaza todo lo demas.
 *
 * No es cosmetico. La etiqueta llega de un formulario y acaba en la ruta de una
 * URL: sin este filtro, una barra o un `..` podrian sacar la peticion del
 * endpoint previsto. `encodeURIComponent` ya lo evitaria, pero una validacion
 * explicita falla antes y con un mensaje que se entiende.
 */
const TAG_SHAPE = /^#[0-9A-Z]{3,15}$/;

export function isValidTag(tag: string): boolean {
  return TAG_SHAPE.test(normalizeTag(tag));
}

export function assertValidTag(tag: string): ClashPlayerTag {
  const normalized = normalizeTag(tag);
  if (!TAG_SHAPE.test(normalized)) {
    throw new ClashRoyaleError(
      'BAD_REQUEST',
      `"${tag}" no tiene forma de etiqueta de Clash Royale.`,
      null,
      'invalidTag',
    );
  }
  return normalized;
}

/** La etiqueta viaja en la ruta, y su `#` tiene que ir codificado. */
function encodeTag(tag: string): string {
  return encodeURIComponent(assertValidTag(tag));
}

export class ClashRoyaleClient {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: ClashRoyaleClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#token = options.token;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.#sleep = options.sleep ?? defaultSleep;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async getPlayer(tag: string): Promise<ClashPlayer> {
    return this.#get<ClashPlayer>(`/players/${encodeTag(tag)}`);
  }

  /**
   * Batallas recientes.
   *
   * Cuantas devuelve y cuanto se conservan sigue **sin verificar**. Mientras no
   * se compruebe, nada que dependa de este endpoint puede darse por fiable.
   */
  async getBattleLog(tag: string): Promise<readonly ClashBattle[]> {
    return this.#get<ClashBattle[]>(`/players/${encodeTag(tag)}/battlelog`);
  }

  /**
   * Catalogo de cartas.
   *
   * Verificado en el spike: responde `{ items, supportItems }` con 123 cartas
   * y las tropas de torre aparte. Se devuelven las dos listas porque un mazo de
   * batalla trae ambas cosas.
   *
   * Es el unico endpoint que no depende de ningun jugador, asi que sirve
   * ademas para comprobar de un vistazo que el token vale y que la IP esta
   * declarada.
   */
  async getCards(): Promise<{
    readonly cards: readonly ClashCatalogueCard[];
    readonly supportCards: readonly ClashCatalogueCard[];
  }> {
    const payload = await this.#get<ClashCardsResponse | ClashCatalogueCard[]>('/cards');
    // Un array pelado no es lo que devuelve hoy, pero aceptarlo cuesta una
    // linea y evita que un cambio de forma tumbe la sincronizacion entera.
    if (Array.isArray(payload)) return { cards: payload, supportCards: [] };
    return { cards: payload.items ?? [], supportCards: payload.supportItems ?? [] };
  }

  async #get<T>(path: string): Promise<T> {
    let attempt = 0;

    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

      let response: Response;
      try {
        response = await this.#fetch(`${this.#baseUrl}${path}`, {
          headers: {
            authorization: `Bearer ${this.#token}`,
            accept: 'application/json',
          },
          signal: controller.signal,
        });
      } catch (cause) {
        clearTimeout(timer);
        if (attempt < this.#maxRetries) {
          attempt += 1;
          await this.#sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
          continue;
        }
        throw new ClashRoyaleError(
          'UNREACHABLE',
          'No se pudo contactar con la API de Clash Royale.',
          null,
          cause instanceof Error ? cause.name : null,
        );
      } finally {
        clearTimeout(timer);
      }

      if (response.ok) return (await response.json()) as T;

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < this.#maxRetries) {
        attempt += 1;
        // `retry-after` manda si viene; si no, espera creciente. Los umbrales
        // reales no estan publicados, asi que no se adivina ninguno.
        const header = Number(response.headers.get('retry-after'));
        const wait =
          Number.isFinite(header) && header > 0
            ? header * 1000
            : BASE_BACKOFF_MS * 2 ** (attempt - 1);
        await this.#sleep(wait);
        continue;
      }

      throw await toError(response);
    }
  }
}

async function toError(response: Response): Promise<ClashRoyaleError> {
  // El cuerpo puede no ser JSON: un balanceador delante de la API puede
  // devolver HTML. Sin `reason` el error sigue siendo util.
  let reason: string | null;
  try {
    const body = (await response.json()) as { reason?: string };
    reason = body.reason ?? null;
  } catch {
    reason = null;
  }

  switch (response.status) {
    case 400:
      return new ClashRoyaleError('BAD_REQUEST', 'Peticion invalida.', 400, reason);
    case 403:
      return new ClashRoyaleError(
        'FORBIDDEN',
        'La API rechazo el token. Suele significar que la IP del servidor no esta declarada en el portal de desarrolladores.',
        403,
        reason,
      );
    case 404:
      return new ClashRoyaleError('NOT_FOUND', 'Esa etiqueta no existe.', 404, reason);
    case 429:
      return new ClashRoyaleError(
        'THROTTLED',
        'La API limito la peticion (RequestThrottled).',
        429,
        reason,
      );
    default:
      return new ClashRoyaleError(
        'UPSTREAM',
        `La API respondio ${response.status}.`,
        response.status,
        reason,
      );
  }
}
