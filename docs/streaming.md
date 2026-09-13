# Transmisión

Cómo retransmitir una jornada: el overlay que se pega en OBS, el panel que genera
su URL, y qué enseña —y qué no— sobre el partido.

---

## Las dos piezas

|                      | Qué es                                            | Quién la usa                  |
| -------------------- | ------------------------------------------------- | ----------------------------- |
| `/admin/stream`      | Generador de la URL del overlay, con vista previa | El operador, antes de empezar |
| `/overlay/match/:id` | El overlay en sí                                  | OBS, como fuente de navegador |

El panel **no cambia nada de la competición**: es un generador de enlaces. Los
enlaces de directo y repetición de cada partido se editan en su ficha
administrativa, que es donde queda la auditoría.

---

## Puesta en marcha (cinco minutos antes de empezar)

1. Entra en **Panel → Transmisión**.
2. Elige el partido. La lista pone primero lo que está en juego, luego lo que
   viene, y al final lo ya jugado.
3. Ajusta colocación y tamaño mirando la vista previa. Está sobre un tablero de
   transparencia, que es lo que hay debajo dentro de OBS.
4. Copia la URL.
5. En OBS: **Fuentes → + → Navegador**, pega la URL, marca «Fondo transparente».
   Ancho 1280 y alto 360 es un punto de partida razonable para 1080p.

No hace falta recargar la fuente cuando se registre el resultado: el overlay se
actualiza solo cada diez segundos.

---

## Parámetros de la URL

```
/overlay/match/<id>?variant=compact&scale=1.5&minimal=1
```

| Parámetro | Valores                         | Efecto                                                                         |
| --------- | ------------------------------- | ------------------------------------------------------------------------------ |
| `variant` | `full` (por defecto), `compact` | Tercio inferior centrado, o esquina superior izquierda                         |
| `scale`   | `0.5`–`4`                       | Multiplicador de tamaño. Se acota: un `?scale=900` no puede reventar la escena |
| `minimal` | `1`                             | Solo nombres y marcador, sin jornada ni estado                                 |

Se ajusta por URL a propósito, para no obligar al operador a tocar nada dentro de
OBS.

---

## Qué enseña el overlay

- **Jornada y número de partido**, salvo en modo mínimo.
- **Los nombres de la liga**, no los de las cuentas de Clash Royale.
- **El estado**, con las mismas palabras que el sitio público: «En directo»,
  «Final», «Aplazado», «En revisión», «Cancelado», «Próximamente».
- **El marcador**, si existe.

## Qué no enseña

**Un marcador que no existe.** Mientras no haya resultado registrado, el overlay
pone `VS`, no un `0–0`. La plataforma no recibe las coronas batalla a batalla
—eso no existe en la API de Clash Royale— y un cero en pantalla, a ese tamaño, se
leería como un marcador real.

**Nada administrativo.** Ni notas, ni reportes, ni evidencia. Quien tenga el
enlace ve exactamente lo mismo que en la ficha pública del partido.

**Un partido en revisión como final.** Si el resultado está en disputa, el
overlay lo dice en pantalla. Un rótulo que anuncia «Final» sobre un marcador que
puede cambiar es peor que no poner nada.

---

## Decisiones de diseño

**Fondo transparente de verdad.** OBS compone el overlay sobre el vídeo del
juego; cualquier color de fondo taparía la partida.

**Sombra en vez de panel.** El overlay tiene que leerse tanto sobre una arena
clara como sobre una noche. Un fondo semitransparente tapa juego; una sombra
doble, no.

**Empieza visible, y GSAP lo anima desde cero.** Al revés —arrancar invisible y
confiar en que algo lo revele— cualquier fallo dejaría la fuente de OBS en blanco
durante todo el directo. Si GSAP no llega a cargarse, simplemente no hay
animación. La opacidad tampoco puede vivir en el `style` de React: cada repintado
del sondeo volvería a aplicarla y pisaría lo que GSAP animó.

**Una sola animación.** Entra una vez y se queda quieto. Nada que se mueva
mientras alguien intenta leer un marcador. El único elemento animado es el punto
de «en directo», y se detiene si el sistema pide menos movimiento.

**Sin interacción y sin cursor.** Nadie puede hacer clic en una fuente de OBS.

**`noindex`.** No es secreto —enseña lo mismo que la ficha pública— pero en un
buscador solo sería ruido. Está también en `robots.txt`.

---

## Cómo se actualiza

El overlay sondea `/api/partidos/:id/live.json` cada diez segundos, en el propio
origen: el navegador no habla nunca con la API directamente. Un corte de red no
lo tumba en mitad de un directo: se queda con lo último que sabía y vuelve a
intentarlo al siguiente ciclo.

Es REST con sondeo, no WebSocket. Para un partido cada pocos segundos sobra, y no
obliga a mantener conexiones abiertas.

---

## Enlaces de un partido

En la ficha administrativa de cada partido hay un bloque **Transmisión** con tres
campos: directo, repetición (VOD) y plataforma. Son metadatos: no cambian el
estado del partido ni el resultado, y se editan en cualquier momento —el directo
antes, el VOD después—.

Solo se admiten enlaces `http` y `https`. Vaciar un campo borra ese enlace. Cada
cambio queda en la auditoría como `MATCH_STREAM_UPDATED`.
