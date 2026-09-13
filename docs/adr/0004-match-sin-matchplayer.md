# ADR 0004 — Local y visitante en la fila del partido, sin tabla `MatchPlayer`

**Estado:** aceptada · 2026-09-08

## Contexto

El modelo propuesto inicialmente incluía una entidad `MatchPlayer`, el patrón
habitual cuando un partido puede tener un número variable de participantes
(equipos, 2v2, torneos por escuadras).

Esta liga es **1v1 estricto**: siempre dos jugadores, siempre distintos.

## Decisión

`matches` guarda `home_player_id` y `away_player_id` como columnas de la propia
fila, con:

- `CHECK (home_player_id <> away_player_id)`
- Índice único `(tournament_id, home_player_id, away_player_id)`

Los mazos, que sí son variables (uno por jugador y por batalla), viven en su
propia tabla `decks`, relacionada con el partido y el jugador.

## Alternativas descartadas

- **Tabla `match_players` (partido, jugador, lado, coronas).** Es más flexible,
  pero en un 1v1 tiene tres problemas concretos:
  1. La base de datos ya no puede garantizar "exactamente dos filas por
     partido"; haría falta un disparador o confiar en el código.
  2. Cada consulta de calendario o clasificación necesita dos `JOIN` extra.
  3. Las coronas quedarían en dos filas distintas, así que la restricción
     "los dos no pueden llegar a 3" tampoco sería expresable como `CHECK`.

## Consecuencias

- La base de datos garantiza por sí sola que un partido tiene dos jugadores
  distintos y que cada enfrentamiento con la misma condición de local ocurre una
  sola vez.
- Las consultas son directas.
- **Coste asumido**: si algún día hubiera 2v2, haría falta una migración. Es un
  cambio de formato de competición, no un ajuste: tocaría rehacer el fixture, la
  puntuación y la clasificación de todos modos.
