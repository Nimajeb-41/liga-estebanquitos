# ADR 0007 — Sustitución de participantes con trazabilidad

**Estado:** aceptada · 2026-09-08

## Contexto

Faltan cuatro participantes por confirmar y el requisito es explícito: durante
la preparación tiene que poder cambiarse cualquier cosa. Pero una vez publicado
el calendario, cambiar participantes a la ligera invalidaría los 90 partidos.

Hacía falta decidir cómo se representa "el jugador X ocupa ahora la plaza de Y".

## Contexto adicional: la alternativa de las plazas

Se consideró que el fixture apuntara a **plazas** (`roster_slot`) en vez de a
jugadores. Sustituir sería entonces cambiar a quién apunta la plaza, y el
calendario seguiría siendo válido sin tocar ni un partido.

Es elegante, pero mete una indirección en absolutamente todas las consultas
("dame los partidos de Nimaben" pasa a ser "dame la plaza de Nimaben y luego los
partidos de esa plaza") y complica la clasificación, que tendría que ser por
plaza y traducirse a jugador al mostrarla.

## Decisión

- Existen **plazas numeradas 1..10**, pero solo para el cupo y para mostrar los
  huecos como `TBD / POR CONFIRMAR`.
- Los partidos apuntan **directamente a jugadores**.
- Sustituir es una operación explícita: el saliente queda `REPLACED` con
  `replaced_by_player_id` apuntando al entrante, y el entrante hereda la plaza y
  el estado.
- Antes de generar el fixture, sustituir no tiene más consecuencias.
- Con el calendario ya publicado, la sustitución es una capacidad aparte
  (`REPLACE_PLAYER`), separada de la gestión normal de plantilla
  (`MANAGE_ROSTER`), que en `SCHEDULED` y `LIVE` está prohibida.

## Alternativas descartadas

- **Fixture por plazas.** Descrita arriba: resuelve un problema poco frecuente a
  costa de complicar todas las consultas.
- **Borrar al saliente y crear al entrante.** Se perdería el historial y las
  claves foráneas de sus partidos.
- **Permitir editar la plantilla en cualquier momento.** Convertiría un error de
  clic en una competición corrupta.

## Consecuencias

- El caso frecuente (sustituir antes de generar el calendario) es trivial.
- El caso raro (sustituir con el calendario publicado) exige una operación
  distinta, que deja rastro y que en la Fase 1 escribirá en `audit_log`.
- **Pendiente**: qué ocurre con los resultados ya jugados del saliente. Es la
  regla P-09 de [pending-rules.md](../pending-rules.md); el motor soporta el
  cambio de plantilla, pero la decisión deportiva no está tomada.
