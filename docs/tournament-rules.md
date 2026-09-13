# Reglamento de la Liga Estabanquitos 2026-1

Este documento describe **lo que el sistema ya hace cumplir**. Lo que todavía
no está decidido vive en [pending-rules.md](pending-rules.md) y el motor lo
rechaza en lugar de improvisar.

Versión del reglamento implementada: `2026-1.2`.

## Formato

| Concepto                              | Valor                                       |
| ------------------------------------- | ------------------------------------------- |
| Participantes                         | 10                                          |
| Sistema                               | Liga, todos contra todos, ida y vuelta      |
| Jornadas                              | 18                                          |
| Partidos por jornada                  | 5                                           |
| Partidos totales                      | 90                                          |
| Partidos por jugador                  | 18 (9 rivales × 2)                          |
| Formato de partido                    | Una batalla; gana quien consiga más coronas |
| Coronas máximas por jugador y partido | 3                                           |

Todo esto es configuración (`TournamentSettings`), no código: cambiar el cupo a
12 participantes da 22 jornadas de 6 partidos sin tocar el motor.

## Plantilla: de 6 a 10

Hoy hay **6 participantes confirmados**: Nimaben, Lyuk, Dullys, Esteban,
Eze23ml y LeonSB. Las plazas 7 a 10 están vacías y se muestran como
`TBD / POR CONFIRMAR`. El sistema **no** inventa nombres para rellenarlas.

### Los cinco conceptos, que no son lo mismo

| Concepto                | Qué significa                     | Dónde vive                                      |
| ----------------------- | --------------------------------- | ----------------------------------------------- |
| Participante inscrito   | Existe en el sistema              | `players.status = 'REGISTERED'`                 |
| Participante confirmado | La administración le dio la plaza | `players.status = 'CONFIRMED'` + `players.slot` |
| Participante activo     | Sigue compitiendo                 | `REGISTERED` o `CONFIRMED`                      |
| Fixture generado        | Existe calendario oficial         | `tournaments.status = 'SCHEDULED'`              |
| Competición iniciada    | Se pueden cargar resultados       | `tournaments.status = 'LIVE'`                   |

Hay **10 plazas numeradas**. Una plaza se ocupa al confirmar a un participante
y se libera al desconfirmarlo. Puede haber más inscritos que plazas (suplentes)
sin que eso rompa nada: el cupo lo marcan los confirmados.

### Operaciones disponibles

| Operación       | Efecto                                                    |
| --------------- | --------------------------------------------------------- |
| Alta            | Crea el participante como `REGISTERED`, sin plaza         |
| Edición         | Cambia nombre, tag de Clash Royale o notas                |
| Confirmación    | Le asigna la primera plaza libre (o una concreta)         |
| Desconfirmación | Libera la plaza y vuelve a `REGISTERED`                   |
| Baja            | Lo elimina, mientras no forme parte del calendario        |
| Retirada        | Lo marca `WITHDRAWN` conservando su historial             |
| Sustitución     | El saliente queda `REPLACED`, el entrante hereda su plaza |

Se validan: nombres duplicados (ignorando mayúsculas), identificadores
duplicados, tags de Clash Royale duplicados, plazas ocupadas y plazas fuera de
rango.

### El paso a READY

Para cerrar la plantilla hacen falta **exactamente 10 confirmados**, cada uno en
una plaza distinta. Con 6, con 9 o con 11 confirmados el sistema devuelve
`ROSTER_INCOMPLETE` y no deja avanzar. Ese es el único umbral que separa "aún
estamos organizando" de "esto ya es una competición".

## Estados del torneo

```
DRAFT ──► REGISTRATION ──► READY ──► SCHEDULED ──► LIVE ──► FINISHED
   │           │  ▲          │ ▲         │ ▲
   │           └──┘          └─┘         └─┘
   │        (se puede volver atrás durante la preparación)
   └──────────────► CANCELLED ◄──────────────────┘
```

| Estado         | Significa                         | Qué se puede hacer                                 |
| -------------- | --------------------------------- | -------------------------------------------------- |
| `DRAFT`        | El torneo existe, nada decidido   | Gestionar plantilla                                |
| `REGISTRATION` | Inscripciones abiertas            | Gestionar plantilla                                |
| `READY`        | 10 confirmados, plantilla cerrada | Gestionar plantilla, generar fixture               |
| `SCHEDULED`    | Calendario oficial publicado      | Regenerar fixture, sustituir jugadores, sancionar  |
| `LIVE`         | Competición en juego              | Cargar y corregir resultados, sancionar, sustituir |
| `FINISHED`     | Terminada                         | Nada (terminal)                                    |
| `CANCELLED`    | Cancelada                         | Nada (terminal)                                    |

Dos decisiones que conviene entender:

- **Se puede volver atrás durante la preparación** (`READY → REGISTRATION`,
  `SCHEDULED → READY`). Descartar un fixture mal sorteado no debería obligar a
  borrar el torneo.
- **No se puede volver atrás una vez en `LIVE`.** A partir de ahí la plantilla
  no se toca con las operaciones normales: cualquier cambio pasa por el
  mecanismo de sustitución, que deja rastro.

## Resultados

Un resultado se registra con dos números: **coronas del local y coronas del
visitante**. Todo lo demás se deriva.

### Validación del marcador

| Regla                        | Comportamiento                     |
| ---------------------------- | ---------------------------------- |
| Coronas enteras entre 0 y 3  | `INVALID_CROWNS` si no             |
| Los dos no pueden llegar a 3 | `INVALID_CROWNS` si no             |
| Marcador empatado            | `DRAW_NOT_ALLOWED`: no hay empates |
| Un jugador contra sí mismo   | `SELF_MATCH`                       |

Marcadores válidos: `3-0`, `3-1`, `3-2`, `2-1`, `2-0`, `1-0` y sus simétricos.

**No existen empates.** Un 2-2 no es un resultado válido: el partido debe
resolverse con un ganador.

### Cómo llega un resultado

Hay dos caminos, y ambos acaban en el mismo sitio:

1. **Doble reporte.** Cada jugador reporta el marcador, siempre en orden
   local-visitante. Si los dos coinciden, el resultado queda validado y el
   partido pasa a `COMPLETED`. Si se contradicen, pasa a `DISPUTED` y lo resuelve
   un administrador.
2. **Registro administrativo.** El administrador carga el marcador directamente.
   Es también la vía para resolver una disputa.

Un partido en `DISPUTED` **deja de contar en la clasificación** hasta que se
resuelve: es preferible una tabla con un partido menos que una tabla con un
resultado que las dos partes no reconocen.

### Plazo para impugnar

**24 horas** desde que el resultado se cierra. Pasado el plazo solo cabe una
corrección administrativa extraordinaria, que queda auditada. Configurable en
`disputes.windowHours`.

### Qué se deriva

| Dato derivado    | Regla                                                 |
| ---------------- | ----------------------------------------------------- |
| Ganador          | Quien tenga más coronas                               |
| Tipo de victoria | `MAX_CROWNS` si el ganador llegó a 3; si no, `NORMAL` |
| Puntos           | Según la tabla de puntuación                          |

### Estados de un partido

`SCHEDULED` · `LIVE` · `COMPLETED` · `POSTPONED` · `CANCELLED` · `DISPUTED`

Aparte del estado, cada resultado guarda **cómo se resolvió**: `PLAYED`,
`WALKOVER` (incomparecencia) o `ADMIN_DECISION`. Separar las dos cosas evita el
error clásico de mezclar "en qué punto está el partido" con "de dónde sale el
marcador".

### Corrección de resultados

Corregir no sobrescribe: se guarda el valor anterior, el nuevo, el motivo y
quién lo hizo (`match_result_revisions`), y la clasificación se recalcula sola.
Ver [data-model.md](data-model.md#match_result_revisions).

## Partidos aplazados

**Un inconveniente real no es una derrota.** Si un jugador no puede disputar su
partido, este pasa a `POSTPONED`:

- no reparte puntos,
- no suma ni resta coronas,
- no cuenta como partido jugado (PJ),
- se reprograma y se juega más adelante.

Motivos previstos: problema personal, problema técnico, problema de conexión,
inconveniente de horario, indisponibilidad justificada, decisión administrativa
u otro. El motivo escrito es **obligatorio**: sin motivo no hay nada que
explicar después.

### La jornada original no se pierde

Un partido aplazado **nunca cambia de jornada**. Si el partido era de la fecha 7
y acaba jugándose el 15 de octubre, el sistema sigue diciendo que era de la
fecha 7, con qué fecha estaba programado originalmente, por qué se aplazó, quién
lo autorizó y cuándo.

Cada aplazamiento y cada reprogramación añaden una entrada al historial del
partido (`match_postponements`), con el evento, la jornada, las dos fechas, el
motivo, el administrador y el momento. Nada se sobrescribe en silencio.

### Ciclo

```
SCHEDULED ──► POSTPONED ──► SCHEDULED ──► LIVE ──► COMPLETED
              (motivo,       (nueva
               autor)         fecha)
```

Un partido aplazado no puede pasar directamente a `COMPLETED`: primero vuelve al
calendario con una fecha nueva.

## Incomparecencia

Un jugador dispone de **15 minutos de tolerancia**.

**Pasado el plazo no ocurre nada automáticamente.** El sistema no convierte
ningún partido en derrota por tiempo: hace falta una acción explícita del
administrador. Un temporizador no distingue «no se presentó» de «la plataforma
tenía mal la hora», y esa diferencia decide una jornada.

Cuando el administrador la declara (regla **R-09**, decidida el 10 de septiembre
de 2026):

- quien se presentó suma **PJ +1, VG +1 y 3 puntos**;
- quien faltó suma **PJ +1 y VP +1**, con 0 puntos;
- **no se reparten coronas**, así que la diferencia de coronas de los dos queda
  igual que estaba.

Tres puntos, no cuatro: los cuatro son de una victoria por tres coronas, y esa
hay que conseguirla jugando. Y ningún marcador inventado: un 3-0 ficticio
contaminaría la diferencia de coronas, que es el primer desempate después de
los puntos.

El partido queda distinguible de una victoria jugada para siempre, y la
interfaz lo enseña como en todas partes. Detalle completo en
[walkover.md](walkover.md).

## Puntuación

| Situación                       | Puntos    |
| ------------------------------- | --------- |
| Victoria normal                 | **3**     |
| Victoria consiguiendo 3 coronas | **4**     |
| Derrota                         | **0**     |
| Sanción por BM                  | **−2**    |
| Empate                          | no existe |
| Victoria por incomparecencia    | **3**     |

Los puntos **nunca** se almacenan como valor editable. Son una función pura del
resultado y del reglamento vigente.

## Coronas y DC

Cada partido registra las coronas de ambos jugadores. De ahí salen:

- **CF** — coronas a favor
- **CC** — coronas en contra
- **DC** — diferencia de coronas = CF − CC

Ejemplo: 30 realizadas y 22 recibidas → DC = **+8**.

En una liga cerrada la suma de todas las DC es siempre 0; el motor lo comprueba
en los tests.

## Clasificación

Columnas mínimas: **POS · JUGADOR · PJ · VG · VP · DC · PTS**.

El motor calcula además VE (empates), V3C (victorias por 3 coronas), CF, CC y
los puntos perdidos por sanción, disponibles para la interfaz.

| Abreviatura | Significado                                      |
| ----------- | ------------------------------------------------ |
| PJ          | Partidos jugados (solo los que tienen resultado) |
| VG          | Victorias                                        |
| VP          | Derrotas                                         |
| VE          | Empates                                          |
| V3C         | Victorias por 3 coronas                          |
| CF / CC     | Coronas a favor / en contra                      |
| DC          | Diferencia de coronas                            |
| PTS         | Puntos finales (deportivos + sanciones)          |

La tabla **no es editable**. No existe ninguna operación que escriba una
posición o un total de puntos.

### Desempates

Orden por defecto, configurable en `TournamentSettings.tiebreakers`:

1. Puntos
2. Diferencia de coronas (DC)
3. Victorias
4. Enfrentamiento directo
5. Victorias por 3 coronas

Criterios disponibles además de esos: `CROWNS_FOR`, `FEWEST_CROWNS_AGAINST`,
`FEWEST_SANCTIONS`. Cambiar la política es reordenar una lista de
identificadores.

El **enfrentamiento directo** se resuelve como mini-liga: entre los jugadores
empatados se cuentan solo los partidos que disputaron entre ellos (primero
puntos, luego diferencia de coronas). Así un triple empate se resuelve bien; una
comparación por parejas podría ser intransitiva.

Si tras aplicar todos los criterios dos jugadores siguen exactamente iguales,
**comparten posición** y quedan marcados con `unresolvedTie`. El sistema no
inventa un ganador: avisa de que hace falta una regla adicional
(ver [pending-rules.md](pending-rules.md)).

## Sanciones

No hay ningún detector automático de BM. **La sanción siempre la registra un
administrador.**

Cada sanción guarda: jugador, tipo, motivo, penalización, fecha, administrador
responsable, evidencia opcional, observaciones y, si aplica, partido y jornada.

| Regla                           | Valor                                |
| ------------------------------- | ------------------------------------ |
| Penalización por defecto        | −2 puntos                            |
| Penalización máxima por sanción | −20 (cota de seguridad configurable) |
| Signo                           | Siempre ≤ 0                          |
| Motivo y administrador          | Obligatorios                         |

Una sanción no se borra: se **anula** (`REVOKED`), conservando quién la anuló y
por qué. La tabla se recalcula sola. Un jugador puede quedar con puntos
negativos; es intencionado.

### Qué se considera BM

Definición inicial acordada el 8 de septiembre de 2026:

- El **uso normal de emotes no constituye BM**.
- Sí es potencialmente sancionable la conducta **deliberadamente provocadora o
  antideportiva** que exceda ese uso normal. Por ejemplo: spam deliberado y
  persistente, provocación repetitiva, o conducta claramente destinada a
  hostigar al rival.

**La decisión final es del administrador.** El motor aplica la penalización que
se le indique; no juzga la conducta ni la detecta.
