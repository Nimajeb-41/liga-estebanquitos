# ADR 0005 — Las reglas sin definir fallan de forma explícita

**Estado:** aceptada · 2026-09-08

## Contexto

Hay reglas que todavía no están decididas: qué pasa con un empate, qué pasa con
una incomparecencia, qué conductas son BM. Ver
[pending-rules.md](../pending-rules.md).

La tentación es rellenarlas con "lo razonable" (un empate vale 1 punto, una
incomparecencia se da 3-0) y seguir avanzando. En una competición real eso
significa que un resultado se registra con una regla que nadie aprobó, y que
nadie se entera hasta que alguien reclama.

## Decisión

Las reglas sin decidir se modelan como `null` en la configuración y el motor
**falla** al encontrárselas, señalando el documento donde se decidirán:

| Regla           | Configuración                | Error              |
| --------------- | ---------------------------- | ------------------ |
| Empates         | `scoring.draw = null`        | `DRAW_NOT_ALLOWED` |
| Incomparecencia | `scoring.walkoverWin = null` | `PENDING_RULE`     |

Los tipos de datos y las columnas ya existen (`MatchOutcome` incluye `DRAW`,
`resolution` incluye `WALKOVER`, `tournament_settings.points_draw` existe y es
`NULL`). Lo que falta es la decisión, no el código.

## Alternativas descartadas

- **Poner valores por defecto razonables.** Un valor por defecto invisible se
  convierte en la regla oficial sin que nadie lo haya aprobado.
- **Aceptar el dato y decidir después.** Habría resultados guardados con
  semántica desconocida, imposibles de recalcular con certeza.
- **No modelarlo hasta que se decida.** Obligaría a cambiar tipos y esquema más
  adelante, cuando ya haya datos.

## Consecuencias

- Si alguien intenta cargar un 2-2, el sistema explica que la regla no existe
  todavía en lugar de inventarse los puntos.
- Cerrar una regla es cambiar un `null` por un número y añadir un test. No hay
  que tocar el motor.
- **Coste asumido**: durante la preparación, algunas operaciones legítimas
  fallan. Es intencionado: es la señal de que falta una decisión, y llega antes
  de la primera jornada en vez de después.
