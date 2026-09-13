/**
 * Puente hacia las operaciones administrativas de la API.
 *
 * El navegador no habla con la API: habla con Astro, y Astro reenvía la
 * operación añadiendo la cookie de sesión. Así la sesión sigue siendo
 * `httpOnly`, no hace falta CORS con credenciales y la URL de la API puede ser
 * interna.
 *
 * No es un proxy abierto:
 *
 * - solo reenvía a `/api/v1/admin/...`, nunca a otra ruta ni a otro servidor;
 * - la ruta se compone de segmentos simples, así que no se puede salir con
 *   `..` ni colar una URL absoluta;
 * - exige `Origin` propio, que es lo que impide un envío desde otro sitio;
 * - sin sesión responde 401 sin llegar a llamar a la API.
 *
 * Las reglas de competición no están aquí: las aplica el backend, y este
 * módulo se limita a devolver su respuesta tal cual, incluidos los errores.
 */

import { mismoOrigen } from '../../../lib/api/origin.ts';
import type { APIRoute } from 'astro';

import { ApiError, ApiUnreachableError, request } from '../../../lib/api/client.ts';
import { friendlyError } from '../../../lib/api/messages.ts';
import { sessionHeader } from '../../../lib/api/session.ts';

export const prerender = false;

/** Un segmento de ruta admisible: nada de `..`, barras ni caracteres raros. */
const SEGMENT = /^[A-Za-z0-9_-]+$/;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function forward(
  context: Parameters<APIRoute>[0],
  method: 'POST' | 'PATCH' | 'DELETE',
): Promise<Response> {
  const { params, cookies, url, request: incoming, clientAddress } = context;

  if (!mismoOrigen(incoming, url.origin)) {
    return json({ error: { code: 'FORBIDDEN', message: 'Origen no permitido.' } }, 403);
  }

  const raw = params['path'] ?? '';
  const segments = raw.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0 || !segments.every((segment) => SEGMENT.test(segment))) {
    return json({ error: { code: 'NOT_FOUND', message: 'Operación desconocida.' } }, 404);
  }

  const cookie = sessionHeader(cookies);
  if (cookie === undefined) {
    return json({ error: { code: 'UNAUTHORIZED', message: 'Necesitas iniciar sesión.' } }, 401);
  }

  let body: unknown;
  if (method !== 'DELETE') {
    const text = await incoming.text();
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        return json({ error: { code: 'VALIDATION_ERROR', message: 'Cuerpo inválido.' } }, 400);
      }
    }
  }

  try {
    const payload = await request<unknown>(`/api/v1/admin/${segments.join('/')}`, {
      method,
      cookie,
      forwardedFor: clientAddress,
      ...(body === undefined ? {} : { body }),
    });
    return json(payload ?? { ok: true }, 200);
  } catch (error) {
    const friendly = friendlyError(error);
    const status =
      error instanceof ApiError ? error.status : error instanceof ApiUnreachableError ? 502 : 500;
    return json(
      {
        error: {
          code: friendly.code ?? 'UNKNOWN',
          message: friendly.message,
          details: error instanceof ApiError ? error.details : null,
        },
        requestId: friendly.requestId,
      },
      status,
    );
  }
}

export const POST: APIRoute = (context) => forward(context, 'POST');
export const PATCH: APIRoute = (context) => forward(context, 'PATCH');
export const DELETE: APIRoute = (context) => forward(context, 'DELETE');
