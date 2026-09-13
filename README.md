# Liga Estabanquitos 2026-1

Plataforma de competición para la **Liga Estabanquitos 2026-1**, una liga de
Clash Royale de 10 participantes, todos contra todos, ida y vuelta.

> **Estado: Fase 6 completada.** La plataforma está lista para operar la liga:
> base de datos local sin Docker, administrador real, directo comprobado contra
> Kick y calendario programable en sesiones. Ver
> [docs/FASE-6-CLOSURE.md](docs/FASE-6-CLOSURE.md) y
> [docs/puesta-en-marcha.md](docs/puesta-en-marcha.md).

## Qué hay hoy

| Pieza                                                     | Estado                           |
| --------------------------------------------------------- | -------------------------------- |
| Motor de competición (fixture, puntuación, clasificación) | Implementado y probado           |
| PostgreSQL + migraciones + seed                           | Funcionando                      |
| API REST `/api/v1`                                        | Funcionando                      |
| Autenticación y roles de administración                   | Funcionando                      |
| Aplazamientos, disputas, correcciones y auditoría         | Implementados y probados         |
| Sitio público con Match Center                            | Funcionando                      |
| Panel de administración                                   | Funcionando, en Astro + React    |
| Integración con la API de Clash Royale                    | Spike ejecutado con datos reales |

**635 tests** en verde: 212 de dominio, 12 de esquema, 275 de la API y 136 del
frontend. Más 108 comprobaciones de extremo a extremo (`npm run e2e`). Lint,
formato, typecheck y build limpios.

## El formato en una tabla

| Concepto               | Valor                                                                      |
| ---------------------- | -------------------------------------------------------------------------- |
| Participantes          | 10 (hoy hay **6 confirmados**, 4 plazas TBD)                               |
| Sistema                | Todos contra todos, ida y vuelta                                           |
| Jornadas               | 18 (9 de ida + 9 de vuelta)                                                |
| Partidos por jornada   | 5                                                                          |
| Partidos totales       | 90                                                                         |
| Victoria normal        | 3 puntos                                                                   |
| Victoria con 3 coronas | 4 puntos (3-0, 3-1 y 3-2)                                                  |
| Derrota                | 0 puntos                                                                   |
| Empate                 | No existe: un 2-2 se rechaza                                               |
| Incomparecencia        | 3 puntos para quien se presentó, sin coronas para nadie                    |
| Sanción por BM         | −2 puntos                                                                  |
| Aplazamiento           | No puntúa, no suma coronas, no cuenta como jugado                          |
| Disputa                | 24 horas para impugnar                                                     |
| Desempates             | Puntos → DC → Victorias → Enfrentamiento directo → Victorias por 3 coronas |

La incomparecencia quedó decidida el 10 de septiembre de 2026 (regla P-01): tres
puntos y ninguna corona, nunca un 3-0 inventado. Ver
[docs/walkover.md](docs/walkover.md). Las otras diez reglas siguen abiertas y el
sistema las rechaza a propósito en lugar de inventarlas:
[docs/pending-rules.md](docs/pending-rules.md).

## Arrancar en cinco minutos

```bash
npm install
```

Sin instalar nada más (base de datos en memoria, datos efímeros). En una
terminal, la API con un escenario de demostración:

```bash
npm run demo
```

En otra, el sitio:

```bash
npm run web:dev
```

- Sitio: `http://127.0.0.1:4321`
- Panel: `http://127.0.0.1:4321/admin`
- API: `http://127.0.0.1:3000/api/v1`

El usuario y la contraseña los imprime `npm run demo` al arrancar.

Con PostgreSQL de verdad:

```bash
cp .env.example .env
```

```bash
npm run db:up && npm run db:migrate && npm run db:seed
```

```bash
npm run api:dev
```

Guía completa en [docs/development.md](docs/development.md).

## Las preguntas del criterio de éxito

| Pregunta                            | Respuesta                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| ¿Cómo paso de 6 a 10 participantes? | `/admin/players` — plazas 1..10, las libres como `TBD / POR CONFIRMAR`                                  |
| ¿Cómo genero las 18 fechas?         | `/admin/fixtures` con 10 confirmados y el torneo en READY · [fixture-system.md](docs/fixture-system.md) |
| ¿Cómo se calcula la tabla?          | Se deriva de resultados y sanciones · [tournament-rules.md](docs/tournament-rules.md)                   |
| ¿Cómo pospongo un partido?          | Ficha del partido → Posponer · conserva jornada y fecha original                                        |
| ¿Cómo registro un resultado?        | Ficha del partido, o doble reporte de los jugadores                                                     |
| ¿Cómo corrijo un resultado?         | Ficha del partido → Corregir · deja revisión y auditoría                                                |
| ¿Cómo aplico una sanción?           | `/admin/sanctions` · −2 por defecto, anulable                                                           |
| ¿Quién cambió qué?                  | `/admin/auditoria`                                                                                      |
| ¿Cómo se integrará Clash Royale?    | [clash-royale-api.md](docs/clash-royale-api.md)                                                         |
| ¿Qué reglas faltan por decidir?     | [pending-rules.md](docs/pending-rules.md)                                                               |

## Estructura

```
liga-estabanquitos/
├── packages/
│   ├── domain/        Motor de competición. TypeScript puro, sin dependencias
│   │                  de runtime, sin base de datos. Aquí viven las reglas.
│   ├── contracts/     La forma de cada respuesta de la API. Un solo sitio.
│   └── database/      Esquema PostgreSQL (Drizzle), migraciones y utilidades
│                      de test.
├── apps/
│   ├── api/           API REST, autenticación e integración con Clash Royale.
│   └── web/           Sitio público y panel de administración (Astro + React).
├── assets/branding/   Placeholders del logo y el trofeo oficiales.
└── docs/              Arquitectura, reglamento, API, panel y decisiones.
```

## Documentación

- [Arquitectura](docs/architecture.md) — capas, decisiones técnicas y por qué.
- [Arquitectura del frontend](docs/frontend-architecture.md) — Astro, React y el puente hacia la API.
- [Sistema de diseño](docs/design-system.md) — tokens, primitivas y estados.
- [Cliente de la API](docs/api-client.md) — cómo habla el frontend con el backend.
- [Reglamento](docs/tournament-rules.md) — cómo funciona la competición.
- [API](docs/api.md) — endpoints, errores y seguridad.
- [Panel de administración](docs/admin.md) — qué hace cada pantalla.
- [Guía de desarrollo](docs/development.md) — arrancar, migrar, sembrar, probar.
- [Modelo de datos](docs/data-model.md) — tablas, claves e índices.
- [Sistema de fixture](docs/fixture-system.md) — el algoritmo y su validación.
- [API de Clash Royale](docs/clash-royale-api.md) — qué se puede y qué no.
- [Reglas](docs/pending-rules.md) — decididas y pendientes.
- [Dirección visual](docs/frontend-direction.md) — el tema cyberpunk esports.
- [Marca y assets](docs/branding-and-assets.md) — logo, trofeo y copyright.
- [Estrategia de testing](docs/testing.md).
- [Seguridad](docs/security.md) — qué se protege, cómo se comprueba y qué **no** garantiza.
- [Incomparecencia](docs/walkover.md) — la regla P-01 y por qué no se inventa un 3-0.
- [Estadísticas](docs/statistics.md) — oficial contra observado, y por qué `null` no es `0`.
- [Transmisión](docs/streaming.md) — el overlay de OBS y el panel que lo genera.
- [Puesta en producción](docs/production.md) — variables, arranque, salud y operación diaria.
- [Fase 2](docs/fase-2.md) — qué se construyó y qué quedó fuera.
- [Fase 4](docs/FASE-4-CLOSURE.md) — informe de cierre: qué se hizo, qué se encontró y qué no se hizo.
- [Fase 5](docs/FASE-5-CLOSURE.md) — informe de cierre: temporada real, operación y producción.
- [Operar una temporada](docs/operacion.md) — jornadas, centro de acción y eventos internos.
- [Transmisión](docs/transmision.md) — el narrador, el directo, GSAP, sonido y PWA.
- [Fase 6](docs/FASE-6-CLOSURE.md) — informe de cierre: lo que hizo falta para operar de verdad.
- [Puesta en marcha](docs/puesta-en-marcha.md) — arrancar la liga, paso a paso.
- [Integración con Clash Royale](docs/clash-royale-integration.md) — el flujo completo, de la API al resultado oficial.
- [Spike de Clash Royale](docs/clash-royale-spike.md) — la evidencia con la que se construyó.
- [Roadmap](docs/roadmap.md) — qué entra en cada fase.
- [Decisiones de arquitectura](docs/adr/) — doce ADR registradas.

## Principio que sostiene todo

La clasificación **nunca** se almacena ni se edita: se deriva de los partidos,
sus resultados y las sanciones. Y nada se sobrescribe en silencio: corregir un
resultado deja revisión, aplazar deja historial, anular una sanción deja
constancia, y generar el calendario guarda su semilla. La plataforma siempre
puede explicar por qué la tabla dice lo que dice.

## Aviso legal

Este proyecto no está afiliado a Supercell. Ver
[docs/branding-and-assets.md](docs/branding-and-assets.md) para el uso de
material de Clash Royale y el texto de descargo exigido por la Fan Content
Policy.
