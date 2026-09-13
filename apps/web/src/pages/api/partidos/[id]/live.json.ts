/**
 * Sondeo del estado de un partido.
 *
 * El navegador solo habla con este origen: Astro consulta la API y devuelve la
 * proyección pública. Así el sondeo no necesita CORS ni conoce la URL interna
 * de la API.
 *
 * Es REST con sondeo, no WebSocket. Para un partido cada pocos segundos es de
 * sobra, y no obliga a mantener conexiones abiertas. Cuando haga falta empujar
 * datos de verdad (Fase 4), este endpoint es el punto donde se cambia.
 */

import type { APIRoute } from 'astro';

import { ApiError } from '../../../../lib/api/client.ts';
import { getMatchLiveState } from '../../../../lib/api/endpoints.ts';
import { friendlyError } from '../../../../lib/api/messages.ts';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const id = params['id'];
  if (typeof id !== 'string' || id.length === 0) {
    return new Response(JSON.stringify({ message: 'Falta el identificador del partido.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    /*
      El estado lo arma la API, no esta pagina. Ahi vive la revision, que es un
      contador en memoria del servidor: rearmarlo aqui obligaria a comparar la
      ficha entera para saber si algo cambio.
    */
    const state = await getMatchLiveState(id);
    return new Response(JSON.stringify(state), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (error) {
    const friendly = friendlyError(error);
    const status = error instanceof ApiError ? error.status : 502;
    return new Response(JSON.stringify({ message: friendly.message }), {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
};
