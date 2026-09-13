# ADR 0002 — Dominio puro, separado de la persistencia

**Estado:** aceptada · 2026-09-08

## Contexto

La clasificación de una liga real es un dato sensible: si un jugador ve que le
falta un punto, hay discusión. Necesitamos poder responder "estos son los
resultados, esta es la regla, este es el cálculo" sin depender de qué guardó la
base de datos hace tres semanas.

El requisito del proyecto es explícito: los datos derivados no pueden
convertirse en datos manuales.

## Decisión

`packages/domain` contiene todas las reglas de competición y **no tiene ninguna
dependencia de runtime**: ni ORM, ni cliente HTTP, ni librería de validación.
Solo TypeScript.

La base de datos guarda hechos (coronas, sanciones, quién juega con quién). Los
puntos, el ganador, el tipo de victoria, la DC y la posición se calculan siempre
a partir de esos hechos y del reglamento vigente.

## Alternativas descartadas

- **Calcular la tabla en SQL** (vista o vista materializada). Rápido, pero
  duplicaría las reglas en dos lenguajes y haría los desempates —sobre todo la
  mini-liga del enfrentamiento directo— difíciles de leer y de probar.
- **Guardar los puntos en la fila del jugador.** Es la fuente clásica de
  incoherencias: basta con corregir un resultado y olvidar recalcular.
- **Lógica en los servicios de la API.** Ataría las reglas al transporte y
  obligaría a levantar un servidor para probar una victoria de 3 coronas.

## Consecuencias

- La suite del motor corre en menos de un segundo, así que se ejecuta siempre.
- Cambiar el reglamento recalcula toda la historia sin migrar datos.
- Un fallo en la tabla está en un paquete de ~1.200 líneas.
- **Coste asumido**: calcular la clasificación exige leer los partidos del
  torneo (90 filas). Es irrelevante a esta escala; si algún día la web lo
  necesitara, se añadiría una tabla de caché claramente marcada como
  reconstruible, nunca como fuente de verdad.
