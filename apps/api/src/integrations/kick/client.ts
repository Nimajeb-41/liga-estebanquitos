/**
 * Estado del canal de Kick.
 *
 * Responde una sola pregunta: **¿está emitiendo ahora, y está jugando a Clash
 * Royale?**. Nada más. No trae chat, ni espectadores, ni historial.
 *
 * Lo que hay que saber antes de tocar esto:
 *
 * La API pública de Kick **no está documentada oficialmente**. Funciona, la usa
 * mucha gente, y puede cambiar o dejar de responder sin aviso. Por eso todo aquí
 * está construido para fallar bien:
 *
 * - Una respuesta que no se entiende se trata como «no lo sé», nunca como «no
 *   está en directo». La diferencia importa: si Kick cambia la forma del JSON,
 *   la web debe decir que no puede comprobarlo, no afirmar que no hay directo.
 * - Un corte de red no tumba nada: se devuelve el último estado conocido
 *   marcado como viejo.
 * - Hay cortafuegos. Tras varios fallos seguidos se deja de llamar durante un
 *   rato, para no castigar a un servicio que ya está mal.
 *
 * Es el mismo criterio que la liga aplica a Supercell y a **P-11**: se afirma lo
 * que se puede comprobar, y lo que no, se dice que no se sabe.
 */

/** Qué sabemos del canal. `UNKNOWN` no es `OFFLINE`. */
export type KickChannelState = 'LIVE' | 'OFFLINE' | 'UNKNOWN';

export interface KickStatus {
  readonly state: KickChannelState;
  /** Título de la emisión, si la hay. */
  readonly title: string | null;
  /** Categoría tal y como la publica Kick. */
  readonly category: string | null;
  /** Si esa categoría es Clash Royale. */
  readonly playingClashRoyale: boolean;
  /** Cuándo empezó la emisión. */
  readonly startedAt: string | null;
  /** Cuándo se consultó de verdad. Puede ser viejo si Kick no responde. */
  readonly checkedAt: string;
  /** Por qué no se sabe, cuando `state` es `UNKNOWN`. Para el panel, no para el público. */
  readonly reason: string | null;
}

export interface KickClientOptions {
  readonly slug: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  /** Cuánto vale una respuesta antes de volver a preguntar. */
  readonly cacheSeconds?: number;
  /** Fallos seguidos antes de dejar de llamar un rato. */
  readonly breakerFailures?: number;
  readonly breakerCooldownSeconds?: number;
  readonly now?: () => Date;
  /** Inyectable para los tests: no se llama a Kick de verdad en `npm test`. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Cómo se reconoce Clash Royale.
 *
 * Kick escribe la categoría como texto libre y el slug con mayúsculas
 * inconsistentes (`Clash-Royale`). Se comparan en minúsculas y sin separadores
 * para que un guion de más no rompa la comprobación.
 */
const CLASH_ROYALE = 'clashroyale';

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isClashRoyale(value: string | null): boolean {
  return value !== null && normalize(value) === CLASH_ROYALE;
}

/* -------------------------------------------------------------------------- */
/* Lectura defensiva de la respuesta                                           */
/* -------------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Saca la categoría de una emisión.
 *
 * Kick la ha puesto en sitios distintos según la versión (`categories[0]`,
 * `category`), así que se prueban las formas conocidas en vez de asumir una. Si
 * ninguna encaja, se devuelve `null` y arriba se decide qué significa.
 */
function readCategory(livestream: Record<string, unknown>): string | null {
  const categories = livestream['categories'];
  if (Array.isArray(categories) && categories.length > 0) {
    const first = asRecord(categories[0]);
    if (first !== null) return asString(first['name']) ?? asString(first['slug']);
  }

  const category = asRecord(livestream['category']);
  if (category !== null) return asString(category['name']) ?? asString(category['slug']);

  return asString(livestream['category']);
}

/* -------------------------------------------------------------------------- */
/* Cliente                                                                     */
/* -------------------------------------------------------------------------- */

export class KickClient {
  private readonly slug: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly cacheMs: number;
  private readonly breakerFailures: number;
  private readonly breakerCooldownMs: number;
  private readonly now: () => Date;
  private readonly fetchImpl: typeof fetch;

  private cached: KickStatus | null = null;
  private cachedAt = 0;
  private failures = 0;
  private openUntil = 0;

  constructor(options: KickClientOptions) {
    this.slug = options.slug;
    this.baseUrl = options.baseUrl ?? 'https://kick.com/api/v2/channels';
    this.timeoutMs = options.timeoutMs ?? 6000;
    this.cacheMs = (options.cacheSeconds ?? 45) * 1000;
    this.breakerFailures = options.breakerFailures ?? 3;
    this.breakerCooldownMs = (options.breakerCooldownSeconds ?? 300) * 1000;
    this.now = options.now ?? (() => new Date());
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Estado del canal, de caché o de la red. Nunca lanza. */
  async status(): Promise<KickStatus> {
    const nowMs = this.now().getTime();

    if (this.cached !== null && nowMs - this.cachedAt < this.cacheMs) return this.cached;

    /*
      Cortafuegos abierto: no se llama. Se devuelve lo último que se supo, o
      «no lo sé» si nunca se supo nada. Insistir contra un servicio caído solo
      añade latencia a cada visita de la web.
    */
    if (nowMs < this.openUntil) {
      return this.cached ?? this.unknown('Kick no responde; se reintenta más tarde.');
    }

    try {
      const status = await this.fetchStatus();
      this.failures = 0;
      this.cached = status;
      this.cachedAt = nowMs;
      return status;
    } catch (error) {
      this.failures += 1;
      if (this.failures >= this.breakerFailures) this.openUntil = nowMs + this.breakerCooldownMs;

      const reason = error instanceof Error ? error.message : 'error desconocido';
      /*
        Se devuelve lo último conocido si lo hay. Es viejo, pero es información;
        inventar `OFFLINE` seria afirmar algo que no se ha comprobado.
      */
      return this.cached ?? this.unknown(reason);
    }
  }

  private unknown(reason: string): KickStatus {
    return {
      state: 'UNKNOWN',
      title: null,
      category: null,
      playingClashRoyale: false,
      startedAt: null,
      checkedAt: this.now().toISOString(),
      reason,
    };
  }

  private async fetchStatus(): Promise<KickStatus> {
    const response = await this.fetchImpl(`${this.baseUrl}/${encodeURIComponent(this.slug)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) throw new Error(`Kick respondió ${response.status}`);

    const body = asRecord(await response.json());
    if (body === null) throw new Error('Kick devolvió algo que no es un objeto');

    /*
      `livestream` ausente no es lo mismo que `livestream: null`.

      `null` es la respuesta de Kick para «este canal no está emitiendo»: es un
      hecho. Que la clave no venga significa que la forma cambió, y eso es «no
      lo sé». Confundirlos haría que un cambio de la API se presentara como que
      nadie está emitiendo.
    */
    if (!('livestream' in body)) {
      return this.unknown('La respuesta de Kick no trae el campo esperado.');
    }

    const livestream = asRecord(body['livestream']);
    const checkedAt = this.now().toISOString();

    if (livestream === null) {
      return {
        state: 'OFFLINE',
        title: null,
        category: null,
        playingClashRoyale: false,
        startedAt: null,
        checkedAt,
        reason: null,
      };
    }

    const category = readCategory(livestream);
    return {
      state: 'LIVE',
      title: asString(livestream['session_title']) ?? asString(livestream['title']),
      category,
      playingClashRoyale: isClashRoyale(category),
      startedAt: asString(livestream['start_time']) ?? asString(livestream['created_at']),
      checkedAt,
      reason: null,
    };
  }
}
