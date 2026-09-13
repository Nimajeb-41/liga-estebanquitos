# @liga/web

Frontend público y panel de administración de la Liga Estabanquitos 2026-1.

**Astro** con renderizado en servidor, **React** solo donde hay interacción,
**Tailwind 4** y **GSAP** para la portada. Habla únicamente con `@liga/api`:
nunca con la base de datos, nunca con la API de Clash Royale.

## Arrancar

Con la API en marcha (`npm run demo` desde la raíz, en otra terminal):

```bash
npm run dev --workspace=@liga/web
```

- Sitio: `http://127.0.0.1:4321`
- Panel: `http://127.0.0.1:4321/admin`

## Comandos

| Comando             | Qué hace                             |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Servidor de desarrollo               |
| `npm run build`     | Construye el servidor en `dist/`     |
| `npm run preview`   | Sirve lo construido                  |
| `npm test`          | Tests de componente (Vitest + jsdom) |
| `npm run typecheck` | `astro check`                        |

En producción se arranca con `node dist/server/entry.mjs`.

## Variables de entorno

| Variable                   | Para qué                                        |
| -------------------------- | ----------------------------------------------- |
| `API_URL`                  | URL de la API vista desde el servidor           |
| `PUBLIC_API_URL`           | URL de la API vista desde el navegador          |
| `PUBLIC_SITE_URL`          | Origen público: canonical, sitemap, Open Graph  |
| `PUBLIC_LIVE_POLL_SECONDS` | Segundos entre sondeos de un partido en directo |
| `WEB_HOST` · `WEB_PORT`    | Dónde escucha en desarrollo                     |

En el servidor se leen de `process.env`, no de `import.meta.env`: Astro resuelve
`import.meta.env` al compilar, y el destino se decide al desplegar.

## Documentación

- [Arquitectura del frontend](../../docs/frontend-architecture.md)
- [Sistema de diseño](../../docs/design-system.md)
- [Cliente de la API](../../docs/api-client.md)
- [Fase 2](../../docs/fase-2.md)
