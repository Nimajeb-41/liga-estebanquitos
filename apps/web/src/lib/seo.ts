/**
 * Metadatos de página.
 *
 * El título y la descripción de cada página se construyen aquí para que las
 * tarjetas de redes sociales digan lo mismo que la página.
 */

export const SITE_NAME = 'Liga Estabanquitos';
export const SITE_SEASON = '2026-1';

/**
 * Origen público del sitio. Se usa en `canonical`, sitemap y Open Graph.
 *
 * Se lee de `process.env` en el servidor por la misma razón que la URL de la
 * API: `import.meta.env` se resuelve al compilar, y el dominio se decide al
 * desplegar.
 */
export function siteUrl(): string {
  const fromProcess =
    import.meta.env.SSR && typeof process !== 'undefined'
      ? process.env['PUBLIC_SITE_URL']
      : undefined;
  const configured = fromProcess ?? import.meta.env.PUBLIC_SITE_URL;
  const base =
    typeof configured === 'string' && configured.length > 0 ? configured : 'http://127.0.0.1:4321';
  return base.replace(/\/+$/, '');
}

export function absoluteUrl(pathname: string): string {
  return `${siteUrl()}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

export interface PageMeta {
  readonly title: string;
  readonly description: string;
  readonly canonical: string;
  /** Imagen de la tarjeta social. Placeholder hasta que exista el arte real. */
  readonly image: string;
  readonly noindex: boolean;
}

export function pageMeta(options: {
  title: string;
  description: string;
  pathname: string;
  image?: string;
  noindex?: boolean;
}): PageMeta {
  const full =
    options.title === SITE_NAME
      ? `${SITE_NAME} ${SITE_SEASON}`
      : `${options.title} · ${SITE_NAME} ${SITE_SEASON}`;

  return {
    title: full,
    description: options.description,
    canonical: absoluteUrl(options.pathname),
    image: absoluteUrl(options.image ?? '/assets/branding/og-default.svg'),
    noindex: options.noindex ?? false,
  };
}
