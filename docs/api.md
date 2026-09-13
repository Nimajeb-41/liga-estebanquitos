# API HTTP

Base: `/api/v1`. Todas las respuestas son JSON.

- **Lectura**: pública, sin sesión.
- **Escritura**: exige sesión de administrador (cookie `liga_admin_session`).

## Autenticación

| Método | Ruta                  | Qué hace                                              |
| ------ | --------------------- | ----------------------------------------------------- |
| POST   | `/api/v1/auth/login`  | Inicia sesión. Devuelve cookie httpOnly, SameSite=Lax |
| POST   | `/api/v1/auth/logout` | Revoca la sesión                                      |
| GET    | `/api/v1/auth/me`     | Identidad del administrador en sesión                 |

La contraseña se guarda con Argon2id. Ante credenciales incorrectas la respuesta
es la misma exista o no el correo, para no filtrar qué cuentas existen. El login
está limitado a 10 intentos cada 5 minutos.

Roles: `OWNER`, `ADMIN`, `REFEREE` pueden escribir; `VIEWER` es de solo lectura.

## Lectura pública

| Método | Ruta                             | Devuelve                                                        |
| ------ | -------------------------------- | --------------------------------------------------------------- |
| GET    | `/health`                        | Estado del servicio                                             |
| GET    | `/api/v1/tournament`             | Estado, formato, plantilla y fixture                            |
| GET    | `/api/v1/rules`                  | Reglamento vigente y reglas pendientes                          |
| GET    | `/api/v1/players`                | Plantilla, resumen y las 10 plazas (las libres como TBD)        |
| GET    | `/api/v1/players/:id`            | Un participante                                                 |
| GET    | `/api/v1/fixture`                | Las 18 jornadas con sus partidos                                |
| GET    | `/api/v1/rounds` · `/rounds/:id` | Jornadas                                                        |
| GET    | `/api/v1/matches`                | Todos los partidos                                              |
| GET    | `/api/v1/matches/:id`            | Partido con su historial **público** (ver abajo)                |
| GET    | `/api/v1/matches/:id/live`       | Estado mínimo para sondear, con `revision`                      |
| GET    | `/api/v1/standings?upToRound=N`  | Clasificación (opcionalmente, como estaba tras la jornada N)    |
| GET    | `/api/v1/standings/history`      | La tabla después de cada jornada jugada                         |
| GET    | `/api/v1/head-to-head/:a/:b`     | Historial entre dos participantes (id o slug)                   |
| GET    | `/api/v1/records`                | Récords de la temporada                                         |
| GET    | `/api/v1/stats`                  | Líderes por métrica y métricas no disponibles                   |
| GET    | `/api/v1/sanctions`              | Sanciones, activas y anuladas                                   |
| GET    | `/api/v1/matches/:id/evidence`   | Evidencia de Clash Royale, solo si un administrador la confirmó |

### Qué se publica de un partido, y qué no

La ficha pública va recortada a propósito
([ADR 0012](adr/0012-ficha-publica-de-partido.md)):

| Dato                              | Público | Administración |
| --------------------------------- | ------- | -------------- |
| Estado, jornada, fechas, marcador | Sí      | Sí             |
| Aplazamientos: evento y motivo    | Sí      | Sí             |
| Aplazamientos: notas escritas     | **No**  | Sí             |
| Que hubo una corrección, y cuándo | Sí      | Sí             |
| Motivo de la corrección           | **No**  | Sí             |
| Cuántos reportes se recibieron    | Sí      | Sí             |
| Quién reportó qué, y su evidencia | **No**  | Sí             |

El motivo de una corrección no se publica porque **P-10** —el procedimiento ante
errores administrativos— todavía no está decidido. Publicarlo sería cerrar la
regla por la puerta de atrás.

## Administración

Todas bajo `/api/v1/admin` y todas dejan rastro en `audit_log`.

### Lecturas

| Método | Ruta                 | Devuelve                                              |
| ------ | -------------------- | ----------------------------------------------------- |
| GET    | `/admin/players`     | Plantilla con notas internas                          |
| GET    | `/admin/matches/:id` | Ficha completa: reportes, notas y correcciones        |
| GET    | `/admin/sanctions`   | Sanciones con evidencia y observaciones               |
| GET    | `/admin/audit`       | Últimas 200 entradas de auditoría                     |
| GET    | `/admin/metrics`     | Recuentos de operación                                |
| GET    | `/admin/attention`   | Lo que espera una decisión, enumerado y con su enlace |

### Clash Royale

Nada de esto registra un resultado por su cuenta. Ver
[clash-royale-integration.md](clash-royale-integration.md).

| Método | Ruta                                         | Qué hace                                     |
| ------ | -------------------------------------------- | -------------------------------------------- |
| GET    | `/admin/clash-royale/links`                  | Vinculaciones de los participantes           |
| POST   | `/admin/clash-royale/links/:id`              | Vincula una cuenta. Nace `UNVERIFIED`        |
| DELETE | `/admin/clash-royale/links/:id`              | Desvincula                                   |
| POST   | `/admin/clash-royale/sync/:id`               | Trae el historial y propone candidatos       |
| POST   | `/admin/clash-royale/cards/sync`             | Sincroniza el catálogo de cartas             |
| GET    | `/admin/clash-royale/candidates`             | Cola de revisión (`?status=`)                |
| POST   | `/admin/clash-royale/candidates/:id/confirm` | **Registra el resultado** vía `recordResult` |
| POST   | `/admin/clash-royale/candidates/:id/reject`  | Descarta el candidato                        |
| POST   | `/admin/clash-royale/candidates/:id/review`  | Lo aparta sin resolverlo                     |

### Torneo

| Método | Ruta                          | Cuerpo                                               |
| ------ | ----------------------------- | ---------------------------------------------------- |
| POST   | `/admin/tournament/status`    | `{ status }`                                         |
| PATCH  | `/admin/tournament`           | `{ name?, season?, plannedStartAt?, plannedEndAt? }` |
| PATCH  | `/admin/tournament/settings`  | `{ reason, scoring?, disputes?, noShow?, ... }`      |
| GET    | `/admin/tournament/closure`   | — (qué falta para poder cerrar)                      |
| POST   | `/admin/tournament/finish`    | `{ reason, acknowledgePending? }`                    |
| GET    | `/admin/tournament/snapshots` | — (instantáneas de cierre)                           |

`GET /api/v1/tournament` incluye `allowedTransitions`: los estados a los que se
puede pasar desde el actual, según el dominio. El panel ofrece exactamente esos.

### Participantes

| Método | Ruta                           | Cuerpo                                |
| ------ | ------------------------------ | ------------------------------------- |
| POST   | `/admin/players`               | `{ displayName, clashTag?, notes? }`  |
| PATCH  | `/admin/players/:id`           | `{ displayName?, clashTag?, notes? }` |
| DELETE | `/admin/players/:id`           | —                                     |
| POST   | `/admin/players/:id/confirm`   | `{ slot? }`                           |
| POST   | `/admin/players/:id/unconfirm` | —                                     |
| POST   | `/admin/players/:id/withdraw`  | —                                     |
| POST   | `/admin/players/:id/replace`   | `{ displayName, clashTag?, notes? }`  |

### Fixture

| Método | Ruta                      | Cuerpo                        |
| ------ | ------------------------- | ----------------------------- |
| POST   | `/admin/fixture/generate` | `{ seed?, replaceExisting? }` |

Exige exactamente 10 confirmados y el torneo en `READY`. Si ya hay calendario
responde `409 FIXTURE_ALREADY_EXISTS`: regenerar exige `replaceExisting: true` y
borra el anterior.

### Partidos

| Método | Ruta                                | Cuerpo                                                          |
| ------ | ----------------------------------- | --------------------------------------------------------------- |
| POST   | `/admin/matches/:id/schedule`       | `{ scheduledAt }`                                               |
| POST   | `/admin/matches/:id/live`           | `{ streamUrl? }`                                                |
| POST   | `/admin/matches/:id/postpone`       | `{ reason, notes, proposedAt? }`                                |
| POST   | `/admin/matches/:id/reschedule`     | `{ newScheduledAt, notes, reason? }`                            |
| POST   | `/admin/matches/:id/result`         | `{ homeCrowns, awayCrowns, resolution?, evidenceUrl?, notes? }` |
| POST   | `/admin/matches/:id/correct-result` | `{ homeCrowns, awayCrowns, reason }`                            |
| POST   | `/admin/matches/:id/report-result`  | `{ playerId, homeCrowns, awayCrowns, evidenceUrl? }`            |
| POST   | `/admin/matches/:id/walkover`       | `{ absentPlayerId, reason }`                                    |
| POST   | `/admin/matches/:id/cancel`         | `{ reason }`                                                    |
| POST   | `/admin/matches/:id/stream`         | `{ streamUrl, vodUrl, platform }`                               |
| POST   | `/admin/rounds/:number/schedule`    | `{ startAt, intervalMinutes, overwrite? }`                      |

### Sanciones y auditoría

| Método | Ruta                          | Cuerpo                                                                |
| ------ | ----------------------------- | --------------------------------------------------------------------- |
| POST   | `/admin/sanctions`            | `{ playerId, type, reason, points?, matchId?, evidenceUrl?, notes? }` |
| POST   | `/admin/sanctions/:id/revoke` | `{ reason }`                                                          |
| GET    | `/admin/audit`                | —                                                                     |

## Dos decisiones que se apartan del boceto inicial

**1. El reporte de resultados va bajo `/admin` y exige sesión.**
El boceto colocaba `POST /api/v1/matches/:id/report-result` como ruta pública.
No hay cuentas de jugador todavía, así que esa ruta sería un endpoint de
escritura sin autenticar sobre una competición real: cualquiera podría reportar
resultados de partidos ajenos. En la Fase 1 el reporte lo introduce un
administrador o árbitro indicando de quién es cada reporte; el mecanismo de
conciliación (coinciden → validado, discrepan → `DISPUTED`) es exactamente el
acordado y está probado. El auto-servicio para jugadores necesita identidad de
jugador y entra en la Fase 2.

**2. `confirm-result` no existe como ruta separada.**
Confirmar es reportar lo mismo: el segundo reporte que coincide cierra el
resultado. Una ruta aparte duplicaría el mismo flujo con otro nombre.

## Errores

Formato único:

```json
{
  "error": { "code": "ROSTER_INCOMPLETE", "message": "...", "details": {} },
  "requestId": "9f3c…"
}
```

`requestId` aparece también en los logs del servidor, así que un fallo
reportado por un usuario se localiza por ese identificador.

| Status | Significa                                                           |
| ------ | ------------------------------------------------------------------- |
| 400    | Entrada mal formada (`VALIDATION_ERROR`) o dato inválido            |
| 401    | Falta sesión o ha caducado                                          |
| 403    | El rol no permite la operación, o quien reporta no juega el partido |
| 404    | No existe                                                           |
| 409    | El estado actual no permite la operación                            |
| 422    | Regla de competición incumplida (`INVALID_CROWNS`, `PENDING_RULE`…) |
| 429    | Límite de peticiones                                                |
| 500    | Error interno (nunca expone detalles)                               |

Los códigos del dominio (`INVALID_CROWNS`, `DRAW_NOT_ALLOWED`, `ROSTER_FULL`,
`PENDING_RULE`…) viajan tal cual: la interfaz decide el mensaje, la API no
depende del texto.

## Validación

Toda entrada pasa por Zod antes de llegar a la lógica: identificadores UUID,
fechas ISO, coronas enteras en rango, motivos con longitud mínima, enums
cerrados. Lo que supere esa frontera vuelve a validarse contra las reglas de
competición en `@liga/domain`.

## Seguridad

- Cabeceras de seguridad con Helmet, incluida una CSP estricta (`script-src
'none'` en el panel).
- CORS cerrado por defecto: solo los orígenes de `CORS_ORIGINS`; en producción
  no se admite `*`.
- Límite global de 300 peticiones por minuto y 10 intentos de login cada 5
  minutos.
- Cookies `httpOnly`, `SameSite=Lax` y `secure` en producción.
- En la base de datos se guarda el hash SHA-256 del token de sesión, nunca el
  token.
- Los logs redactan `cookie` y `authorization`.
- La API key de Clash Royale no se expone: `/health` solo dice si está
  configurada.
