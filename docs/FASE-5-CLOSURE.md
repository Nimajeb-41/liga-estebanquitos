# Fase 5 · Informe de cierre

**Fecha:** 13 de septiembre de 2026
**Estado:** cerrada
**Objetivo:** temporada real, operación competitiva y producción.

---

## Resumen en una página

La Fase 4 dejó la plataforma **correcta**. La Fase 5 la deja **operable y
cerrable**: se puede llevar una temporada entera de principio a fin, y
terminarla de una forma que siga siendo cierta dentro de un año.

Tres cosas cambiaron de fondo:

1. **P-01 se cerró como concepto del dominio, no como un `if`.** Una
   incomparecencia no es un marcador: es la ausencia de uno. Por eso
   `resolveWalkover` es una función aparte, el ganador sale de **quién faltó** y
   no de las coronas, y la base guarda `absent_player_id` para poder
   reconstruirlo al leer. Sigue siendo la única regla que esta fase cerró.

2. **La temporada se puede terminar sin que la historia cambie después.**
   Cerrar es una operación explícita y auditada que genera una instantánea con
   la clasificación final **y el reglamento con el que se calculó**. Existe
   porque la tabla se deriva: cambiaría al configurar la temporada siguiente.

3. **Operar dejó de ser repetir formularios.** Jornadas con su programación en
   bloque, centro de acción que enumera lo que espera una decisión, evolución de
   la tabla, cara a cara y récords.

**Ninguna otra regla pendiente se cerró.** Siguen las diez, y ninguna quedó
decidida de tapadillo por código.

### Verificación

`npm run verify` pasa en verde: auditoría de secretos, auditoría de índices,
formato, lint, tipos, tests y build.

| Suite                             | Fase 4  | Fase 5  |
| --------------------------------- | ------- | ------- |
| `@liga/domain`                    | 203     | 250     |
| `@liga/database`                  | 12      | 12      |
| `@liga/api`                       | 265     | 341     |
| `@liga/web`                       | 129     | 139     |
| **Total unitarios e integración** | **609** | **742** |

---

## Qué se hizo, bloque por bloque

### 5.1 · Cierre de temporada e instantánea

`seasonClosureReport(matches)` dice qué falta para poder cerrar: partidos sin
jugar, en juego, aplazados o en disputa. Los cancelados **no** bloquean, a
propósito: ya se decidió que no se juegan.

`finishSeason` exige `acknowledgePending: true` para cerrar con asuntos abiertos,
y la auditoría guarda cuáles eran. `createSeasonSnapshot` graba la temporada
entera —reglas, participantes, calendario, resultados, sanciones, clasificación,
estadísticas y evidencia externa— con `source` en cada bloque y **sin tokens, ni
sesiones, ni credenciales**.

### 5.2 · Configuración de la temporada

Qué se puede cambiar, y cuándo. `assertSettingsChangeAllowed(status, changed)`
separa tres familias:

- **Formato** (`rosterSize`, `legs`) queda **fijado** en cuanto existe calendario.
  Cambiarlo después dejaría un calendario que no corresponde a ningún formato.
- **Puntuación** sí se puede cambiar en marcha, y la pantalla avisa de lo que
  implica: **recalcula la tabla hacia atrás**, incluidas las jornadas jugadas.
  Por eso `nextRulesVersion` sube la versión del reglamento automáticamente: dos
  tablas distintas no pueden compartir etiqueta.
- **Operación** (plazos, tolerancia) no repuntúa nada.

Un cambio mixto se rechaza entero. Aplicar «lo que se pueda» dejaría una
configuración que nadie pidió.

### 5.3 · Participantes y cierre de inscripción

`deletePlayer` rechaza borrar a quien ya figura en el calendario
(`PLAYER_HAS_MATCHES`, 409). Borrarlo dejaría partidos apuntando a un
participante inexistente, y la clasificación se calcularía sobre un calendario
incompleto sin decirlo.

### 5.4 · Generación del calendario

Verificado, sin cambios: la generación con semilla, el bloqueo de regeneración y
la auditoría ya estaban. 90 partidos, 45 emparejamientos, cada uno ida y vuelta.

### 5.5 · Operación de jornada y centro de acción

`/admin/jornadas` y `/admin/jornadas/[n]`, con programación en bloque
(`POST /admin/rounds/:number/schedule`) y el **centro de acción** en el resumen
(`GET /admin/attention`).

Ver [operacion.md](operacion.md) para las decisiones: qué se toca y qué no al
programar en bloque, por qué el centro ordena por antigüedad y no por gravedad, y
por qué enumera sin ejecutar.

### 5.6–5.10 · Jornada, aplazamientos, disputas, Match Center

Ya existían de la Fase 4. Verificados contra la suite.

### 5.7 · Incomparecencia, de punta a punta

Backend (`declareWalkover`), contrato (`actions.walkover`) e interfaz. El
formulario **no deja declararla antes de la tolerancia** y lo dice con la hora
exacta a partir de la cual se podrá; exige escribir `INCOMPARECENCIA`; y avisa de
lo que va a pasar: gana con 3 puntos y **sin coronas**.

No se registra ningún marcador. Un 3–0 inventado contaminaría la diferencia de
coronas de los dos.

### 5.11 · Evolución de la clasificación

`GET /api/v1/standings/history` y la cuadrícula en `/clasificacion`: una fila por
participante, una columna por jornada jugada.

Solo aparecen jornadas **con algo jugado**. Una jornada entera aplazada repetiría
el punto anterior y sugeriría que pasó algo cuando no pasó nada.

No es un archivo histórico: **se recalcula** con el reglamento vigente, y la
pantalla lo dice. Por eso viaja `rulesVersion`.

### 5.12 · Estadísticas con incomparecencias

`walkoversFor` y `walkoversAgainst`, y una corrección de fondo que este bloque
destapó: las medias de coronas promediaban sobre **todos** los partidos, walkover
incluido. Eso **castigaba al que sí se presentó** —con una victoria 3–1 y una
incomparecencia a favor, su media caía de 3 a 1,5—.

Ahora se promedia sobre los partidos con batalla, y el resultado es `null` —no
cero— si alguien solo tiene incomparecencias. Los totales sí las incluyen: esas
coronas son reales.

### 5.13 · Cara a cara y récords

`/cara-a-cara` (selección en la URL, funciona sin JavaScript) y los récords en
`/estadisticas`.

Las incomparecencias quedan **fuera de los récords de marcador**: contar un
walkover como «la mayor goleada» inventaría una batalla. Un récord sin datos se
publica con `value: null`, nunca con un cero, y un empate en el máximo nombra a
todos los empatados.

### 5.14–5.17 · Clash Royale, candidatos, cartas, OBS

Ya existían de la Fase 3 y 4. La sincronización automática sigue **apagada por
defecto**, ningún candidato se confirma solo, y `verifytoken` sigue sin usarse
como si fuera una verificación oficial —porque no lo es—.

### 5.18 · Capa de eventos internos

Bus tipado en proceso (`apps/api/src/events.ts`) con dos suscriptores reales: el
registro estructurado y el contador de revisiones que usa
`GET /api/v1/matches/:id/live`.

No es la auditoría, y la diferencia está escrita en el código: la auditoría
responde ante el reglamento y perder una entrada es un problema; los eventos
sirven para reaccionar, viven en memoria y perderlos no rompe nada.

### 5.19–5.21 · Auditoría, finalización, multi-temporada

La auditoría filtrable ya estaba. La finalización se hizo en 5.1 y su interfaz en
5.2. La preparación multi-temporada descansa en la instantánea: una temporada
cerrada no depende de la configuración de la siguiente.

### 5.22–5.27 · UX, accesibilidad, seguridad y verificación

`npm run verify` en verde, incluidas las auditorías de secretos e índices.

---

## Lo que esta fase decidió no hacer

- **No se cerró ninguna regla pendiente además de P-01.** Siguen las diez, y
  ninguna se decidió por código. En concreto: no se inventó qué pasa con una
  desconexión, un abandono, una sustitución, quién puede aplazar, cómo se
  desempata al final, ni cómo se verifica la propiedad de una cuenta.
- **P-11 sigue abierta** porque no existe verificación oficial de propiedad
  disponible para este flujo. `verifytoken` no es una API documentada para esto y
  no se usa como si lo fuera.
- **Un partido cancelado sigue sin repartir nada.** Si eso es lo correcto frente
  a dar los puntos al rival depende de **P-05** y **P-06**, que siguen abiertas.
- **No se empezó la Fase 6.**

---

## Deuda conocida

- La evolución de la clasificación recalcula la tabla una vez por jornada jugada.
  Con 18 jornadas y 10 participantes es inmediato; con una liga mucho mayor
  habría que memorizar el acumulado en vez de reconstruirlo.
- Las revisiones de partido viven en memoria: en varias instancias, cada una
  llevaría su propia cuenta. El efecto sería un refresco de más en el cliente, no
  un dato incorrecto.
- `fileParallelism: false` en los tests de la API. Nueve instancias de PGlite en
  paralelo agotaban la memoria. Serializar cuesta ~100 s; la alternativa era una
  suite que fallaba sin decir en qué test.

---

## Reglas pendientes

Diez abiertas. Ver [pending-rules.md](pending-rules.md). Ninguna bloquea operar
la temporada; la única que bloqueaba de verdad era P-01, y se cerró en la Fase 4
como **R-09**.
