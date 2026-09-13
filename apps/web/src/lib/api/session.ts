/**
 * Sesión administrativa vista desde el servidor de Astro.
 *
 * El navegador solo habla con el origen del frontend. Astro guarda la cookie
 * que emitió la API y la reenvía en cada llamada al backend. Así no hay
 * peticiones del navegador a la API, ni CORS con credenciales, ni token alguno
 * al alcance de JavaScript: la cookie es `httpOnly` en los dos saltos.
 */

import { SESSION_COOKIE, type SessionUser } from '@liga/contracts';
import type { AstroCookies } from 'astro';

import { ApiError } from './client.ts';
import { getCurrentAdmin } from './endpoints.ts';

export { SESSION_COOKIE };

/**
 * Cabecera `cookie` que se reenvía a la API, o `undefined` si no hay sesión.
 */
export function sessionHeader(cookies: AstroCookies): string | undefined {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token === undefined || token.length === 0) return undefined;
  return `${SESSION_COOKIE}=${token}`;
}

/**
 * Identidad del administrador conectado, o `null`.
 *
 * Un 401 o un 403 no son errores de la página: significan que no hay sesión
 * utilizable. Cualquier otro fallo sí se propaga.
 */
export async function currentSession(cookies: AstroCookies): Promise<SessionUser | null> {
  const cookie = sessionHeader(cookies);
  if (cookie === undefined) return null;

  try {
    return await getCurrentAdmin({ cookie });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}

/**
 * Guarda la sesión emitida por la API en el origen del frontend.
 *
 * `secure` solo en producción: en desarrollo se sirve por HTTP y el navegador
 * descartaría la cookie.
 */
export function storeSession(cookies: AstroCookies, token: string, expiresAt: Date): void {
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    path: '/',
    expires: expiresAt,
  });
}

export function clearSession(cookies: AstroCookies): void {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

/**
 * Extrae el token de la cabecera `set-cookie` que devolvió la API.
 *
 * Se lee el valor en lugar de reenviar la cabecera tal cual porque los dos
 * orígenes pueden tener políticas distintas (`secure`, dominio) y quien manda
 * aquí es el del frontend.
 */
export function tokenFromSetCookie(header: string | null): string | null {
  if (header === null || header.length === 0) return null;

  // Varias cookies llegan unidas por comas, y una fecha de expiración también
  // lleva coma («Expires=Wed, 09 Jun 2027»). Se parte solo por las comas que
  // empiezan un par `nombre=`, que es lo que distingue una cookie de la
  // siguiente.
  for (const part of header.split(/,\s*(?=[^\s,;=]+=)/)) {
    const [pair] = part.split(';');
    const separator = pair?.indexOf('=') ?? -1;
    if (pair === undefined || separator <= 0) continue;
    if (pair.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    const value = pair.slice(separator + 1).trim();
    if (value.length > 0) return value;
  }

  return null;
}
