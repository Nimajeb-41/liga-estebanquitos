# Assets de marca del frontend

Esta carpeta se sirve tal cual desde la raiz del sitio: un archivo en
`league-logo/logo.svg` se ve en `/assets/branding/league-logo/logo.svg`.

Lo que hay hoy son **marcadores de posicion**, no la identidad definitiva:

| Archivo             | Que es                                           |
| ------------------- | ------------------------------------------------ |
| `og-default.svg`    | Imagen para redes sociales. Tipografica, sobria. |
| `../../favicon.svg` | Monograma LE sobre el fondo del tema.            |

Cuando lleguen los archivos reales:

1. Se dejan en la subcarpeta que corresponda (`league-logo/`, `trophy/`,
   `backgrounds/`, `sponsors/`).
2. Se sustituye el monograma de `src/components/layout/Brand.astro`.
3. Se sustituye el pedestal de `src/components/league/TrophyStage.astro`, que
   ya tiene el foco y el halo montados alrededor de `TROPHY_PLACEHOLDER`.

Las condiciones de uso, el copyright y el descargo obligatorio de Supercell
estan en `docs/branding-and-assets.md`, en la raiz del repositorio.
