/**
 * Cliente HTTP de la API.
 *
 * Un único sitio conoce la URL base, las cabeceras, la propagación de la sesión
 * y la forma de los errores. Ningún componente hace `fetch` por su cuenta.
 *
 * No lleva Zod a propósito: la validación contra el contrato vive en
 * `endpoints.ts`, que solo se ejecuta en el servidor. Así el navegador no carga
 * el validador para hacer un sondeo.
 */

export interface ApiErrorBody {
  readonly error: { readonly code: string; readonly message: string; readonly details?: unknown };
  readonly requestId: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | null;

  constructor(
    status: number,
    code: string,
    message: string,
    details: unknown,
    requestId: string | null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

/**
 * La respuesta no encaja en el contrato.
 *
 * Casi siempre significa que el backend y el frontend van a versiones
 * distintas. Es preferible fallar aquí, con un mensaje claro, a romperse a
 * mitad de renderizado con un `undefined`.
 */
export class ContractError extends Error {
  constructor(path: string, issues: string) {
    super(`La respuesta de ${path} no cumple el contrato de la API:
${issues}`);
    this.name = 'ContractError';
  }
}

/** La API no respondió (caída, red, timeout). */
export class ApiUnreachableError extends Error {
  constructor(cause: unknown) {
    super('No se pudo contactar con la API.');
    this.name = 'ApiUnreachableError';
    this.cause = cause;
  }
}

/**
 * Lee una variable de entorno.
 *
 * En el servidor manda `process.env`: `import.meta.env` se resuelve al
 * compilar, asi que una URL puesta al arrancar el proceso no llegaria nunca.
 * Esto es lo que permite desplegar la misma build contra otra API.
 *
 * En el navegador solo existe `import.meta.env`, y solo con las variables
 * `PUBLIC_`, que son las unicas que Astro deja salir.
 */
function readEnv(name: string): string | undefined {
  if (import.meta.env.SSR && typeof process !== 'undefined') {
    const value = process.env[name];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  const fromBuild = (import.meta.env as Record<string, unknown>)[name];
  return typeof fromBuild === 'string' && fromBuild.length > 0 ? fromBuild : undefined;
}

/**
 * URL base de la API.
 *
 * En el servidor puede apuntar a la red interna (`API_URL`); en el navegador
 * tiene que ser una URL alcanzable desde fuera (`PUBLIC_API_URL`).
 */
export function apiBaseUrl(): string {
  const fromServer = readEnv('API_URL');
  const fromPublic = readEnv('PUBLIC_API_URL');
  const base =
    (import.meta.env.SSR ? (fromServer ?? fromPublic) : fromPublic) ?? 'http://127.0.0.1:3000';
  return base.replace(/\/+$/, '');
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  /** Cookie de sesión que reenvía el servidor de Astro hacia la API. */
  readonly cookie?: string | undefined;
  /**
   * IP del visitante.
   *
   * Sin esto la API vería siempre la del servidor de Astro y su límite de
   * intentos de acceso sería común a todo el mundo: diez fallos de cualquiera
   * dejarían fuera al resto.
   */
  readonly forwardedFor?: string | undefined;
  readonly signal?: AbortSignal | undefined;
  /** Milisegundos antes de abandonar la petición. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8000;

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${apiBaseUrl()}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  if (options.signal !== undefined) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.cookie === undefined ? {} : { cookie: options.cookie }),
        ...(options.forwardedFor === undefined ? {} : { 'x-forwarded-for': options.forwardedFor }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
      // La sesión viaja en cookie httpOnly; en el navegador hay que pedirla.
      credentials: import.meta.env.SSR ? 'omit' : 'include',
    });
  } catch (error) {
    throw new ApiUnreachableError(error);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text.length === 0 ? null : safeJson(text);

  if (!response.ok) {
    const body = payload as Partial<ApiErrorBody> | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? `La API respondió ${response.status}.`,
      body?.error?.details ?? null,
      body?.requestId ?? null,
    );
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
