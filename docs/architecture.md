# Arquitectura

## Diagnóstico de partida

El proyecto se inicializó desde cero: no había ningún directorio previo de la
Liga Estabanquitos en `Documents`. Sí existían dos referencias útiles del mismo
autor, que se usaron para fijar convenciones en lugar de inventarlas:

- **ImageForge / TextForge** (`Documents/imageforge`, `Documents/textforge`):
  monorepos de npm workspaces con `packages/*` + `apps/*`, TypeScript en modo
  estricto, Vitest, Prettier y documentación en `docs/`. Este proyecto sigue esa
  misma forma para que resulte familiar.
- **Football Tournament Manager** (`Documents/football_tournament_manager`):
  gestor de torneos en Python con motores separados (`schedule_engine`,
  `standings_engine`, `match_engine`). Confirma una idea que aquí se lleva más
  lejos: **el motor de competición tiene que ser una pieza independiente y
  testeable**, sin base de datos ni interfaz por medio.

No se tocó ninguno de esos proyectos.

## Principio rector

> Los datos derivados no se almacenan como datos manuales.

Toda la clasificación es una proyección:

```
Partidos + Resultados + Sanciones  ->  Estadísticas  ->  Clasificación
```

En la base de datos solo viven **hechos**: quién juega contra quién, cuántas
coronas hizo cada uno, cómo se resolvió el partido y qué sanciones registró la
administración. Los puntos, el ganador, el tipo de victoria y la posición se
calculan siempre. Consecuencias prácticas:

- Corregir o borrar un resultado deja la tabla coherente sin trabajo extra.
- Cambiar el reglamento (por ejemplo, victoria con 3 coronas pasa a valer 5)
  recalcula la historia entera, no hace falta migrar nada.
- Es imposible que exista una fila con un ganador que no cuadre con su marcador.

## Capas

```
┌────────────────────────────────────────────────────────────────┐
│ apps/web            Astro SSR + islas de React                 │
│   src/pages         Sitio público y panel /admin               │
│   src/pages/api     Puente hacia la API: sesión y operaciones  │
│   src/components    Sistema de diseño y componentes de dominio │
│   src/lib/api       Cliente único, validado contra el contrato │
├────────────────────────────────────────────────────────────────┤
│ apps/api                                                       │
│   src/routes        HTTP: validar (Zod), llamar, serializar    │
│   src/services      Orquestar: cargar → decidir → guardar →    │
│                     auditar. Transacciones.                    │
│   src/auth          Argon2id, sesiones, guardas de rol         │
│   src/data          Consultas. Sin reglas de competición       │
│   src/integrations  Clash Royale: cliente, normalizacion,      │
│                     huella y deteccion de candidatos           │
│   src/admin-ui      Panel de respaldo, HTML sin JavaScript     │
├────────────────────────────────────────────────────────────────┤
│ packages/contracts  La forma de cada respuesta. Zod            │
├────────────────────────────────────────────────────────────────┤
│ packages/domain     Reglas de la competición. Sin I/O          │
├────────────────────────────────────────────────────────────────┤
│ packages/database   Esquema PostgreSQL, migraciones, testing   │
└────────────────────────────────────────────────────────────────┘
```

El navegador habla **solo** con `apps/web`. `apps/web` habla solo con
`apps/api`. Detalle en
[frontend-architecture.md](frontend-architecture.md).

El flujo de una operación administrativa es siempre el mismo:

```
ruta → valida la entrada (Zod)
     → servicio → carga el estado actual
                → @liga/domain decide (o rechaza)
                → persiste el cambio     ┐ en una
                → escribe en audit_log   ┘ transacción
     → serializa la respuesta
```

Ningún servicio decide una regla de competición por su cuenta, y ninguna ruta
toca la base de datos directamente.

Regla de dependencias, en un solo sentido:

- `domain` **no depende de nadie**. Ni de la base de datos, ni de HTTP, ni de
  ninguna librería en runtime. Por eso se puede probar entero en milisegundos.
- `database` conoce el vocabulario del dominio (los enums), pero no sus reglas.
- `api` orquesta: lee de `database`, decide con `domain`, responde HTTP.
- `web` solo habla con `api`.

Ninguna capa de abajo importa a una de arriba. `domain` nunca importa
`database`.

## Stack

| Capa            | Elección                                       | Motivo                                                                                                                         |
| --------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Lenguaje        | TypeScript 6 en modo estricto                  | Un solo lenguaje de la base de datos al navegador; los tipos del dominio se comparten literalmente                             |
| Frontend        | Astro + React + Tailwind                       | Astro sirve HTML estático para lo que casi no cambia (reglamento, historia) e islas React solo donde hace falta interacción    |
| Animación       | GSAP, con moderación                           | Ver más abajo                                                                                                                  |
| Backend         | Node.js + Fastify                              | Ligero, rápido y con validación de esquemas de serie                                                                           |
| Base de datos   | PostgreSQL                                     | Restricciones reales (CHECK, índices únicos parciales, claves foráneas): la mitad de las invariantes las hace cumplir el motor |
| ORM             | Drizzle                                        | El esquema es TypeScript, las migraciones son SQL legible y revisable                                                          |
| Tests           | Vitest                                         | Igual que en los proyectos hermanos                                                                                            |
| Infraestructura | Docker Compose (solo PostgreSQL en desarrollo) |                                                                                                                                |

### Cambios propuestos sobre el stack inicial

La propuesta original se mantiene casi entera. Estas son las tres diferencias,
con su motivo:

1. **Astro con adaptador de servidor, no sitio 100 % estático.** La
   clasificación cambia cada jornada y durante las transmisiones cambia en
   directo. Un sitio estático puro obligaría a reconstruir y desplegar tras cada
   resultado. Propuesta: páginas estáticas para lo que no cambia y renderizado
   en servidor (o islas que consultan la API) para tabla, calendario y
   resultados.

2. **GSAP solo para los momentos grandes.** El tema cyberpunk se puede
   conseguir en un 90 % con CSS (gradientes, `backdrop-filter`, animaciones de
   borde) y transiciones de vista nativas. Reservar GSAP para la portada, la
   presentación del trofeo y la revelación del campeón evita cargar ~50 kB en
   todas las páginas y facilita respetar `prefers-reduced-motion`. No es una
   negativa a usarlo: es acotarlo donde aporta.

3. **Validación de entrada con un esquema declarativo en la API.** Adoptado en
   la Fase 1: **Zod** valida todo lo que entra, y el tipo se deriva del esquema.

Añadido en la Fase 1, con su motivo:

- **PGlite** para los tests de integración: PostgreSQL real sin depender de
  Docker ([ADR 0009](adr/0009-pglite-en-tests.md)).
- **Argon2id** (`@node-rs/argon2`) para las contraseñas.
- **Plugins oficiales de Fastify**: helmet, cors, cookie, rate-limit y formbody.
- El panel de administración se sirve desde la API, sin JavaScript
  ([ADR 0008](adr/0008-panel-servido-por-la-api.md)).

Todo lo demás (Node, Fastify, PostgreSQL, Drizzle, Docker, TypeScript,
Tailwind) se queda como estaba propuesto.

## Por qué el dominio no tiene dependencias

`packages/domain` no instala nada en runtime. Esto no es purismo:

- Los tests del fixture, la puntuación y la clasificación corren en menos de un
  segundo, así que se ejecutan en cada guardado.
- El mismo motor puede ejecutarse en el servidor, en un script de simulación o
  —si algún día interesa— en el navegador para previsualizar escenarios.
- Cuando algo de la tabla no cuadre, el fallo está en un único paquete de
  ~1.200 líneas, no repartido entre consultas SQL y componentes.

## Autenticación y roles

Las consultas son públicas y de solo lectura; **toda escritura exige sesión**.

- Contraseñas con **Argon2id** (19 MiB, 2 iteraciones), nunca en claro.
- El navegador recibe un token aleatorio de 256 bits en una cookie `httpOnly`,
  `SameSite=Lax` y `secure` en producción. En la base de datos se guarda solo su
  **hash SHA-256**.
- Roles: `OWNER`, `ADMIN` y `REFEREE` escriben; `VIEWER` es de solo lectura.
- El login responde lo mismo exista o no la cuenta, y está limitado a 10
  intentos cada 5 minutos.

## Observabilidad

- Logging estructurado (Pino, integrado en Fastify) con nivel por entorno.
- **Identificador de petición** (UUID) en cada request, presente en el log, en el
  cuerpo de cualquier error y —desde la Fase 4— en la propia entrada de
  `audit_log`. Es lo que cruza «esta corrección salió mal» con «este error en el
  log»: sin él son dos hechos sueltos que nadie puede unir.
- Los logs **redactan** `cookie` y `authorization`.
- Manejador de errores centralizado: nada de `try/catch` repartido por las
  rutas, y los errores 500 nunca exponen detalles internos.
- `audit_log` como registro de negocio: qué cambió, quién, cuándo y en qué
  petición. Se consulta filtrado desde `/admin/auditoria`, y los filtros se
  aplican **en la base de datos**: mandar el registro entero al navegador para
  filtrarlo allí enviaría de paso los motivos de cada corrección y las notas
  internas de cada aplazamiento.
- **Métricas de operación** en `GET /api/v1/admin/metrics`: cuánto queda por
  jugar, cuánto lleva atascado y en qué estado está la evidencia externa. Son
  recuentos, no valoraciones: la plataforma no decide qué número es «demasiado».
- **`/health` y `/readiness`** dicen cosas distintas a propósito. El primero, que
  el proceso vive; el segundo, que **sirve** —hace un `select 1` contra la base
  de datos y responde 503 si no llega—. La integración con Clash Royale no entra
  en esa decisión: la liga funciona entera sin ella.

## Errores y contratos

El dominio señala cualquier incumplimiento con `DomainError` y un `code`
estable (`ROSTER_INCOMPLETE`, `INVALID_CROWNS`, `PENDING_RULE`...). La API
traduce código → status HTTP; la interfaz traduce código → mensaje. Ninguna
capa depende del texto del mensaje.

Caso especial: **`PENDING_RULE`**. Cuando una regla todavía no está decidida
(empates, incomparecencias), el motor falla de forma explícita señalando
`docs/pending-rules.md` en lugar de aplicar un comportamiento inventado. Es
deliberado: es preferible un error claro a un resultado silencioso y erróneo en
una competición real.

## Seguridad

- La API key de Clash Royale vive **solo** en el backend, en variables de
  entorno. Nunca se envía al navegador ni se registra en logs. El endpoint
  `/health` informa de si existe, no de su valor.
- Cabeceras de seguridad con Helmet y CSP estricta; el panel funciona con
  `script-src 'none'`.
- CORS cerrado por defecto; en producción no se admite `*`.
- Límite de peticiones global y específico en el login.
- Toda entrada validada con Zod antes de llegar a la lógica.
- Las contraseñas de administración se guardan como hash Argon2id.
- Toda acción administrativa con efecto sobre la competición (cargar resultado,
  corregirlo, sancionar, generar fixture) queda registrada en `audit_log` con
  autor y fecha.
- `.env` está en `.gitignore`; el repositorio solo contiene `.env.example`.
- Tres auditorías automáticas, todas dentro de `npm run verify`:
  `npm run audit:secrets` (formas de secreto en lo versionado, sin imprimir
  nunca el valor), `npm run audit:indexes` (claves ajenas sin índice que las
  cubra) y el barrido de fuga de token en los tests de la API.

El detalle completo —incluido el incidente que dio forma a estas medidas— está en
[security.md](security.md).

## Decisiones registradas

Las decisiones con alternativas reales están en [adr/](adr/):

1. [Monorepo de npm workspaces](adr/0001-monorepo-npm-workspaces.md)
2. [Dominio puro separado de la persistencia](adr/0002-dominio-puro.md)
3. [Fixture por método del círculo con semilla guardada](adr/0003-fixture-metodo-circulo.md)
4. [Local y visitante en la fila del partido, sin tabla MatchPlayer](adr/0004-match-sin-matchplayer.md)
5. [Las reglas sin definir fallan de forma explícita](adr/0005-reglas-pendientes-explicitas.md)
6. [Desempates configurables con mini-liga](adr/0006-desempates-configurables.md)
7. [Sustitución de participantes con trazabilidad](adr/0007-sustitucion-participantes.md)
8. [El panel de administración lo sirve la API](adr/0008-panel-servido-por-la-api.md)
9. [Los tests de integración corren contra PGlite](adr/0009-pglite-en-tests.md)
10. [El reporte de resultados exige sesión en la Fase 1](adr/0010-reportes-autenticados.md)
