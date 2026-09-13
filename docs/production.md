# Puesta en producción

Qué hace falta para operar una temporada de verdad, en el orden en que hace
falta.

---

## Antes de nada: qué es «producción» aquí

Una liga de diez personas que juegan noventa partidos a lo largo de una
temporada, con un administrador y quizá un operador de transmisión. No es un
servicio con miles de usuarios: el objetivo no es escalar, es **no perder datos y
poder explicar cada punto de la tabla**.

---

## Variables de entorno

La configuración se valida al arrancar. Una variable mal escrita **impide el
arranque** con un mensaje que nombra la variable: un servidor que ignora su
propia configuración es peor que uno que no arranca.

### Obligatorias en producción

| Variable              | Qué es                                                                |
| --------------------- | --------------------------------------------------------------------- |
| `NODE_ENV=production` | Activa cookie `Secure` y el registro en nivel `info`                  |
| `DATABASE_URL`        | PostgreSQL con credenciales. Obligatoria: sin ella no arranca         |
| `TOURNAMENT_SLUG`     | Qué torneo sirve esta instancia                                       |
| `API_URL`             | URL de la API **vista desde el servidor de Astro**. Puede ser interna |
| `PUBLIC_SITE_URL`     | URL pública del sitio. Sale en los enlaces canónicos y en el sitemap  |

### Recomendadas

| Variable                | Por defecto               | Nota                                              |
| ----------------------- | ------------------------- | ------------------------------------------------- |
| `SESSION_TTL_HOURS`     | `12`                      | Duración de la sesión administrativa              |
| `CORS_ORIGINS`          | vacío (solo mismo origen) | **No puede ser `*`**: la configuración lo rechaza |
| `API_HOST` / `API_PORT` | `127.0.0.1` / `3000`      |                                                   |

### Clash Royale

| Variable                                | Por defecto | Nota                                                          |
| --------------------------------------- | ----------- | ------------------------------------------------------------- |
| `CLASH_ROYALE_API_TOKEN`                | vacío       | Sin token no hay integración, se pida o no                    |
| `CLASH_ROYALE_ENABLED`                  | `true`      |                                                               |
| `CLASH_ROYALE_TIMEOUT_MS`               | `8000`      |                                                               |
| `CLASH_ROYALE_MAX_RETRIES`              | `3`         |                                                               |
| `CLASH_ROYALE_MATCH_WINDOW_MINUTES`     | `180`       | **No sale de ninguna medición.** Ajustar con jornadas jugadas |
| `CLASH_ROYALE_SYNC_ENABLED`             | `false`     | Ver más abajo                                                 |
| `CLASH_ROYALE_SYNC_INTERVAL_MINUTES`    | `60`        |                                                               |
| `CLASH_ROYALE_SYNC_MAX_PLAYERS`         | `3`         | Participantes por vuelta                                      |
| `CLASH_ROYALE_BREAKER_FAILURES`         | `3`         | Fallos seguidos antes de cortar                               |
| `CLASH_ROYALE_BREAKER_COOLDOWN_MINUTES` | `15`        |                                                               |

Pedir `CLASH_ROYALE_SYNC_ENABLED=true` sin integración activa **impide el
arranque**: callárselo dejaría a alguien esperando datos que no van a llegar.

El token va en `.env` o en el entorno del servidor. Nunca en `.env.example`, que
está versionado. Ver [security.md](security.md).

---

## Base de datos

```bash
npm run db:migrate
npm run db:seed      # solo la primera vez: crea el torneo y el administrador
```

Las migraciones son de Drizzle y viven en `packages/database/drizzle/`. Se
aplican en orden y el journal las registra.

### Copias de seguridad

No hay nada automático en el repositorio, y es la pieza que más falta hace: la
plataforma es la única fuente de verdad de la clasificación. Un `pg_dump` diario
del esquema `public` cubre el caso.

Lo que **no** se pierde aunque se pierda algo: nada se sobrescribe en silencio.
Aplazar deja entrada de historial, corregir deja revisión con el valor anterior, y
toda operación administrativa deja rastro en `audit_log` con quién, cuándo y con
qué datos.

---

## Arranque

```bash
npm run build                 # dominio, contratos, API y frontend
node apps/api/src/index.ts    # API
node apps/web/dist/server/entry.mjs   # frontend
```

El frontend es SSR (adaptador de Node) y habla con la API por `API_URL`. El
navegador **solo** habla con el frontend.

---

## Salud del servicio

| Ruta             | Qué responde                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /health`    | Que el proceso vive. Entorno, si hay base de datos configurada, si hay integración, estado del planificador y tiempo en marcha |
| `GET /readiness` | Que el servicio **sirve**: hace un `select 1` contra la base de datos. `503` si no llega                                       |

La diferencia importa en un despliegue: un proceso arrancado pero sin base de
datos responde a `/health` y no debe recibir tráfico.

**La integración con Clash Royale no decide si el servicio está listo.** La liga
funciona entera sin ella: solo aporta evidencia.

Ninguna de las dos publica credenciales. `/health` dice `enabled` o `disabled`, y
hay un test que barre la respuesta buscando el token.

---

## Sincronización automática

**Apagada por defecto, y no por prudencia genérica: no sabemos cada cuánto hay
que sincronizar.** El historial de batallas de Clash Royale se vacía solo, y del
spike solo salió una cota inferior de retención (≥ 41,4 h); la superior sigue sin
medir. Encenderla con un intervalo inventado sería fingir que conocemos un número
que no conocemos.

Mientras siga apagada, la vuelta se lanza a mano:

- `POST /api/v1/admin/clash-royale/sync/:playerId` — un participante.
- `POST /api/v1/admin/clash-royale/sync-run` — una vuelta completa, respetando el
  límite de participantes por vuelta.
- `GET /api/v1/admin/clash-royale/sync` — estado del planificador.

Cuando se encienda, hace deliberadamente poco: consulta unos pocos participantes
por vuelta empezando por los que llevan más tiempo sin consultarse, **no confirma
nada** (deja candidatos en la cola de revisión), y se corta sola si la API falla
varias veces seguidas.

El cortacircuitos vive en memoria. Es lo correcto para lo que protege: si el
proceso se reinicia, lo sensato es volver a probar una vez, no heredar un bloqueo
de la encarnación anterior.

Para medir la retención de verdad:

```bash
npm run clash:retention -- --tag "#XXXXXXX"   # registra una observación
npm run clash:retention -- --report           # cotas actuales
```

Necesita `DATABASE_URL` porque tiene que comparar entre ejecuciones separadas por
horas.

---

## Operación diaria

El **resumen del panel** (`/admin`) responde «¿cómo va la liga?» sin abrir la base
de datos:

- partidos con la fecha pasada y sin resultado;
- partidos sin fecha;
- candidatos de Clash Royale esperando revisión;
- batallas marcadas por el importador porque algo no cuadraba;
- participantes vinculados y sincronizados, y cuándo fue la última sincronización.

Son **recuentos, no un diagnóstico**: la plataforma no decide qué número es
«demasiado». Ese umbral lo pone quien lo lee.

La **auditoría** (`/admin/auditoria`) filtra por acción, responsable, tipo de
entidad, identificador, rango de fechas y `requestId`. Ese último cruza una
operación con las líneas de registro del servidor: sin él, «esta corrección salió
mal» y «este error en el log» son dos hechos sueltos que nadie puede unir.

---

## Antes de cada despliegue

```bash
npm run verify
```

Encadena, en este orden: auditoría de secretos, auditoría de índices, formato,
lint, tipos, tests y build. El primero va antes que nada a propósito.

Y, con el frontend ya construido:

```bash
npm run e2e
```

Levanta la pila entera contra una base efímera y recorre los dos caminos que
tienen que funcionar siempre, más accesibilidad y fuga de secretos en el paquete
que se descarga el navegador.

---

## Lo que sigue sin resolver

Once reglas de competición (**P-01** a **P-11**) siguen abiertas y están
documentadas en [pending-rules.md](pending-rules.md). La plataforma **rechaza**
las operaciones que dependerían de ellas en lugar de inventar un comportamiento:
una incomparecencia no se puede registrar mientras P-01 no diga cuántos puntos
reparte.

Esto es deliberado y no es un fallo de la implementación. Es la diferencia entre
un sistema que dice «no sé» y uno que se inventa un número que después nadie
puede explicar.
