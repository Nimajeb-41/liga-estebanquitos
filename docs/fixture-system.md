# Sistema de fixture

Código: `packages/domain/src/fixture/`
Tests: `packages/domain/test/fixture.test.ts` (32 casos)

## Qué genera

Con 10 participantes y dos vueltas:

| Propiedad                                | Valor                       |
| ---------------------------------------- | --------------------------- |
| Jornadas                                 | 18 (9 de ida + 9 de vuelta) |
| Partidos por jornada                     | 5                           |
| Partidos totales                         | 90                          |
| Partidos por jugador                     | 18                          |
| Veces que se enfrenta cada pareja        | 2                           |
| Veces que juega cada jugador por jornada | exactamente 1               |
| Partidos como local por jugador          | 9                           |

## El algoritmo: método del círculo

Se fija al primer participante y se rota al resto. En cada jornada se emparejan
los extremos:

```
Jornada 1        Jornada 2        Jornada 3
  1 – 10           1 – 9            1 – 8
  2 – 9           10 – 8            9 – 7
  3 – 8            2 – 7           10 – 6
  4 – 7            3 – 6            2 – 5
  5 – 6            4 – 5            3 – 4
```

Con N par produce N−1 jornadas en las que cada participante juega exactamente
una vez y cada pareja se enfrenta exactamente una vez. Es el resultado clásico
de la construcción y aquí se comprueba además en los tests, no se da por hecho.

La **vuelta** repite la ida invirtiendo local y visitante. Como consecuencia, en
el total del torneo cada jugador tiene exactamente 9 partidos como local y 9
como visitante: el equilibrio es exacto por construcción, no aproximado.

Dentro de cada vuelta el reparto también está equilibrado (4 o 5 partidos como
local sobre 9): el jugador fijo alterna condición según la paridad de la
jornada, y la rotación reparte el resto. Hay un test que lo verifica.

## Sorteo reproducible

El orden de los participantes se baraja con Fisher-Yates alimentado por un PRNG
determinista (mulberry32 sobre un hash de la semilla). La semilla se guarda
dentro del fixture y en `fixture_generations`.

Esto importa en una competición real: cualquiera puede regenerar el calendario
con la misma semilla y comprobar que sale idéntico. El sorteo es aleatorio pero
auditable, no "aleatorio" a discreción de quien pulsa el botón.

```ts
const fixture = generateFixture(playerIds, { seed: 'sorteo-oficial-2026-1' });
```

| Opción           | Por defecto         | Para qué                                      |
| ---------------- | ------------------- | --------------------------------------------- |
| `seed`           | generada y guardada | Reproducir el sorteo                          |
| `legs`           | `2`                 | `1` para solo ida                             |
| `shufflePlayers` | `true`              | `false` respeta el orden dado (útil en tests) |

## Validación automática

`validateFixture(fixture, playerIds)` devuelve la lista completa de
incumplimientos (para mostrarlos en el panel) y `assertValidFixture` lanza si
hay alguno. Se comprueba:

| Código                     | Comprobación                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `ROUND_COUNT`              | Número de jornadas = (N−1) × vueltas                                                 |
| `ROUND_NUMBERING`          | Jornadas numeradas 1..R sin huecos                                                   |
| `LEG_ASSIGNMENT`           | La primera mitad es ida y la segunda vuelta                                          |
| `ROUND_SIZE`               | N/2 partidos por jornada                                                             |
| `TOTAL_MATCHES`            | Total de partidos                                                                    |
| `SELF_MATCH`               | Nadie contra sí mismo                                                                |
| `UNKNOWN_PLAYER`           | Solo participantes de la plantilla                                                   |
| `PLAYER_TWICE_IN_ROUND`    | Nadie juega dos veces en una jornada                                                 |
| `PLAYER_MISSING_IN_ROUND`  | Nadie se queda sin jugar una jornada                                                 |
| `PAIR_COUNT`               | Cada pareja se enfrenta exactamente `legs` veces                                     |
| `DUPLICATED_ORIENTED_PAIR` | Con ida y vuelta, cada enfrentamiento con la misma condición de local ocurre una vez |
| `MATCHES_PER_PLAYER`       | Partidos por jugador                                                                 |

El validador se prueba **corrompiendo fixtures válidos** a propósito
(quitar una jornada, duplicar un jugador, crear un auto-enfrentamiento) y
comprobando que detecta el problema. Un validador que solo se prueba con datos
correctos no vale para nada.

## Errores

| Código                | Cuándo                                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ODD_PLAYER_COUNT`    | Número impar de participantes. Este formato no contempla jornadas de descanso; si alguna vez se compite con 9, hay que decidir antes cómo funciona el _bye_ |
| `NOT_ENOUGH_PLAYERS`  | Menos de 2                                                                                                                                                  |
| `DUPLICATE_PLAYER_ID` | Participantes repetidos                                                                                                                                     |
| `INVALID_SETTINGS`    | `legs` distinto de 1 o 2                                                                                                                                    |

## Cuándo se genera

Nunca automáticamente. La secuencia es:

1. La plantilla llega a **exactamente 10 confirmados** → `READY`.
2. El administrador pulsa _generar fixture_ → se crean las 18 jornadas y los 90
   partidos, se valida y se guarda con su semilla → `SCHEDULED`.
3. El administrador arranca la competición → `LIVE`.

Mientras el torneo esté en `SCHEDULED` se puede descartar el calendario y
volver a `READY`. Una vez en `LIVE`, no.

## Genérico, no atado a 10

El motor funciona con cualquier número par de participantes; hay tests para 4,
6, 8, 10, 12 y 16. Los "18" y los "90" salen de la configuración, no están
escritos en el algoritmo.
