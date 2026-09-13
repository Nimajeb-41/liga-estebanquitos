/**
 * robots.txt
 *
 * El panel de administración no se indexa. Tampoco los endpoints internos que
 * sirven al sondeo del directo, ni los overlays de transmisión: no son páginas
 * del sitio, son fuentes de navegador para OBS, y en un buscador solo serían
 * ruido. No son secretos —enseñan lo mismo que la ficha pública del partido—,
 * simplemente no tienen público fuera de la escena.
 */

import type { APIRoute } from 'astro';

import { siteUrl } from '../lib/seo.ts';

export const prerender = false;

export const GET: APIRoute = () =>
  new Response(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /api/',
      'Disallow: /overlay/',
      '',
      `Sitemap: ${siteUrl()}/sitemap.xml`,
      '',
    ].join('\n'),
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
