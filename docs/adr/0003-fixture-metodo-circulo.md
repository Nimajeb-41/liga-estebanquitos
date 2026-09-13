# ADR 0003 — Fixture por método del círculo, con semilla guardada

**Estado:** aceptada · 2026-09-08

## Contexto

Hacen falta 18 jornadas de 5 partidos en las que cada jugador juegue una vez por
jornada y cada pareja se enfrente dos veces, una en cada condición. Y hace falta
que el sorteo sea **creíble**: en una liga entre conocidos, "me tocó el peor
calendario" es una discusión garantizada.

## Decisión

Método del círculo (rotación con un jugador fijo) para la ida, y vuelta espejo
invirtiendo local y visitante.

El orden de los participantes se baraja con Fisher-Yates alimentado por un PRNG
determinista (mulberry32 sobre un hash de la semilla). **La semilla se guarda**
dentro del fixture y en la tabla `fixture_generations`.

Todo fixture generado pasa por `validateFixture` antes de considerarse oficial.

## Alternativas descartadas

- **Emparejamiento aleatorio con reintentos.** Puede no terminar, no garantiza
  nada por construcción y es imposible de explicar a un participante enfadado.
- **Calendario escrito a mano.** Con 90 partidos, un error de transcripción es
  cuestión de tiempo, y habría que rehacerlo si cambia un participante.
- **`Math.random` sin semilla.** El sorteo no sería reproducible: nadie podría
  comprobar a posteriori que salió como salió.

## Consecuencias

- El calendario cumple sus invariantes por construcción, y además se comprueban.
- Cualquiera puede regenerar el fixture con la misma semilla y verificar que
  sale idéntico: el sorteo es aleatorio **y** auditable.
- El equilibrio local/visitante es exacto en el total (9 y 9) y está acotado
  dentro de cada vuelta (4 o 5).
- **Limitación aceptada**: solo números pares de participantes. Con número
  impar haría falta una jornada de descanso, y las reglas del _bye_ no están
  decididas. El motor lo rechaza de forma explícita en lugar de improvisar.
