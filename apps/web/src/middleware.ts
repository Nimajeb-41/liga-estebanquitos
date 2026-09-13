/**
 * Cabeceras de seguridad.
 *
 * El frontend es el único origen con el que habla el navegador, así que las
 * cabeceras se ponen aquí. La API tiene las suyas (Helmet) para su propio
 * tráfico.
 *
 * La política de contenido no está aquí: la emite Astro (`security.csp` en
 * `astro.config.mjs`), que es quien conoce el hash de sus propios scripts.
 * Escribirla a mano bloquearía la hidratación. Lo que sí se pone aquí es
 * `X-Frame-Options`, porque `frame-ancestors` no tiene efecto en un `<meta>`.
 */

import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  );

  // Nada bajo /admin se cachea: son datos de sesión.
  if (context.url.pathname.startsWith('/admin')) {
    response.headers.set('Cache-Control', 'no-store');
  }

  return response;
});
