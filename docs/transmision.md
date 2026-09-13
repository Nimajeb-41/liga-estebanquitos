# Transmisión y directo

Quién narra la liga, y cómo sabe la web que hay algo que ver.

---

## El narrador

**EsstebannPluss** retransmite la Liga Estabanquitos 2026-1. Sus canales están en
un único sitio, `apps/web/src/lib/streamer.ts`, porque aparecen en cuatro
pantallas: la portada, `/transmision`, el aviso de directo y la ficha de un
partido en juego. Si cambiara el canal, cambia ahí y cambia en todas.

| Plataforma | Perfil               | Papel                      |
| ---------- | -------------------- | -------------------------- |
| Kick       | `esstebannpluss`     | **Donde se emite la liga** |
| YouTube    | `@EsstebannPluss011` | Vídeos y repeticiones      |
| Instagram  | `@esstebannpluss`    | Avisos                     |
| TikTok     | `@esstebannpluss`    | Cortos                     |

Tres decisiones sobre el texto de esa sección:

- **No publica cifras de seguidores.** Cambian cada semana y convierten una
  presentación en un boletín de resultados ajeno. Hay un test que lo recuerda.
- **Habla de lo que hace, no de quién es.** La web describe su trabajo —narrar
  la liga, y fuera de ella partidas, vlogs y reviews de hardware— y nada más.
- **Dice que la liga no gestiona esos canales.** Son perfiles de otra persona.

Los enlaces externos llevan `rel="noopener noreferrer"`, y el e2e comprueba que
ninguno se quede sin él.

---

## Qué significa «en directo»

El aviso de directo aparece cuando **administración marca un partido como
`LIVE`**. Eso es un hecho de esta competición y lo sabemos nosotros.

Lo que **no** se hace es consultar si el canal está emitiendo. La API pública de
Kick no está documentada oficialmente, puede cambiar o bloquearnos sin aviso, y
construir una afirmación visible sobre ella sería el mismo error que la liga
lleva evitando desde **P-11** con `verifytoken`: tratar como oficial algo que no
lo es.

Así que la web afirma exactamente lo que puede comprobar: «se está jugando un
partido de la liga». Si el canal está emitiendo otra cosa, o nada, eso lo sabe
Kick y aquí no se dice.

### Dónde aparece el enlace

| Sitio              | Qué muestra                                   |
| ------------------ | --------------------------------------------- |
| Portada            | Aviso fijo arriba, con el partido y el enlace |
| `/transmision`     | El canal, siempre; en directo cambia de tono  |
| Tarjeta de partido | Botón «Ver en directo» dentro de la tarjeta   |
| Ficha del partido  | Botón grande antes del marcador en vivo       |

Si el partido trae su propio `stream.url`, manda ese; si no, el canal de la liga.
Es lo que permite enlazar a un directo concreto sin tocar nada.

---

## Movimiento, sonido y PWA

### GSAP

`apps/web/src/scripts/motion.ts`. Cuatro cosas: entrada al hacer scroll,
contadores, la entrada de la portada y la flotación del trofeo.

Una página que no marca nada con `data-reveal` se anima sola: el módulo busca los
bloques dentro de `<main>`, atravesando los `div` de maquetación hasta dar con
las secciones. Marcar a mano dieciséis páginas es trabajo que se olvida en la
diecisiete. Una página que sí los declara manda.

Dos garantías:

- **`prefers-reduced-motion` desactiva todo.** No se atenúa: se deja el contenido
  en su estado final y se sale.
- **Cada grupo lleva una red de seguridad temporizada.** Animar implica empezar
  invisible; si la animación no llegara a correr —un error, una pestaña en
  segundo plano— la página quedaría en blanco. Pasado el tiempo que debería haber
  tardado, se fuerza el estado final.

### Sonido

`apps/web/src/scripts/sfx.ts`. Los sonidos se **sintetizan** con la Web Audio
API: no hay archivos que descargar, funciona sin conexión y no hay nada que se
pueda quedar desafinado.

- **Silencio por defecto**, con un interruptor en la cabecera. El navegador no
  deja arrancar audio sin un gesto del usuario: el clic en ese botón **es** ese
  gesto.
- La elección se recuerda en ese navegador, envuelta en `try`: en ventana privada
  el simple hecho de leer lanza.
- **`prefers-reduced-motion` también apaga el sonido.** Quien pide menos estímulo
  no se refería solo al movimiento.

Todo por debajo de 0,09 de ganancia y 220 ms: son señales, no música.

### PWA

Manifiesto, iconos generados a partir del trofeo, y un service worker que hace
una cosa: que la web abra sin conexión.

Lo que **no** cachea es lo importante:

| Qué                        | Estrategia                       |
| -------------------------- | -------------------------------- |
| CSS, JS, fuentes, imágenes | Caché primero                    |
| Páginas HTML               | Red primero, caché si no hay red |
| `/api/`                    | **Nunca se toca**                |

Una clasificación guardada es una clasificación que miente: esta liga deriva la
tabla y la recalcula entera, así que servir una copia de hace dos horas mostraría
posiciones que ya no son ciertas, sin avisar. Peor con un partido en directo: el
marcador guardado sería el de antes.

Por eso `/offline` dice que no hay conexión y no enseña una tabla vieja.
