// @ts-check
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

/**
 * Renderizado en servidor.
 *
 * La clasificación y el calendario cambian cada jornada, así que un sitio
 * estático obligaría a reconstruir tras cada resultado. Las páginas se
 * renderizan en el servidor consumiendo la API, y React solo se hidrata donde
 * hace falta interacción.
 */
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],

  /**
   * Política de seguridad de contenido.
   *
   * La gestiona Astro porque es quien conoce sus propios scripts: calcula el
   * hash de cada uno y lo añade a `script-src`. Escrita a mano, la política
   * bloquearía la hidratación de las islas de React.
   *
   * `frame-ancestors` no funciona en un `<meta>`, así que el encuadre lo cubre
   * la cabecera `X-Frame-Options` del middleware.
   */
  security: {
    /*
      La comprobación de origen la hace la aplicación, no Astro.

      La de Astro compara la cabecera `Origin` con la URL que el proceso deduce
      de la conexión. Detrás de un proxy —y esta liga se sirve por un túnel— esa
      URL es la interna (`http://127.0.0.1:4321`), nunca la pública, así que
      rechazaría todos los formularios del panel.

      Las dos únicas rutas que escriben (`/api/session` y `/api/admin/...`)
      comprueban el origen contra `PUBLIC_SITE_URL`, que sí sabe cómo llega la
      gente. Ver `src/lib/api/origin.ts`.
    */
    checkOrigin: false,
    csp: {
      directives: [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        "img-src 'self' data:",
        // Las fuentes de la dirección visual.
        'font-src https://fonts.gstatic.com',
        // El sondeo del directo va contra este mismo origen.
        "connect-src 'self'",
      ],
      styleDirective: {
        resources: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      },
      scriptDirective: {
        resources: ["'self'"],
      },
    },
  },

  /**
   * No se renderiza Markdown en ninguna pagina: el resaltado de Shiki solo
   * aportaria estilos en linea incompatibles con la politica de contenido.
   */
  markdown: { syntaxHighlight: false },

  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 4321),
    host: process.env.WEB_HOST ?? '127.0.0.1',
  },
  devToolbar: { enabled: false },
});
