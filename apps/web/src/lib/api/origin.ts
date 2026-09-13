/**
 * ¿Este envío viene de esta web?
 *
 * Parece trivial y no lo es cuando el sitio corre **detrás de un proxy**, que es
 * como se sirve esta liga: un túnel termina el HTTPS y habla con el servidor
 * local por HTTP plano. El servidor reconstruye entonces una URL
 * `http://127.0.0.1:4321` mientras el navegador dice venir de
 * `https://algo.ngrok-free.dev`. Comparadas a ciegas no coinciden, y todos los
 * formularios del panel se rechazan con un 403.
 *
 * La respuesta correcta no es relajar la comprobación: es compararla contra el
 * origen público **configurado** (`PUBLIC_SITE_URL`), que es el único que sabe
 * cómo llega la gente de verdad. La URL que el proceso deduce de la conexión es
 * la interna, y detrás de un proxy nunca es la buena.
 */

import { siteUrl } from '../seo.ts';

/** Quita la barra final para que `https://x/` y `https://x` sean el mismo. */
function normalizar(origen: string): string {
  return origen.replace(/\/+$/, '');
}

/**
 * Orígenes que se aceptan: el público configurado y el que ve el proceso.
 *
 * El segundo hace falta en desarrollo, donde no hay proxy y los dos coinciden,
 * y en las pruebas de extremo a extremo, que hablan con el servidor directo.
 */
function permitidos(requestOrigin: string): readonly string[] {
  return [normalizar(siteUrl()), normalizar(requestOrigin)];
}

/**
 * `true` si el envío puede seguir.
 *
 * Sin cabecera `Origin` se acepta: un `<form>` clásico puede no enviarla, y
 * rechazarlo dejaría el panel inservible en los navegadores que no la mandan.
 */
export function mismoOrigen(incoming: Request, requestOrigin: string): boolean {
  const origin = incoming.headers.get('origin');
  if (origin === null) return true;
  return permitidos(requestOrigin).includes(normalizar(origin));
}
