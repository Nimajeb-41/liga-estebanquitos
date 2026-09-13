# ADR 0006 — Desempates configurables y mini-liga en el enfrentamiento directo

**Estado:** aceptada · 2026-09-08

## Contexto

El orden de desempate propuesto (puntos → DC → victorias → enfrentamiento
directo → victorias por 3 coronas) es razonable, pero el propio requisito dice
que debe poder cambiarse sin reescribir el sistema.

Además, el enfrentamiento directo tiene una trampa conocida: comparar de dos en
dos no funciona cuando hay tres o más empatados. Si A ganó a B, B ganó a C y C
ganó a A, la comparación por parejas es intransitiva y el resultado depende del
orden en que el algoritmo compare, que es tanto como decir que es arbitrario.

## Decisión

Cada criterio es un comparador con nombre (`POINTS`, `CROWN_DIFF`, `WINS`,
`HEAD_TO_HEAD`, `MAX_CROWN_WINS`, `CROWNS_FOR`, `FEWEST_CROWNS_AGAINST`,
`FEWEST_SANCTIONS`). El orden de aplicación es una lista de identificadores en
`TournamentSettings.tiebreakers`, persistida en `tournament_settings.tiebreakers`.

La ordenación es **recursiva por grupos**: se aplica el primer criterio, se
agrupan las filas que quedan iguales y a cada grupo se le aplica el siguiente
criterio. `HEAD_TO_HEAD` se resuelve como **mini-liga** entre los miembros del
grupo empatado: solo cuentan los partidos que jugaron entre ellos, primero por
puntos y después por diferencia de coronas.

Si tras agotar la cadena dos filas siguen iguales, **comparten posición** y se
marcan con `unresolvedTie`.

## Alternativas descartadas

- **Cadena fija escrita en el código.** Cambiar la política obligaría a tocar y
  volver a desplegar el motor.
- **Comparación por parejas para el enfrentamiento directo.** Más simple, pero
  puede dar órdenes distintos según cómo ordene el motor. Inaceptable para
  decidir un campeonato.
- **Desempatar por sorteo o por identificador.** Fabricar un ganador donde el
  reglamento no lo tiene es peor que decir la verdad: hay empate.

## Consecuencias

- Cambiar la política de desempate es reordenar una lista.
- Los triples empates se resuelven de forma correcta y explicable.
- La interfaz puede mostrar el empate irresoluble en lugar de esconderlo, y el
  administrador sabe que necesita una regla adicional (P-13 de
  [pending-rules.md](../pending-rules.md)).
- La salida es siempre determinista: nunca depende del orden de llegada de los
  datos.
