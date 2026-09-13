/**
 * Sesión administrativa.
 *
 * El formulario de acceso envía aquí. Astro llama a la API, recoge la cookie
 * que emite y la vuelve a emitir en su propio origen. El navegador nunca ve el
 * token: es `httpOnly` en los dos saltos, y nunca pasa por `localStorage`.
 *
 * Funciona sin JavaScript: es un `<form>` que responde con una redirección.
 *
 * La llamada se hace con `fetch` directo, y no con el cliente compartido,
 * porque aquí hace falta leer la cabecera `set-cookie` de la respuesta; el
 * cliente compartido solo devuelve el cuerpo.
 */

import type { APIRoute } from 'astro';

import { apiBaseUrl, request } from '../../lib/api/client.ts';
import {
  clearSession,
  sessionHeader,
  storeSession,
  tokenFromSetCookie,
} from '../../lib/api/session.ts';

export const prerender = false;

/** Solo se admiten destinos internos: nadie redirige a otro sitio desde aquí. */
function safeNext(value: FormDataEntryValue | null): string {
  const raw = typeof value === 'string' ? value : '';
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/admin';
}

/** Rechaza envíos que no vengan de este mismo sitio. */
function sameOrigin(incoming: Request, siteOrigin: string): boolean {
  const origin = incoming.headers.get('origin');
  if (origin === null) return true; // Un `<form>` clásico puede no enviarla.
  return origin === siteOrigin;
}

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}

export const POST: APIRoute = async ({ request: incoming, cookies, url, clientAddress }) => {
  if (!sameOrigin(incoming, url.origin)) {
    return new Response('Origen no permitido.', { status: 403 });
  }

  const form = await incoming.formData();
  const next = safeNext(form.get('next'));

  if (form.get('intent') === 'logout') {
    const cookie = sessionHeader(cookies);
    if (cookie !== undefined) {
      try {
        await request('/api/v1/auth/logout', { method: 'POST', cookie, body: {} });
      } catch {
        // Si la API no responde, la sesión de este origen se cierra igualmente.
      }
    }
    clearSession(cookies);
    return redirect('/admin/login');
  }

  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        // Sin esto la API contaría todos los intentos como si vinieran de una
        // sola dirección: diez fallos de cualquiera dejarían fuera al resto.
        'x-forwarded-for': clientAddress,
      },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return redirect('/admin/login?error=api');
  }

  if (!response.ok) {
    const code =
      response.status === 401 ? 'credenciales' : response.status === 429 ? 'limite' : 'error';
    return redirect(`/admin/login?error=${code}`);
  }

  const token = tokenFromSetCookie(response.headers.get('set-cookie'));
  if (token === null) return redirect('/admin/login?error=sin-sesion');

  const payload = (await response.json()) as { expiresAt?: string };
  const expiresAt = payload.expiresAt === undefined ? null : new Date(payload.expiresAt);
  const valid = expiresAt !== null && !Number.isNaN(expiresAt.getTime());

  storeSession(cookies, token, valid ? expiresAt : new Date(Date.now() + 12 * 3600_000));
  return redirect(next);
};
