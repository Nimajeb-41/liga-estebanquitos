# Reglas: decididas y pendientes

Este documento tiene dos partes. Arriba, lo que el administrador **ya decidió**
y el sistema hace cumplir. Abajo, lo que sigue **sin decidir**: donde el motor
se topa con una de esas situaciones, falla de forma explícita en lugar de
improvisar ([ADR 0005](adr/0005-reglas-pendientes-explicitas.md)).

Última actualización: **10 de septiembre de 2026** · reglamento `2026-1.2`.

---

## Reglas decididas

### R-01 · No existen empates — decidida el 2026-09-08

Un marcador con coronas iguales (2-2, 1-1, 0-0) **se rechaza**: el partido debe
resolverse con un ganador.

Implementado: `scoring.draw = null` y error `DRAW_NOT_ALLOWED` al registrar o
reportar el resultado. Probado en dominio y en API.

### R-02 · Victoria con 3 coronas = 4 puntos, sea cual sea el marcador

Cuenta cualquier victoria en la que el ganador llegue a 3 coronas: 3-0, 3-1 y
3-2 valen 4. 2-0 y 2-1 valen 3.

### R-03 · Tolerancia de 15 minutos, sin efecto automático — decidida el 2026-09-08

Un jugador dispone de 15 minutos de tolerancia. **Pasado el plazo no ocurre nada
por sí solo**: el sistema no convierte el partido en derrota. Hace falta una
acción explícita del administrador.

Implementado: `noShow.toleranceMinutes = 15`, `noShow.automatic = false`. No hay
ningún proceso automático que toque un partido por tiempo.

> Qué pasa después de la tolerancia ya está decidido: ver **R-09** abajo.

### R-09 · Incomparecencia: 3 puntos y ninguna corona — decidida el 2026-09-10

Cierra **P-01**. Pasada la tolerancia de 15 minutos (R-03), el administrador
puede declarar la incomparecencia:

|         | Presente   | Ausente    |
| ------- | ---------- | ---------- |
| PJ      | +1         | +1         |
| VG / VP | VG +1      | VP +1      |
| Puntos  | **+3**     | 0          |
| Coronas | 0          | 0          |
| DC      | sin cambio | sin cambio |

Tres puntos, **no cuatro**: los cuatro son de una victoria por tres coronas, y
esa hay que conseguirla jugando. Cero coronas, **no un 3-0 inventado**: la
diferencia de coronas es el primer desempate después de los puntos, y dos
incomparecencias decidirían la liga con coronas que nadie consiguió.

Sigue **sin ser automática** (R-03): un temporizador no distingue «no se
presentó» de «la plataforma tenía mal la hora».

Implementado: `scoring.walkoverWin = 3`, `scoring.walkoverCrowns = [0, 0]`,
`victoryType = WALKOVER`, endpoint `POST /api/v1/admin/matches/:id/walkover` y
columna `match_results.absent_player_id`. Detalle completo en
[walkover.md](walkover.md).

> Lo que **no** cierra: si el ausente recibe además una sanción, y si cambia
> algo cuando avisó con antelación. Ninguna de las dos bloquea nada —una
> sanción se pone a mano por la vía de siempre— pero tampoco están decididas.

### R-04 · Un aplazamiento no es una derrota — decidida el 2026-09-08

Ante un inconveniente real, el partido pasa a `POSTPONED`: no puntúa, no suma
coronas y no cuenta como jugado. Se reprograma y se juega después.

El partido **conserva siempre su jornada original** y su fecha originalmente
programada. Cada aplazamiento y cada reprogramación dejan una entrada de
historial con motivo, autor y las dos fechas. Nada se sobrescribe en silencio.

### R-05 · Validación de resultados por doble reporte — decidida el 2026-09-08

Ambos jugadores reportan el marcador en el mismo orden (local-visitante):

- coinciden → resultado validado, el partido pasa a `COMPLETED`;
- se contradicen → el partido pasa a `DISPUTED` y lo resuelve un administrador.

Un partido en disputa **deja de contar en la clasificación** hasta que se
resuelve.

### R-06 · Plazo de impugnación: 24 horas — decidida el 2026-09-08

Pasadas 24 horas desde el cierre de un resultado, solo cabe una corrección
administrativa extraordinaria, que queda auditada. Configurable en
`disputes.windowHours`.

### R-07 · Definición inicial de BM — decidida el 2026-09-08

El **uso normal de emotes no constituye BM**. Es potencialmente sancionable la
conducta deliberadamente provocadora o antideportiva que exceda ese uso normal:
spam deliberado y persistente, provocación repetitiva, o conducta claramente
destinada a hostigar al rival.

La decisión final corresponde al administrador. **No hay ni habrá detector
automático.** Sanción estándar: −2 puntos.

### R-08 · Corregir nunca sobrescribe — decidida en Fase 0, implementada en Fase 1

Toda corrección conserva el valor anterior, el nuevo, el motivo, el
administrador y la fecha (`match_result_revisions` + `audit_log`).

---

## Reglas pendientes

### Bloqueantes antes de la primera jornada oficial

#### P-02 · Desconexiones e interrupciones

¿Qué pasa si alguien se desconecta a mitad de batalla? ¿Se repite el partido?
¿Depende del marcador en ese momento? ¿Y si la caída es de los servidores de
Supercell?

Hoy la única salida es aplazar o que el administrador registre el resultado que
decida, dejando constancia.

#### P-03 · Formato exacto del partido

El motor asume **una batalla por partido**, con máximo 3 coronas por jugador,
que es lo que encaja con los marcadores del reglamento. Falta confirmarlo.

Si pasara a ser al mejor de tres, cambian `crowns.maxPerMatch`, la definición de
"victoria con máximo de coronas" y el significado de la DC.

### Importantes antes de que avance la competición

#### P-04 · Mazos entre partidas

¿Se puede cambiar de mazo entre batallas? ¿Hay que registrarlo antes de jugar?
¿Existen cartas o mazos prohibidos? El modelo de datos ya está preparado
(`decks`, `deck_cards`), sin integración todavía.

#### P-05 · Abandono después de empezar

Qué ocurre con los partidos ya jugados de quien abandona. Tres opciones, no
equivalentes:

1. Se anulan todos sus resultados (cambia la tabla de todos).
2. Se conservan y sus partidos restantes se dan por perdidos.
3. Entra un sustituto que hereda su calendario **y** su historial.

Estado del motor: la sustitución con calendario ya publicado **solo se permite
si el saliente no ha jugado ningún partido**; si ha jugado, falla con
`PENDING_RULE` apuntando a esta regla. Ver
[ADR 0007](adr/0007-sustitucion-participantes.md).

#### P-06 · Plazo límite para sustituir

Está resuelto el mecanismo; falta el plazo. ¿Se admiten sustituciones una vez
publicado el calendario? ¿Hasta la jornada 1? ¿Hasta la 3?

#### P-07 · Qué puede hacer cada rol

Existen `OWNER`, `ADMIN`, `REFEREE` y `VIEWER`, y toda acción queda auditada.
Hoy los tres primeros pueden hacer lo mismo. Falta decidir, por ejemplo, si un
`REFEREE` puede corregir un resultado ya verificado o solo proponerlo.

#### P-08 · Aplazamientos: quién y hasta cuándo

El mecanismo está implementado. Falta decidir quién puede pedir un aplazamiento,
con cuánta antelación, cuántas veces se puede aplazar el mismo partido y hasta
qué fecha límite se puede jugar.

### Deseables antes del final de la temporada

#### P-09 · Empate en la clasificación final

Si tras los cinco criterios dos jugadores siguen exactamente iguales (el motor
lo marca como `unresolvedTie` y comparten posición), ¿qué pasa? ¿Partido de
desempate, campeonato compartido, o un sexto criterio?

#### P-10 · Procedimiento ante errores administrativos

El mecanismo técnico existe (revisiones y anulaciones, todo auditado). Falta el
procedimiento: si hay que comunicarlo públicamente y si el afectado puede
apelar.

#### P-11 · Identidad de jugador

Hoy los reportes los introduce un administrador indicando de quién son
([ADR 0010](adr/0010-reportes-autenticados.md)). Para que los jugadores reporten
ellos mismos hace falta decidir el mecanismo: cuentas propias o un token por
participante.

---

## Análisis de cierre — Fase 4, 10 de septiembre de 2026

Se revisaron las once, una por una, buscando cuáles se podían cerrar con la
evidencia disponible.

**Ninguna se cerró en la Fase 4.** No fue pereza: las once son decisiones
**deportivas o de procedimiento**, y ninguna se deduce del código, de la API ni
de los datos. Lo que sí cambió es que quedó escrito, para cada una, qué falta
exactamente y quién tiene que decidirlo.

> **Actualización del 10 de septiembre de 2026.** En la Fase 5, quien lleva la
> liga decidió **P-01**. Es la única cerrada; las otras diez siguen abiertas y
> la tabla de abajo mantiene su análisis. Ver **R-09** arriba y
> [walkover.md](walkover.md).

| Regla | Estado                   | Mecanismo técnico                                  | Qué falta, y es de quien lleva la liga                                       |
| ----- | ------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| P-01  | **CERRADA** (2026-09-10) | 3 puntos, 0 coronas, `victoryType = WALKOVER`      | Nada. Queda abierto si el ausente recibe además sanción, que no bloquea      |
| P-02  | **ABIERTA**              | Aplazar o decisión administrativa, ambas auditadas | Si una desconexión repite el partido, y qué pasa si cae Supercell            |
| P-03  | **ABIERTA**              | `crowns.maxPerMatch` configurable                  | Confirmar que es una batalla por partido                                     |
| P-04  | **ABIERTA**              | Los mazos observados se guardan y se muestran      | Si se puede cambiar de mazo, si hay que declararlo, si hay cartas prohibidas |
| P-05  | **ABIERTA**              | La sustitución falla si el saliente ya jugó        | Qué pasa con los partidos ya jugados de quien abandona                       |
| P-06  | **ABIERTA**              | Sustitución implementada                           | Hasta cuándo se admite                                                       |
| P-07  | **ABIERTA**              | Cuatro roles, todo auditado                        | Qué puede hacer cada uno                                                     |
| P-08  | **ABIERTA**              | Aplazamientos con historial completo               | Quién puede pedirlos, con cuánta antelación y cuántas veces                  |
| P-09  | **ABIERTA**              | El empate irresoluble se marca (`unresolvedTie`)   | Qué se hace con él                                                           |
| P-10  | **ABIERTA**              | Revisiones y anulaciones, todo trazado             | Si se comunica públicamente y si cabe apelación                              |
| P-11  | **ABIERTA**              | Vinculación de cuentas, siempre `UNVERIFIED`       | Si se asume `verifytoken`, que **no es oficial**                             |

### Evidencia nueva que puede ayudar a decidir

De la Fase 3, y solo como insumo. **Nada de esto cierra nada.**

- **P-03.** En las 31 batallas observadas las coronas fueron de 0 a 3, con
  máximo 3. Es _consistente_ con una batalla por partido, pero una muestra no
  demuestra el formato: la liga podría decidir al mejor de tres y el motor
  tendría que cambiar.
- **P-04.** La API expone `deckSelection` —se observó `collection`— además de
  los ocho naipes con su nivel y su evolución. Ahora se puede _comprobar_ qué
  mazo se usó; sigue sin decidirse qué está permitido.
- **P-11.** `POST /players/{tag}/verifytoken` existe pero **Supercell no lo
  documenta**. Apoyar la identidad del torneo en él es asumir que puede
  desaparecer sin aviso. Es una decisión de riesgo, no técnica. Ver
  [ADR 0015](adr/0015-vincular-no-es-verificar.md).

### Cuál urge

**P-01 era la única que bloqueaba de verdad**, y se cerró el 10 de septiembre
de 2026: el motor ya puede registrar una incomparecencia, que es algo que puede
ocurrir en la primera jornada.

Las demás admiten espera, con una salvedad: **P-05** y **P-06** dejan de ser
teóricas en cuanto alguien abandone, y para entonces la decisión se toma con
prisa y con un caso concreto delante, que es la peor forma de decidir una regla.

---

## Cómo se cierra una regla

1. Se decide y se anota **aquí**, con fecha, en la sección de decididas.
2. Se traslada a la configuración (`TournamentSettings` /
   `tournament_settings`), no al código.
3. Se añade el test que la fija.
4. Se sube `rulesVersion`.
5. Se documenta en [tournament-rules.md](tournament-rules.md).

Ninguna regla se cierra escribiendo un `if` en medio del motor.
