# ADR 0001 — Monorepo con npm workspaces

**Estado:** aceptada · 2026-09-08

## Contexto

El proyecto tendrá al menos cuatro piezas: motor de competición, esquema de base
de datos, API y web. Comparten tipos (los estados del torneo, la forma de la
clasificación) y tienen que evolucionar a la vez.

Además, el autor ya trabaja con monorepos de npm workspaces en ImageForge y
TextForge, con la misma disposición `packages/*` + `apps/*`.

## Decisión

Un único repositorio con npm workspaces:

```
packages/domain     motor, sin dependencias de runtime
packages/database   esquema PostgreSQL
apps/api            servidor HTTP
apps/web            frontend (Fase 2)
```

TypeScript en modo estricto con `tsconfig.base.json` compartido, incluyendo
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` y
`erasableSyntaxOnly`. Sin paso de compilación entre paquetes: los `exports`
apuntan al código fuente `.ts`, que Node 22+ ejecuta directamente eliminando los
tipos.

## Alternativas descartadas

- **Repositorios separados.** Cada cambio de un tipo compartido obligaría a
  publicar un paquete y actualizar dependencias. Desproporcionado para un
  proyecto de una persona.
- **pnpm o Turborepo.** Mejores para monorepos grandes; aquí solo añadirían una
  herramienta más que instalar y explicar. npm ya está.
- **Todo en un solo paquete.** Sería lo más rápido hoy y lo peor dentro de dos
  meses: nada impediría que una consulta SQL acabara decidiendo puntos.

## Consecuencias

- Un `npm install` y un `npm test` para todo.
- La frontera entre capas es física, no una convención: `domain` no puede
  importar `database` porque no lo tiene como dependencia.
- Sin paso de compilación no hay artefactos que se queden desactualizados,
  pero el despliegue de la API necesitará empaquetado propio en la Fase 1.
