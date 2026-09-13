# Marca y assets

## Logo y trofeo oficiales

Los assets reales los proporcionará el administrador. Hasta entonces existen
**placeholders identificados como tales**, y no se ha generado ningún logo ni
ningún trofeo falso que pudiera acabar publicado por error.

```
assets/branding/
├── league-logo/     Logo oficial de Liga Estabanquitos 2026-1
└── trophy/          Trofeo oficial
```

Cada carpeta tiene un `README.md` con los formatos y tamaños esperados.

Formatos pedidos cuando lleguen los originales:

| Asset           | Formatos                                 | Tamaños                |
| --------------- | ---------------------------------------- | ---------------------- |
| Logo            | SVG (preferente) + PNG con transparencia | 512×512 y 1024×1024    |
| Logo horizontal | SVG + PNG                                | para cabecera          |
| Trofeo          | PNG con transparencia, o render con alfa | 1024 px de alto mínimo |
| Favicon         | SVG + PNG                                | 32, 180, 512           |
| Imagen social   | PNG                                      | 1200×630               |

Mientras no lleguen, la interfaz reserva el espacio con un marco vacío
etiquetado, nunca con un sustituto que parezca definitivo.

## Material de Clash Royale

Clash Royale y todo su material gráfico son propiedad de **Supercell**. El uso
está regulado por la **Fan Content Policy** de Supercell, consultada el 8 de
septiembre de 2026.

### Lo que permite

- Usar material de Supercell en contenido de fans **no comercial**: guías,
  vídeos de partidas, páginas de aficionados que hablen de sus juegos. Una web
  de una liga amateur encaja en esa categoría.
- Monetización **limitada** a tres vías: publicidad, donaciones sin
  contraprestación y clases o entrenamiento.

### Lo que prohíbe

- Cobrar por vías distintas de esas tres.
- Crear juegos o productos propios basados en sus personajes.
- Fabricar merchandising físico.
- **Modificar los assets** sin permiso.
- Usar marcas de Supercell **en el nombre de dominio**.
- Contenido con cheats, hacks, venta de cuentas o filtraciones.
- Blockchain, NFT o criptomonedas.
- Contenido explícito, violento, discriminatorio, o publicidad política.

La política avisa además de que **no habrá advertencia previa** ante un
incumplimiento.

### Consecuencias concretas para este proyecto

1. **Aviso obligatorio y visible** en el pie del sitio, con este texto:

   > This material is unofficial and is not endorsed by Supercell. For more
   > information see Supercell's Fan Content Policy:
   > www.supercell.com/fan-content-policy.

   Se puede acompañar de una traducción, pero el texto original debe aparecer.

2. **El dominio no puede contener** "Clash", "Royale", "Supercell" ni ninguna
   otra marca suya. `ligaestabanquitos.<tld>` sí; `clashroyale-liga.<tld>` no.

3. **No se modifican los assets.** Las cartas se muestran tal cual, sin
   recortarlas dentro de otras formas ni recolorearlas. El estilo cyberpunk se
   aplica a _nuestros_ marcos y fondos, no a su arte.

4. **Nada de merchandising** con material de Clash Royale.

5. Si algún día hay ingresos, solo por publicidad o donaciones sin
   contraprestación.

### De dónde salen las imágenes de cartas

La API oficial devuelve, en `/cards` y dentro del `battlelog`, campos
`iconUrls` con URLs de iconos servidos por Supercell. Es la vía correcta:

- Se guardan las **URL** en `cards.icon_url`, no copias descargadas.
- Se sirven desde su origen o, si hace falta caché, con un proxy propio que no
  altere la imagen.
- No se descargan assets de wikis, foros o repositorios de terceros, cuyo origen
  y permisos no se pueden acreditar.

### Lo que NO se hace

- Descargar packs de sprites de origen desconocido.
- Extraer assets del cliente del juego.
- Usar arte de fans sin permiso explícito de su autor.
- Dar por hecho que "está en internet" significa "se puede usar".

## Fuentes y librerías

| Recurso                 | Licencia    | Uso       |
| ----------------------- | ----------- | --------- |
| Inter                   | SIL OFL 1.1 | Interfaz  |
| Chakra Petch / Rajdhani | SIL OFL 1.1 | Titulares |
| Lucide o Tabler Icons   | ISC / MIT   | Iconos    |

Todas permiten uso comercial y embebido. Las fuentes se sirven en local
(subconjunto latino), no desde un CDN de terceros: es más rápido y no filtra las
visitas.

## Fuentes consultadas

- [Supercell Fan Content Policy](https://supercell.com/en/fan-content-policy/)
- [Portal de desarrolladores de Clash Royale](https://developer.clashroyale.com/)
