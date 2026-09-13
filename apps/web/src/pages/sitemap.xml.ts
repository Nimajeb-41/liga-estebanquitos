/**
 * Sitemap.
 *
 * Se genera con los datos reales: las jornadas que existen, los partidos del
 * calendario y los participantes dados de alta. Si el calendario todavía no
 * está publicado, el sitemap solo lleva las páginas fijas: no se inventan URL
 * que devolverían 404.
 *
 * El panel de administración no entra.
 */

import type { APIRoute } from 'astro';

import { getFixture, getPlayers } from '../lib/api/endpoints.ts';
import { absoluteUrl } from '../lib/seo.ts';

export const prerender = false;

const STATIC_PATHS = [
  '/',
  '/clasificacion',
  '/calendario',
  '/jornadas',
  '/partidos',
  '/jugadores',
  '/estadisticas',
  '/transmision',
  '/cara-a-cara',
  '/cartas',
  '/sanciones',
  '/reglamento',
  '/sobre-la-liga',
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async () => {
  const paths = [...STATIC_PATHS];

  // Si la API no responde, se sirve el sitemap con lo que no depende de ella.
  try {
    const [fixture, players] = await Promise.all([getFixture(), getPlayers()]);

    for (const round of fixture.rounds) {
      paths.push(`/jornadas/${round.number}`);
      for (const match of round.matches) paths.push(`/partidos/${match.id}`);
    }
    for (const player of players.players) {
      paths.push(`/jugadores/${player.slug}`);
    }
  } catch {
    // Sin datos, el sitemap se queda en las páginas fijas.
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((path) => `  <url><loc>${escapeXml(absoluteUrl(path))}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
