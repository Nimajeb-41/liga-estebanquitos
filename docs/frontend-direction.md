# Dirección visual — Cyberpunk Esports

Documento de **intención**, escrito antes de construir nada. Se mantiene tal
cual, como referencia de por qué el sistema visual es como es.

> Lo que existe de verdad en el código, y cómo usarlo, está en
> [design-system.md](design-system.md).

## La idea

Estética de torneo profesional de esports: negro profundo, neón, paneles
holográficos y energía. Espectacular en la portada y en la revelación de
resultados; **sobrio y legible** en la tabla y el calendario, que es lo que la
gente va a mirar diez veces al día desde el móvil.

La regla que resuelve las discusiones: **el espectáculo va en los marcos, nunca
en los datos**. Un número de la clasificación no brilla, no pulsa y no se mueve.

## Paleta

| Token            | Valor     | Uso                                   |
| ---------------- | --------- | ------------------------------------- |
| `--bg-void`      | `#05060A` | Fondo base                            |
| `--bg-panel`     | `#0C0F17` | Paneles                               |
| `--bg-elevated`  | `#141926` | Tarjetas sobre panel                  |
| `--neon-cyan`    | `#00E5FF` | Acento principal, enlaces, foco       |
| `--neon-magenta` | `#FF2ECC` | Acento secundario, alertas de directo |
| `--neon-purple`  | `#8A5CFF` | Degradados, bordes                    |
| `--neon-acid`    | `#B6FF3B` | Positivo: victoria, DC favorable      |
| `--danger`       | `#FF4D5E` | Sanciones, DC desfavorable            |
| `--text-primary` | `#E8ECF5` | Texto principal                       |
| `--text-muted`   | `#8E9AB5` | Texto secundario                      |

Contraste sobre `--bg-void`, calculado de forma aproximada y **pendiente de
verificar con herramienta** cuando se cierren los valores:

| Color            | Ratio ≈ | Apto para                                       |
| ---------------- | ------- | ----------------------------------------------- |
| `--text-primary` | 15:1    | Todo                                            |
| `--neon-acid`    | 16:1    | Todo                                            |
| `--neon-cyan`    | 12:1    | Todo                                            |
| `--neon-magenta` | 6:1     | Texto normal y grande                           |
| `--neon-purple`  | 4.8:1   | Texto grande, bordes; **no** para texto pequeño |
| `--text-muted`   | 6:1     | Texto secundario                                |

Reglas de color:

- Nunca neón sobre neón.
- El color nunca es el único portador de información: victoria/derrota y DC
  positiva/negativa llevan además signo o etiqueta.
- Los degradados van en bordes y fondos, jamás debajo de texto.

## Tipografía

- **Titulares**: una sans geométrica ancha con aire técnico (Chakra Petch,
  Rajdhani o Michroma), solo para portada, números de jornada y nombres en
  cabeceras.
- **Interfaz y tablas**: una sans neutra de alta legibilidad (Inter).
- **Cifras**: siempre `font-variant-numeric: tabular-nums`. Las columnas de la
  clasificación tienen que alinearse.

## Efectos, y su precio

| Efecto            | Dónde sí                                           | Dónde no                        |
| ----------------- | -------------------------------------------------- | ------------------------------- |
| Glow              | Bordes de panel, botón activo, marcador en directo | Texto de la tabla               |
| Glassmorphism     | Cabecera, tarjetas de partido                      | Fondos con texto pequeño detrás |
| Rejilla futurista | Fondo de portada y cabeceras de sección            | Detrás de tablas                |
| Scanlines         | Portada, tarjetas de campeón                       | Vistas de datos                 |
| Partículas        | Solo portada, `<canvas>` pausado fuera de pantalla | El resto del sitio              |
| Bordes animados   | Partido en directo, líder de la tabla              | Todas las filas                 |

`backdrop-filter` y `box-shadow` grandes son caros en móviles modestos: se usan
en pocos elementos simultáneos y nunca en listas largas.

## Movimiento

- `prefers-reduced-motion: reduce` desactiva partículas, scanlines, bordes
  animados y cualquier animación de entrada. No es opcional.
- Transiciones de interfaz: 150–250 ms. Animaciones de escena: máximo 800 ms.
- Nada parpadea entre 3 y 55 Hz (riesgo fotosensible).
- GSAP solo en portada, presentación del trofeo y revelación del campeón. El
  resto es CSS y transiciones de vista nativas.

## Iconos

**Sin emojis como iconos de interfaz.** Un conjunto SVG monocromo (Lucide o
Tabler), con `currentColor`, tamaño 20/24 px y `aria-hidden` cuando el icono
acompaña a un texto que ya dice lo mismo.

## Componentes previstos

- Tabla de clasificación (POS · JUGADOR · PJ · VG · VP · DC · PTS), ordenable,
  con la fila del líder destacada y las posiciones compartidas marcadas cuando
  hay empate sin resolver.
- Tarjeta de partido: dos jugadores, coronas, tipo de victoria, estado.
- Calendario por jornada, con navegación entre las 18.
- Ficha de jugador: rachas, historial, mazos cuando existan.
- Panel de plazas: 10 huecos, los libres con `TBD / POR CONFIRMAR` y estética de
  hueco vacío, no de jugador fantasma.
- Panel de administración, deliberadamente sobrio: ahí manda la densidad de
  información, no el estilo.

## Responsive

Móvil primero: la mayoría del público llega desde un enlace en el chat.

- La clasificación en móvil muestra POS, jugador, PJ, DC y PTS; el resto se
  despliega al tocar la fila.
- Ninguna tabla provoca scroll horizontal de la página; si desborda, desborda
  dentro de su propio contenedor.
- Objetivos táctiles de 44 px como mínimo.

## Presupuesto de rendimiento

Medido en 4G y móvil de gama media:

| Métrica    | Objetivo                                             |
| ---------- | ---------------------------------------------------- |
| LCP        | < 2,5 s                                              |
| CLS        | < 0,1                                                |
| JS inicial | < 100 kB comprimido                                  |
| Fuentes    | 2 familias, subconjunto latino, `font-display: swap` |

Si un efecto no cabe en el presupuesto, cae el efecto, no el presupuesto.

## Accesibilidad

- Contraste mínimo 4.5:1 en texto normal, 3:1 en texto grande y elementos de
  interfaz.
- Foco visible siempre, en cian, con `:focus-visible`.
- Navegación completa por teclado.
- La tabla es una `<table>` real, con `<caption>`, `<th scope>` y abreviaturas
  explicadas con `<abbr title>`.
- Estados en directo anunciados con `aria-live="polite"`.
