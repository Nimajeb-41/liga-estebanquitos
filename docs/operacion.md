# Operar una temporada

Cómo se lleva la liga día a día, y por qué cada pantalla está donde está.

La Fase 4 dejó la plataforma **correcta**: el dominio decide, la clasificación se
deriva y nada se sobrescribe sin dejar rastro. La Fase 5 la dejó **operable**:
que llevar una temporada real no exija abrir doce formularios idénticos ni
recordar de memoria qué quedó a medias.

---

## Jornadas

`/admin/jornadas` lista una fila por jornada con lo que le falta. Es distinto de
`/admin/fixtures`, que enseña el calendario entero: aquí lo que se destaca es lo
pendiente, no lo jugado.

Dos columnas merecen explicación:

- **Sin fecha** son partidos programados a los que nadie ha puesto día. No es un
  problema por sí solo; al principio de temporada son todos.
- **Atascados** son los que están en directo, aplazados o en disputa: los tres
  estados en los que el partido **no avanza solo**. No es un juicio sobre si van
  tarde, es un recuento.

Una jornada cuenta como **cerrada** cuando no queda nada que decidir en ella:
todos sus partidos terminados o cancelados. Un cancelado cuenta como resuelto
—no se va a jugar y no puntúa—; uno en disputa no, aunque ya tenga marcador
escrito.

### Programar una jornada entera

`POST /admin/rounds/:number/schedule` con la hora del primer partido y los
minutos entre uno y el siguiente. El caso real es «la jornada 4 se juega el
sábado a las 20:00, uno cada media hora».

Dos decisiones que no son obvias:

- **Solo se tocan los partidos en `SCHEDULED`.** Un aplazado tiene su propio
  procedimiento, un cancelado no se juega y uno terminado ya tiene fecha real.
  Programar en bloque nunca debe reabrir nada.
- **Una fecha ya puesta no se pisa.** Puede ser un acuerdo entre dos jugadores, y
  una programación masiva no es motivo suficiente para deshacerlo sin querer. Si
  de verdad se quiere, hay que pedirlo con `overwrite: true`, y queda escrito así
  en la auditoría.

`originalScheduledAt` nunca se sobrescribe: es lo que permite decir «esto era del
día 10» después de tres aplazamientos.

---

## Centro de acción

En `/admin`, sobre los controles de la temporada. Responde a «¿qué me falta?»:

| Código                   | Qué es                                       |
| ------------------------ | -------------------------------------------- |
| `DISPUTED`               | Fuera de la tabla hasta que alguien decida   |
| `LIVE`                   | Marcado en juego; si ya acabó, falta el acta |
| `POSTPONED_WITHOUT_DATE` | Aplazado y todavía sin día nuevo             |
| `OVERDUE`                | Pasó la hora prevista y sigue sin resultado  |
| `UNSCHEDULED`            | En el calendario, sin día asignado           |
| `CANDIDATE_PENDING`      | Una batalla propuesta que nadie ha resuelto  |
| `BATTLE_NEEDS_REVIEW`    | El importador marcó algo que no cuadraba     |

Tres reglas de la casa se respetan aquí:

- **Nada de umbrales inventados.** «Fecha pasada» es un hecho comprobable contra
  el reloj; «va retrasado» sería una opinión.
- **El orden es por antigüedad, no por gravedad.** Decidir que una disputa pesa
  más que un aplazado es una decisión de reglamento que nadie ha tomado. Lo que
  no tiene fecha va al final, porque no hay nada honesto que ordenar.
- **No ejecuta nada.** Enumera y enlaza; cada acción sigue en la ficha del
  partido, con sus avisos y sus confirmaciones.

La diferencia con `/admin/metrics`: las métricas dicen **cuántos**, el centro
dice **cuáles**.

---

## Eventos internos

No es lo mismo que la auditoría, y confundirlos llevaría a guardar lo que no hace
falta y a perder lo que sí:

|              | Auditoría                        | Eventos                         |
| ------------ | -------------------------------- | ------------------------------- |
| Qué responde | Quién hizo qué, cuándo y con qué | Qué ha pasado en la competición |
| Dónde vive   | `audit_log`, en la base          | En memoria del proceso          |
| Si se pierde | Hay un problema                  | No pasa nada                    |
| Para qué     | Responder ante el reglamento     | Que otras partes reaccionen     |

El bus (`apps/api/src/events.ts`) es síncrono y en proceso. Nada de colas ni
reintentos: una liga de diez personas no los necesita, y la complejidad se paga
siempre.

Tres garantías que lo hacen seguro de usar desde un servicio:

1. **Un suscriptor que falla no tumba la operación.** El resultado ya está
   escrito; que un oyente se equivoque no puede deshacerlo. Se registra y sigue.
2. **Se emite fuera de la transacción.** Anunciar algo que luego se revierte
   sería peor que no anunciar nada.
3. **Nunca viajan secretos.** Un evento lleva identificadores y estados, no
   tokens, cabeceras ni credenciales.

Hoy se suscriben dos cosas: el registro estructurado, y el contador de
revisiones.

### Revisiones y sondeo en directo

`GET /api/v1/matches/:id/live` devuelve el estado mínimo más una `revision` que
sube cada vez que algo del partido cambia. Quien sondea compara ese número en
lugar de la ficha entera, y el overlay no se repinta cuando no ha pasado nada.

Vive en memoria a propósito. Si el proceso se reinicia, los contadores vuelven a
empezar y el único efecto es que los clientes se refrescan una vez de más: no se
pierde ningún dato, porque ahí no hay ninguno que perder.

---

## Cerrar la temporada

Ver [tournament-rules.md](tournament-rules.md). En resumen: cerrar es definitivo,
genera una instantánea con la clasificación final y las reglas con las que se
calculó, y lo que quede sin jugar se queda como está.

La instantánea existe porque **la tabla se deriva**: cambiaría si el reglamento
cambiara después, y una temporada cerrada no puede depender de la configuración
de la siguiente.
