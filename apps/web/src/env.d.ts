/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** URL de la API vista desde el servidor de Astro. */
  readonly API_URL?: string;
  /** URL de la API vista desde el navegador. */
  readonly PUBLIC_API_URL?: string;
  /** Segundos entre sondeos de un partido en directo. */
  readonly PUBLIC_LIVE_POLL_SECONDS?: string;
  /** Origen publico del sitio, para canonical, sitemap y Open Graph. */
  readonly PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
