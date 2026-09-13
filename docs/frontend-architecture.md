# Arquitectura del frontend

`apps/web` es una aplicación **Astro con renderizado en servidor**. Sirve el
sitio público y el panel de administración, y habla únicamente con la API.

```
             VISITANTE / ADMINISTRADOR
                        │
                        ▼
        ┌───────────────────────────────┐
        │      ASTRO (apps/web)         │
        │   SSR · islas de React        │
        │   BFF: /api/session           │
        │        /api/admin/…           │
        │        /api/partidos/:id/live │
        └───────────────┬───────────────┘
                        │  (servidor a servidor)
                        ▼
        ┌───────────────────────────────┐
        │      REST API  /api/v1        │
        └───────────────┬───────────────┘
                        ▼
              DOMINIO + SERVICIOS
                        ▼
                   PostgreSQL
```

El navegador **nunca** habla con la API. Ni con PostgreSQL, ni con Supercell.

## Por qué servidor y no sitio estático

La clasificación cambia con cada resultado. Un sitio estático obligaría a
reconstruir y desplegar después de cada partido, en mitad de una jornada. Con
SSR, la página se arma en el momento con lo que dice la API.

El coste asumido es que hace falta un proceso Node en marcha. A cambio, no hay
caché que invalidar ni tabla desactualizada que explicar.

## Reparto entre Astro y React

| Herramienta | Para qué                                                               |
| ----------- | ---------------------------------------------------------------------- |
| **Astro**   | Páginas, layouts, obtención de datos, SEO, todo lo que no reacciona    |
| **React**   | Solo donde hay interacción real: filtros, tabla ordenable, formularios |
| **GSAP**    | Portada y aparición de secciones. Nada más                             |

La regla práctica: si funciona con HTML, no lleva JavaScript. La ficha de un
partido finalizado no hidrata nada; el listado con filtros, sí.

Las islas se declaran con `client:load` (interacción inmediata, como los
formularios del panel) o `client:visible` (la tabla de la portada, que puede
esperar a que se vea).

### Una trampa concreta de Astro

**El marcado de Astro no se puede pasar como propiedad a un componente de
React.** Se convierte en un objeto que React no sabe pintar y la página revienta
en tiempo de ejecución. Por eso hay dos `SectionHeading`: la versión `.astro`
—con un slot con nombre para la acción— y la versión React, para usar dentro de
React. Los _hijos_ sí funcionan: Astro los renderiza a HTML y los inyecta.

**`slot` es un atributo reservado.** Un componente React con una propiedad
llamada `slot` no se puede usar desde una plantilla Astro: por eso
`EmptySlotCard` recibe `slotNumber`.

## Estructura

```
apps/web/src/
├── components/
│   ├── ui/           Primitivas: botón, panel, badge, estados vacíos y de error
│   ├── layout/       Marca, cabecera, pie, navegación móvil
│   ├── league/       Portada, resumen de competición, vitrina del trofeo
│   ├── standings/    Tabla, indicador de forma, movimiento de posición
│   ├── matches/      Tarjeta, marcador, estados, historial, directo, stream
│   ├── players/      Avatar, ficha, mazo (no disponible), Clash Royale
│   └── admin/        Acciones, participantes, calendario, partidos, sanciones, auditoría
├── layouts/          Base · Public · Admin
├── lib/
│   ├── api/          client · endpoints · messages · session
│   ├── presentation  Etiquetas, formatos y tonos
│   ├── nav · seo     Navegación y metadatos
│   └── rules-catalog Lee docs/pending-rules.md
├── pages/            Rutas públicas, panel y endpoints propios
├── scripts/          Animaciones de entrada
└── styles/           Sistema de diseño
```

## El BFF: por qué Astro hace de puente

Tres endpoints propios, y ninguno es un proxy abierto.

### `/api/session`

Recibe el formulario de acceso, llama a la API, **lee la cookie que emite y la
vuelve a emitir en el origen del frontend**. El token es `httpOnly` en los dos
saltos y nunca pasa por `localStorage` ni por JavaScript.

Reenvía la IP del visitante en `x-forwarded-for`: sin eso, la API vería siempre
la del servidor de Astro y su límite de diez intentos por cinco minutos sería
común a todo el mundo.

### `/api/admin/[...path]`

Reenvía las operaciones administrativas añadiendo la sesión. Lo que impide que
sea un proxy abierto:

- solo compone rutas bajo `/api/v1/admin/`, y cada segmento tiene que encajar en
  `[A-Za-z0-9_-]+`, así que no hay forma de salirse con `..` ni con una URL
  absoluta;
- exige que la cabecera `Origin`, si viene, sea la propia;
- sin sesión responde 401 sin llegar a llamar a la API.

Está probado en `scripts/e2e.mjs`: 401 sin sesión, 403 desde otro origen, 404
ante un intento de travesía de rutas.

### `/api/partidos/[id]/live.json`

Sondeo del estado de un partido. Devuelve la proyección pública.

## Actualización en vivo

REST con **sondeo**, no WebSocket. Para un partido cada veinte segundos sobra, y
no obliga a mantener conexiones abiertas ni a montar otra infraestructura.

El sondeo:

- se configura con `PUBLIC_LIVE_POLL_SECONDS` (mínimo 5 s, por defecto 20 s);
- **se detiene** cuando el partido deja de estar `LIVE`;
- **se pausa** con la pestaña oculta y se reanuda al volver;
- avisa tras tres fallos seguidos, no al primero.

Cuando haga falta empujar datos de verdad (Fase 4, superposiciones para OBS), el
punto donde cambiarlo es ese único endpoint. Nada más lo sabe.

## Autoridad de los datos

La interfaz **no decide nada**. No calcula puntos, ni posiciones, ni ganadores,
ni si un partido cuenta. Todo eso llega resuelto de la API.

Dos consecuencias visibles:

- `countsForStandings` **se importa del dominio**, no se reescribe;
- las acciones que ofrece el panel salen de `allowedTransitions` y `actions`,
  que declara el backend. Si el dominio no permite una transición, el botón no
  existe.

Cuando el reglamento no define algo —la puntuación de una incomparecencia,
P-01— la API devuelve `null` o `PENDING_RULE`, y la interfaz lo dice. No hay un
valor por defecto escondido en ningún sitio.

## Errores

Cuatro familias, y cada una se cuenta distinto:

| Situación                       | Qué se muestra                                                |
| ------------------------------- | ------------------------------------------------------------- |
| La API rechaza (`ApiError`)     | El mensaje humano del código (`PENDING_RULE`, `ROSTER_FULL`)  |
| La API no responde              | «No se pudo contactar con el servidor de la liga»             |
| La respuesta no cumple contrato | Aviso de versiones desincronizadas; el detalle, en desarrollo |
| Cualquier otra cosa             | Error inesperado                                              |

El código técnico solo se enseña cuando `import.meta.env.DEV`.

## Seguridad

- **Sesión**: cookie `httpOnly`, `SameSite=Lax`, `secure` en producción. Nunca
  en `localStorage`.
- **CSRF**: `SameSite=Lax` más comprobación de `Origin` en el puente.
- **CSP**: la emite Astro (`security.csp`), que conoce el hash de sus propios
  scripts; en producción llega como cabecera con `script-src 'self'` más los
  hashes. `X-Frame-Options: DENY` lo pone el middleware, porque `frame-ancestors`
  no funciona en un `<meta>`.
- **Enlaces externos**: la URL de una transmisión se valida antes de convertirse
  en enlace (`safeExternalUrl`): solo `http` y `https`, con `rel="noopener
noreferrer"`.
- **`/admin`**: `Cache-Control: no-store` y excluido de `robots.txt` y del
  sitemap.
- **Secretos**: ninguno llega al navegador. La clave de Clash Royale no sale del
  backend.

## Variables de entorno

| Variable                   | Dónde     | Para qué                                   |
| -------------------------- | --------- | ------------------------------------------ |
| `API_URL`                  | Servidor  | URL de la API, puede ser interna           |
| `PUBLIC_API_URL`           | Ambos     | Alternativa si el navegador tuviera que ir |
| `PUBLIC_SITE_URL`          | Servidor  | Origen público: canonical, sitemap, OG     |
| `PUBLIC_LIVE_POLL_SECONDS` | Navegador | Segundos entre sondeos                     |
| `WEB_HOST` · `WEB_PORT`    | Servidor  | Dónde escucha en desarrollo                |

**Se leen de `process.env` en el servidor**, no de `import.meta.env`. Astro
resuelve `import.meta.env` al compilar: una URL puesta al arrancar el proceso no
llegaría nunca. Esto salió en el recorrido de extremo a extremo, no en una
revisión de código, y es lo que permite desplegar la misma build contra otra API.

## Rendimiento

- SSR, así que la primera pantalla no espera a JavaScript.
- Islas solo donde hacen falta: la ficha de un partido finalizado hidrata cero.
- Iconos SVG en línea (Lucide), sin fuente de iconos.
- Fuentes con `display=swap` y subconjunto latino; si no llegan, el sistema pone
  las suyas.
- Los efectos caros (`backdrop-filter`, sombras grandes) se usan en pocos
  elementos y nunca en listas largas.

## Accesibilidad

- La clasificación es una `<table>` real, con `<caption>`, `<th scope>` y
  `<abbr title>` en las abreviaturas.
- El color nunca es el único portador: la forma reciente lleva letra y texto para
  lector de pantalla, la diferencia de coronas lleva signo.
- Foco visible en cian, objetivos táctiles de 44 px.
- El marcador en directo se anuncia con `aria-live="polite"`.
- `prefers-reduced-motion` desactiva todo lo decorativo, y las animaciones de
  entrada dejan el contenido en su posición final.
- Sin emojis como iconografía. Ni uno.
