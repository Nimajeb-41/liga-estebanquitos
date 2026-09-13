# Estadísticas

Todas las cifras de la plataforma pertenecen a una de dos familias, y la
distinción está impuesta por los tipos, no por la disciplina de quien escribe el
código.

|               | **OFICIAL**                                                     | **OBSERVADO**                                     |
| ------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| De dónde sale | Del dominio: los mismos partidos que alimentan la clasificación | De lo que devolvió la API de Clash Royale         |
| Qué decide    | La clasificación                                                | Nada                                              |
| Muestra       | Todos los partidos que cuentan                                  | Solo las batallas que se pudieron traer           |
| Cómo viaja    | `source: 'OFFICIAL'`                                            | `source: 'OBSERVED'` + `sampleSize` obligatorio   |
| Dónde se ve   | `/estadisticas`, ficha de jugador                               | `/cartas`, evidencia de partido, mazos observados |

No se mezclan en ninguna respuesta. Hay un test que comprueba que la respuesta
oficial no contiene ni la palabra `OBSERVED` ni la palabra `clash`.

---

## Por qué `sampleSize` no es opcional

«Usa esta carta el 100 % de las veces» puede significar dos batallas o
doscientas. Sin el tamaño de la muestra un porcentaje observado no significa
nada, así que el envoltorio de todo dato observado lo exige:

```ts
export interface ObservedStatistic<T> {
  source: 'OBSERVED';
  provider: string;
  value: T;
  sampleSize: number;
}
```

La interfaz lo muestra siempre: «Basado en N mazos observados», «X de N mazos
(Y %)», y la etiqueta `Observado · N batallas`.

---

## `null` no es `0`

Un porcentaje de victorias de `0` dice «lo intentó y falló siempre». Un
participante que todavía no ha jugado no ha fallado nada: su `winRate` es `null`,
y la interfaz pinta un guion.

Lo mismo con `averageCrownsFor`, `averageCrownsAgainst`, `maxCrownWinRate` y los
puntos de un partido cuyo reglamento aún no está definido.

En las tablas, **un guion significa que no hay datos, no que el valor sea cero**.
Está escrito debajo de cada tabla que puede mostrarlo.

---

## Qué cuenta y qué no

Solo cuentan los partidos `COMPLETED`. Lo decide `countsForStandings`, la misma
función del dominio que usa la clasificación; la interfaz la pregunta en vez de
suponerlo.

| Estado      | ¿Cuenta? | Cómo se presenta                        |
| ----------- | -------- | --------------------------------------- |
| `SCHEDULED` | No       | «Todavía no se ha jugado»               |
| `LIVE`      | No       | Marcador provisional, se dice que lo es |
| `COMPLETED` | **Sí**   | Resultado registrado                    |
| `POSTPONED` | No       | Conserva jornada y fecha original       |
| `DISPUTED`  | No       | «No cuenta hasta que se resuelva»       |
| `CANCELLED` | No       | «No cuenta para nadie»                  |

En la actividad de la temporada, aplazados y disputados tienen **casilla propia**
y no se suman a «finalizados». Meterlos ahí sería la forma más silenciosa de
mentir en esa pantalla.

---

## Estadísticas oficiales de un participante

Calculadas por `computePlayerStatistics` en `@liga/domain`:

- **Recuentos**: jugados, victorias, derrotas, empates.
- **Porcentajes**: `winRate`, `maxCrownWinRate` — `null` sin partidos.
- **Coronas**: a favor, en contra, diferencia, medias.
- **Puntos**: de partidos, de sanciones, total. Los reparte
  `pointsForResult(result, settings)`; si una regla pendiente impide calcularlos
  —una incomparecencia con **P-01** abierta— ese partido **no aporta puntos**, no
  se inventa un cero con significado.
- **Rachas**: la actual (con su tipo) y la mejor de victorias y la peor de
  derrotas. Son cosas distintas y se muestran por separado.
- **Local y visitante**: los dos bloques suman exactamente el total. En esta liga
  «local» no da ventaja de campo: es el lado del emparejamiento, y sirve para ver
  si alguien rinde distinto según cómo se le sortea.

- **Incomparecencias**: `walkoversFor` (no apareció el rival) y
  `walkoversAgainst` (no apareció este participante). Se cuentan aparte porque no
  son una victoria ni una derrota normales.

### Por qué una incomparecencia no entra en las medias de coronas

Una incomparecencia no es un partido de cero coronas: es un partido **sin
batalla**. Meterla en la media respondería «cuántas coronas sueles hacer» con un
dato que nunca se midió, y **castigaría al que sí se presentó**: con una victoria
3–1 y una incomparecencia a favor, su media caería de 3 a 1,5.

Por eso `averageCrownsFor` y `averageCrownsAgainst` se calculan sobre los partidos con
batalla, y quedan en `null` —no en cero— si alguien solo tiene incomparecencias.
Los totales de coronas sí las incluyen: esas son coronas reales de la temporada.

Una victoria por incomparecencia tampoco cuenta como victoria por 3 coronas.

---

## Evolución, cara a cara y récords

Tres vistas derivadas de los mismos partidos que la tabla, nunca almacenadas:

- `GET /api/v1/standings/history` — la tabla después de cada jornada jugada.
  Solo aparecen jornadas **con algo jugado**: una jornada entera aplazada
  repetiría el punto anterior y sugeriría que pasó algo cuando no pasó nada.
  Viaja con `rulesVersion`, porque dos gráficas con versiones distintas no son
  comparables.
- `GET /api/v1/head-to-head/:a/:b` — el historial entre dos. Solo cuenta lo
  jugado: responde «qué ha pasado», no «qué queda».
- `GET /api/v1/records` — mayor diferencia, partido con más coronas, racha más
  larga y más victorias por 3 coronas.

**Las incomparecencias quedan fuera de los récords de marcador.** Su resultado no
es un marcador, es la ausencia de uno; contar un walkover como «la mayor goleada»
inventaría una batalla que no se jugó. Un récord sin datos se publica con
`value: null`, nunca con un cero, y un empate en el máximo nombra a **todos** los
empatados.
El orden de los partidos para calcular rachas es `roundNumber`, y a igualdad, el
identificador. Sin un orden estable la racha cambiaría entre ejecuciones.

---

## Líderes por métrica

`leadersBy(rows, metric, 'HIGHEST' | 'LOWEST')` devuelve **todos** los empatados
en el primer puesto, nunca uno arbitrario. En una liga de diez personas los
empates son la norma, y elegir «el primero que salga» sería inventarse un
desempate que el reglamento no contempla.

Los `null` nunca ganan: quien no tiene el dato no encabeza la métrica.

Las métricas defensivas (`crownsAgainst`, `averageCrownsAgainst`) llevan
`lowerIsBetter: true` y la interfaz escribe «cuanto menos, mejor» al lado. Un
número pequeño destacado sin esa frase se lee como un mal resultado.

---

## Estadísticas observadas

### Cartas (`/cartas`)

Recuento de en cuántos mazos observados aparece cada carta, con su rareza, coste
y frecuencia de evolución. Los iconos vienen de `api-assets.clashroyale.com`, que
es donde la propia API los publica; no se descarga ni se rehospeda ninguno.

**No es un ranking del metajuego y no pretende serlo.** Con una muestra pequeña
una carta puede parecer dominante solo porque alguien la usó dos veces seguidas,
y eso está escrito en la propia página.

### Mazos de un participante

Solo de batallas cuya correspondencia con un partido **confirmó un
administrador**. Enseñar mazos de batallas sueltas mezclaría partidas de la liga
con partidas de picar, y no hay forma de distinguirlas.

La **media de elixir** se calcula solo si el catálogo conoce el coste de las ocho
cartas. Una media con huecos no es una media: si falta alguno, se dice que no se
sabe.

El rival de una batalla observada aparece nombrado si juega la liga —su tag ya es
público porque lo declaró al inscribirse— y **enmascarado** en cualquier otro
caso.

---

## De dónde no salen las estadísticas

De ningún cálculo en el navegador. Todo lo que se ve viene calculado del backend,
que a su vez lo pide al dominio. Si esta página y la clasificación dijeran cosas
distintas, una de las dos estaría mal —y como salen de la misma función, no
pueden.

---

## Endpoints

| Ruta                                 | Familia   | Qué devuelve                                             |
| ------------------------------------ | --------- | -------------------------------------------------------- |
| `GET /api/v1/statistics`             | Oficial   | Todos los participantes, líderes por métrica y actividad |
| `GET /api/v1/players/:id/statistics` | Oficial   | Estadísticas e historial completo de uno                 |
| `GET /api/v1/cards`                  | Observado | Uso de cartas en las batallas observadas                 |
| `GET /api/v1/players/:id/decks`      | Observado | Mazos observados de un participante                      |

Los dos primeros llevan `source: 'OFFICIAL'`; los dos últimos, `source:
'OBSERVED'` con `sampleSize`.
