# Sistema de diseño

Implementa la [dirección visual](frontend-direction.md). Aquí está lo que existe
de verdad en el código y cómo se usa.

Todo vive en `apps/web/src/styles/global.css` (tokens y utilidades) y en
`apps/web/src/components/ui/` (primitivas).

## La regla que resuelve las discusiones

> **El espectáculo va en los marcos, nunca en los datos.**

Un número de la clasificación no brilla, no pulsa y no se mueve. El neón está en
el borde del panel, en la portada y en el marcador en directo. En una tabla que
alguien mira diez veces al día desde el móvil, no.

Cuando algo entra en conflicto, el orden es:

```
corrección del dato → seguridad → accesibilidad → usabilidad → identidad → efectos
```

## Tokens

Declarados con `@theme` de Tailwind 4, así que cada uno es a la vez variable CSS
y utilidad (`--color-cyan` → `text-cyan`, `border-cyan`, `bg-cyan/10`).

### Fondos

| Token         | Valor     | Para qué                       |
| ------------- | --------- | ------------------------------ |
| `void`        | `#05060A` | Fondo de la página             |
| `panel`       | `#0C0F17` | Superficie de panel            |
| `elevated`    | `#141926` | Tarjeta sobre panel, cabeceras |
| `raised`      | `#1B2233` | Tooltip, menú                  |
| `line`        | `#232A3D` | Borde normal                   |
| `line-strong` | `#33405C` | Borde con más presencia        |

### Acentos

| Token     | Valor     | Significa                                    |
| --------- | --------- | -------------------------------------------- |
| `cyan`    | `#00E5FF` | Acento principal, enlaces, foco              |
| `magenta` | `#FF2ECC` | En directo                                   |
| `purple`  | `#8A5CFF` | Degradados, correcciones                     |
| `acid`    | `#B6FF3B` | Positivo: victoria, finalizado, DC favorable |
| `warning` | `#FFC046` | Aplazado, **regla pendiente**                |
| `danger`  | `#FF4D5E` | Sanción, disputa, DC desfavorable            |

Gold, silver y bronze son solo para el podio.

### Texto

`ink` para el texto principal, `muted` para el secundario y `faint` para
etiquetas y metadatos.

### Reglas de color

- Nunca neón sobre neón.
- **El color nunca es el único portador de información.** La diferencia de
  coronas lleva signo (`+6`, `−1`); la forma reciente lleva letra y una
  descripción para lector de pantalla; cada estado lleva su etiqueta escrita.
- Los degradados van en bordes y fondos, nunca debajo de texto.

## Tipografía

- **Titulares**: Chakra Petch (`font-display`), para portada, cifras grandes y
  nombres en cabeceras.
- **Interfaz**: Inter, o la del sistema si no llega.
- **Cifras**: `font-variant-numeric: tabular-nums` en todo el `body`. Las
  columnas de la clasificación se alinean.

## Utilidades propias

| Clase            | Qué hace                                                |
| ---------------- | ------------------------------------------------------- |
| `.panel`         | Superficie base: fondo, borde y radio                   |
| `.panel-glass`   | Cristal con desenfoque. Cabeceras y tarjetas destacadas |
| `.grid-backdrop` | Rejilla futurista con máscara. Solo de fondo de sección |
| `.scanlines`     | Líneas de barrido. Portada y vitrina del trofeo         |
| `.edge-live`     | Borde y halo magenta: algo está ocurriendo ahora        |
| `.edge-cyan`     | Borde y halo cian: algo está destacado                  |
| `.text-gradient` | Degradado sobre texto. Solo en titulares grandes        |
| `.rule-gradient` | Filete técnico de 1 px                                  |
| `.pulse-live`    | Punto pulsante. Se detiene con `prefers-reduced-motion` |
| `.reveal-init`   | Punto de partida de las entradas de GSAP                |

## Primitivas

`components/ui/primitives.tsx` — se renderizan en el servidor salvo que la
página pida hidratarlas:

`Badge` · `Panel` · `SectionHeading` · `StatTile` · `EmptyState` · `ErrorState` ·
`PendingRule` · `Skeleton` · `Spinner` · `Button` · `ProgressBar` · `KeyValue` ·
`TableScroll`

`components/ui/interactive.tsx` — necesitan JavaScript:

`Tabs` (patrón ARIA completo, con flechas) · `Modal` (sobre `<dialog>` nativo,
así el navegador se encarga del foco atrapado) · `Tooltip` (aparece con ratón y
con teclado; el texto va en el DOM con `aria-describedby`).

`components/ui/SectionHeading.astro` — la versión para páginas Astro, con slot
para la acción. Existe porque el marcado de Astro no se puede pasar como
propiedad a React.

### `PendingRule`, la primitiva que importa

Marca en ámbar todo lo que el reglamento no ha decidido. Se usa en el Match
Center cuando un resultado no reparte puntos, en el formulario de resultado al
elegir incomparecencia, en estadísticas y en el reglamento.

Nunca se sustituye por un valor inventado. Es el aspecto visual de
[ADR 0005](adr/0005-reglas-pendientes-explicitas.md).

## Iconografía

**Lucide, SVG en línea, `currentColor`.** Tamaños 3.5 (14 px), 4 (16 px) y 5
(20 px). `aria-hidden="true"` siempre que el icono acompañe a un texto que ya
dice lo mismo.

**Sin emojis como iconos de interfaz.** Ni en navegación, ni en botones, ni en
estadísticas, ni para representar partidos o personas. El podio se distingue por
color de metal y borde, no por 🥇.

## Estados

| Estado          | Componente                                |
| --------------- | ----------------------------------------- |
| Cargando        | `Skeleton`, `Spinner`                     |
| Vacío           | `EmptyState`, con explicación de por qué  |
| Error           | `ErrorState`, `ApiFailure.astro`          |
| Regla pendiente | `PendingRule`                             |
| 404             | `src/pages/404.astro`, con salidas útiles |

Un estado vacío **explica**: «la tabla aparece en cuanto se juegue el primer
partido», no un cero.

## Estados de partido

Los seis del dominio, ni uno más:

| Estado      | Color   | Icono         | Qué añade la interfaz                         |
| ----------- | ------- | ------------- | --------------------------------------------- |
| `SCHEDULED` | neutro  | CalendarClock | —                                             |
| `LIVE`      | magenta | Radio         | Punto pulsante, borde luminoso, sondeo        |
| `COMPLETED` | ácido   | CheckCircle2  | Marcador, ganador, puntos                     |
| `POSTPONED` | ámbar   | PauseCircle   | Franja: no puntúa, jornada y fecha originales |
| `DISPUTED`  | rojo    | Scale         | Aviso: no cuenta hasta resolverse             |
| `CANCELLED` | tenue   | Ban           | Tachado                                       |

## Movimiento

- Transiciones de interfaz: 150–250 ms.
- Animaciones de escena: 800 ms como techo.
- GSAP **solo** en la entrada de la portada y en la aparición de secciones.
- Nada parpadea entre 3 y 55 Hz.
- `prefers-reduced-motion: reduce` desactiva todo lo decorativo y deja el
  contenido en su posición final. No es opcional.

Las animaciones de entrada añaden `reveal-init` **desde JavaScript**, justo
antes de animar: sin JavaScript el contenido se ve igual, no en blanco.

## Responsive

Móvil primero: la mayoría del público llega desde un enlace en el chat.

- Navegación principal en barra inferior fija por debajo de `md`.
- La clasificación muestra POS, jugador, PJ, DC y PTS; el resto se despliega al
  tocar la fila.
- Ninguna tabla provoca scroll horizontal de la página: desborda dentro de su
  contenedor.
- Objetivos táctiles de 44 px (`min-h-11`).

## Marca

El logotipo y el trofeo definitivos **no existen todavía**. Hasta que lleguen:

- `Brand.astro` usa un monograma tipográfico, deliberadamente sobrio.
- `TrophyStage.astro` reserva el escenario —foco, halo, pedestal— alrededor de un
  marcador rotulado `TROPHY_PLACEHOLDER`.

Ninguno de los dos debe poder confundirse con la identidad oficial. Los archivos
van en `apps/web/public/assets/branding/`; las condiciones de uso, en
[branding-and-assets.md](branding-and-assets.md).
