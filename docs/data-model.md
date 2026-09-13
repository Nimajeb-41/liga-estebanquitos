# Modelo de datos

PostgreSQL 17, esquema definido con Drizzle ORM en
`packages/database/src/schema/`. Las migraciones versionadas están en
`packages/database/drizzle/`:

| Migración                                       | Contenido                                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `0000_init.sql`                                 | Modelo base: 14 tablas                                                                        |
| `0001_fase1_postponements_reports_sessions.sql` | Historial de aplazamientos, reportes de jugadores, sesiones administrativas y reglas de plazo |

**17 tablas** en total. El esquema se prueba contra PostgreSQL real: hay 12
tests que comprueban que la base rechaza plazas duplicadas,
auto-enfrentamientos, sanciones positivas y motivos vacíos
([ADR 0009](adr/0009-pglite-en-tests.md)).

## Mapa

```
                    ┌──────────────────┐
                    │   tournaments    │
                    └────────┬─────────┘
             ┌───────────────┼───────────────┬──────────────────┐
             ▼               ▼               ▼                  ▼
  ┌────────────────────┐ ┌────────┐    ┌──────────┐   ┌───────────────────┐
  │ tournament_settings│ │players │    │  rounds  │   │fixture_generations│
  └────────────────────┘ └───┬────┘    └────┬─────┘   └───────────────────┘
                             │              │
                             │         ┌────▼─────┐
                             ├────────►│ matches  │◄──────────┐
                             │         └────┬─────┘           │
                             │              │                 │
                             │     ┌────────▼────────┐   ┌────┴────┐
                             │     │  match_results  │   │  decks  │
                             │     └────────┬────────┘   └────┬────┘
                             │              │                 │
                             │   ┌──────────▼───────────┐ ┌───▼────────┐
                             │   │match_result_revisions│ │ deck_cards │
                             │   └──────────────────────┘ └───┬────────┘
                             │                                │
                        ┌────▼──────┐                    ┌────▼───┐
                        │ sanctions │                    │ cards  │
                        └───────────┘                    └────────┘

  ┌──────────────┐      ┌───────────┐
  │ admin_users  │      │ audit_log │
  └──────────────┘      └───────────┘
```

## Convenciones

- Claves primarias `uuid` con `gen_random_uuid()`, salvo `cards` (usa el id de
  la API de Clash Royale) y `audit_log` (`bigserial`).
- Todas las fechas son `timestamptz`.
- `created_at` / `updated_at` en toda entidad con ciclo de vida.
- Borrado en cascada hacia abajo del torneo; `restrict` donde borrar destruiría
  historial (un jugador con partidos no se borra).
- Los enums de PostgreSQL usan exactamente los mismos valores que
  `@liga/domain`.

## Tablas

### `tournaments`

Un torneo por temporada. `status` es la máquina de estados. Guarda
`fixture_seed` y `fixture_generated_at` para poder auditar y reproducir el
sorteo.

Restricciones: `roster_size` par y ≥ 4, `legs` entre 1 y 2, `slug` único.

### `tournament_settings`

El reglamento vigente: puntos por victoria, por victoria con 3 coronas, por
derrota, coronas máximas por partido, penalización por defecto y orden de
desempate (`text[]`).

Dos columnas son **nullable a propósito**:

- `points_draw` = `NULL` significa que **el reglamento no admite empates**
  (decidido el 2026-09-08): un marcador con coronas iguales se rechaza.
- `points_walkover_win` = `NULL` significa que la puntuación de la
  incomparecencia **sigue sin decidirse**, y el motor rechaza registrar un
  walkover en lugar de inventarla.

Desde la Fase 1 incluye también `dispute_window_hours` (24) y
`no_show_tolerance_minutes` (15). Ver [pending-rules.md](pending-rules.md).

Está separada de `tournaments` porque cambia por su cuenta y porque deja
explícito que la clasificación depende de esta fila.

### `players`

Participantes. `status` ∈ `REGISTERED | CONFIRMED | WITHDRAWN | REPLACED`.

`slot` es la plaza 1..10. Restricciones que hacen el trabajo pesado:

| Restricción                                        | Qué garantiza                              |
| -------------------------------------------------- | ------------------------------------------ |
| `players_tournament_slot_key` (único parcial)      | Dos participantes no ocupan la misma plaza |
| `players_slot_requires_confirmed`                  | Solo un confirmado tiene plaza             |
| `players_tournament_clash_tag_key` (único parcial) | Un tag de Clash Royale por torneo          |
| `players_tournament_slug_key`                      | Identificador legible único                |

`replaced_by_player_id` apunta al sustituto: la cadena de sustituciones queda
navegable sin borrar a nadie.

### `rounds`

Las 18 jornadas: `number` (1..18) y `leg` (1 = ida, 2 = vuelta). Único por
`(tournament_id, number)`.

### `matches`

Un partido. Guarda `home_player_id` y `away_player_id` **en la propia fila**, no
en una tabla `MatchPlayer` aparte
([ADR 0004](adr/0004-match-sin-matchplayer.md)): en un 1v1 eso hace que la base
de datos garantice "exactamente dos jugadores distintos" con un `CHECK`, en
lugar de dejarlo en manos del código.

| Restricción                 | Qué garantiza                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `matches_distinct_players`  | Nadie se enfrenta a sí mismo                                                                                                |
| `matches_oriented_pair_key` | Cada enfrentamiento con la misma condición de local ocurre una sola vez (los 90 partidos son 90 pares orientados distintos) |
| `matches_round_order_key`   | Orden dentro de la jornada sin huecos ni repeticiones                                                                       |

Índices: `(tournament_id, status)` para el panel, y uno por cada lado del
enfrentamiento para el historial de un jugador. `stream_url` guarda el enlace de
la transmisión cuando el partido se emite.

Tres columnas sostienen la regla de aplazamientos:

| Columna                 | Para qué                                                           |
| ----------------------- | ------------------------------------------------------------------ |
| `scheduled_at`          | Fecha vigente. Cambia al reprogramar                               |
| `original_scheduled_at` | Primera fecha que tuvo. Se fija una vez y **no se toca nunca más** |
| `postponement_count`    | Cuántas veces se aplazó                                            |

El partido conserva siempre su `round_id`: aplazar cambia la fecha, nunca la
jornada.

### `match_results`

**Solo hechos.** Coronas del local, coronas del visitante y `resolution`
(`PLAYED | WALKOVER | ADMIN_DECISION`).

No se guarda ganador, ni tipo de victoria, ni puntos: los calcula
`@liga/domain`. Guardarlos permitiría que quedaran desincronizados del marcador
o del reglamento, que es exactamente lo que el principio de fuente de verdad
quiere impedir.

Además: quién lo reportó, qué administrador lo verificó y cuándo, evidencia,
observaciones y `version` (número de correcciones).

### `match_result_reports`

El reporte de cada jugador: `home_crowns`, `away_crowns`, evidencia opcional y
momento. **Único por `(match_id, player_id)`**: rectificar sustituye, no
acumula.

Los dos reportan en el mismo orden, local-visitante. Si coinciden, el resultado
queda validado; si se contradicen, el partido pasa a `DISPUTED`. Los reportes se
conservan aunque después haya corrección: son la prueba de que cada uno dijo lo
que dijo.

### `match_postponements`

Historial de aplazamientos y reprogramaciones. Cada fila guarda el evento
(`POSTPONED` / `RESCHEDULED`), la **jornada** del partido, la fecha anterior, la
nueva, el motivo (`CHECK` de motivo no vacío), el administrador y el momento.

Es lo que permite responder "¿por qué este partido de la jornada 7 se jugó el 15
de octubre?". El partido nunca cambia de jornada: cambia su fecha, y el cambio
queda aquí.

### `match_result_revisions`

Historial de correcciones. Cada fila guarda el estado anterior (`jsonb`), el
nuevo, el motivo, el administrador y la fecha. Único por
`(match_id, revision)`.

Responde a tres preguntas del reglamento: quién puede modificar un resultado,
cómo se corrige y cómo se auditan los errores administrativos. Corregir nunca
borra.

### `sanctions`

Jugador, tipo, puntos (`CHECK points <= 0`), motivo no vacío, evidencia,
administrador responsable, fecha y estado (`ACTIVE | REVOKED`) con su motivo de
anulación. Opcionalmente asociada a un partido y a una jornada.

Anular en lugar de borrar mantiene el historial disciplinario intacto y hace
que la tabla se recalcule sola.

### `cards`, `decks`, `deck_cards`

Modelo preparado para los mazos, **sin integración todavía**.

- `cards`: catálogo, con el id que asigna la API oficial. Se sincronizará desde
  `/cards`.
- `decks`: un mazo de un jugador, opcionalmente asociado a un partido y a un
  número de batalla (previsto para formatos a varias partidas). `source`
  distingue lo cargado a mano de lo importado de la API.
- `deck_cards`: 8 cartas por mazo, `PRIMARY KEY (deck_id, slot)`, `CHECK` de
  rango 1..8 y unicidad de carta dentro del mazo.

### `admin_users`

Administradores con rol (`OWNER | ADMIN | REFEREE | VIEWER`) y hash Argon2id
con los parámetros recomendados por OWASP. Nunca se guarda una contraseña en
claro.

### `admin_sessions`

Sesiones activas. El navegador recibe un token aleatorio de 256 bits en una
cookie httpOnly; aquí se guarda **solo su hash SHA-256**. Si esta tabla se
filtrase, no serviría para suplantar a nadie.

Guarda además caducidad, último uso, revocación y el `user-agent`.

### `audit_log`

Toda acción administrativa con efecto en la competición: acción, entidad,
identificador, `payload` en `jsonb`, autor y fecha. Índices por torneo y por
entidad.

### `fixture_generations`

Cada generación (o regeneración) del calendario: algoritmo, semilla, vueltas,
orden efectivo de los participantes tras el barajado y quién lo lanzó. Sirve
para demostrar que el sorteo fue reproducible y no dirigido.

## Lo que deliberadamente no existe

| No hay                              | Por qué                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `players.points`, `players.wins`... | Son datos derivados; se calculan desde los resultados                                                                                            |
| Tabla `standings`                   | La clasificación es una proyección. Si más adelante hace falta cachearla para la web, será una tabla claramente marcada como caché reconstruible |
| Tabla `match_players`               | En un 1v1 duplica información y debilita las restricciones ([ADR 0004](adr/0004-match-sin-matchplayer.md))                                       |
| Columna `winner_id` en `matches`    | Se deriva del marcador                                                                                                                           |

## Migraciones

```bash
npm run db:generate --workspace=@liga/database   # esquema -> SQL
npm run db:migrate  --workspace=@liga/database   # aplicar
```

El SQL generado se revisa y se versiona; no se aplican cambios de esquema
directamente contra la base de datos.
