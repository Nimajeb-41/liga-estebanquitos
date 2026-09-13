# Guía de desarrollo

Requisitos: Node.js >= 22.12 y, para la base de datos de desarrollo, Docker.

## Puesta en marcha

```bash
npm install
```

```bash
cp .env.example .env
```

Rellena `ADMIN_PASSWORD` (mínimo 12 caracteres). El resto de valores por defecto
sirven para desarrollo.

### 1. Arrancar PostgreSQL

```bash
npm run db:up
```

Levanta PostgreSQL 17 en el puerto 5432 (`docker-compose.yml`). Se para con
`npm run db:down`; `npm run db:reset` lo borra y lo vuelve a crear vacío.

### 2. Aplicar las migraciones

```bash
npm run db:migrate
```

Ejecuta los SQL de `packages/database/drizzle/` en orden. El esquema nunca se
cambia a mano contra la base de datos: se edita
`packages/database/src/schema/`, se genera la migración con
`npm run db:generate` y se revisa el SQL resultante antes de aplicarlo.

### 3. Sembrar datos

```bash
npm run db:seed
```

Crea el torneo, su reglamento, el administrador de `ADMIN_EMAIL` /
`ADMIN_PASSWORD` y los **6 participantes confirmados reales**. Es idempotente.

Para tener los 10 y poder generar el calendario en desarrollo:

```bash
npm run db:seed -- --with-test-players
```

Añade `TEST_PLAYER_01` … `TEST_PLAYER_04`. Se llaman así a propósito: nadie los
confunde con inscritos reales. El flag está bloqueado si `NODE_ENV=production`.

### 4. Arrancar la API

```bash
npm run api:dev
```

- API: `http://127.0.0.1:3000/api/v1`
- Salud: `http://127.0.0.1:3000/health`
- Panel de respaldo, sin JavaScript: `http://127.0.0.1:3000/admin`

### 5. Arrancar el frontend

En otra terminal:

```bash
npm run web:dev
```

- Sitio: `http://127.0.0.1:4321`
- Panel: `http://127.0.0.1:4321/admin`

El frontend habla con la API por `API_URL` (por defecto
`http://127.0.0.1:3000`). El navegador **solo** habla con el frontend.

## Sin Docker: servidor de demostración

Para ver el panel en un minuto sin instalar nada más:

```bash
npm run demo
```

Levanta la API contra un PostgreSQL efímero en memoria (PGlite), migrado y
sembrado con los 10 participantes, y aplica un **escenario de demostración**:
calendario publicado, dos jornadas jugadas, un partido en directo, uno aplazado,
uno en disputa y una sanción. Todo pasa por la API real, así que el escenario no
puede llegar a un estado que la competición no permita.

Imprime en consola el usuario, la contraseña y un recordatorio de que **no son
resultados oficiales**. Los datos se pierden al parar el proceso.

Con el frontend en marcha es la forma más rápida de ver la plataforma entera:

```bash
npm run demo
```

```bash
npm run web:dev
```

## Comandos

| Comando                                          | Qué hace                                             |
| ------------------------------------------------ | ---------------------------------------------------- |
| `npm test`                                       | Toda la suite: dominio, esquema, API y frontend      |
| `npm run typecheck`                              | TypeScript y `astro check`                           |
| `npm run lint`                                   | ESLint                                               |
| `npm run format`                                 | Prettier                                             |
| `npm run build`                                  | Construye el frontend                                |
| `npm run verify`                                 | format:check + lint + typecheck + test + build       |
| `npm run e2e`                                    | Recorridos de extremo a extremo (pide `build` antes) |
| `npm run db:up` / `db:down` / `db:reset`         | PostgreSQL en Docker                                 |
| `npm run db:generate` / `db:migrate` / `db:seed` | Esquema y datos                                      |
| `npm run api:dev`                                | API en modo desarrollo (recarga al guardar)          |
| `npm run web:dev` / `web:build`                  | Frontend                                             |
| `npm run demo`                                   | API + base de datos en memoria + escenario           |

## Recorrido completo del torneo

Con la API arrancada y sesión iniciada en `/admin`:

1. **Participantes** (`/admin/players`): añadir y confirmar hasta llegar a 10.
   Mientras falten, las plazas se ven como `TBD / POR CONFIRMAR`.
2. **Resumen** (`/admin`): pasar el torneo a `READY`. Solo lo permite con
   exactamente 10 confirmados.
3. **Calendario** (`/admin/fixtures`): generar el calendario oficial. Se crean
   18 jornadas y 90 partidos, se guarda la semilla y el torneo pasa a
   `SCHEDULED`.
4. **Resumen**: pasar a `LIVE`. A partir de aquí se cargan resultados.
5. **Partido** (`/admin/matches/:id`): fijar fecha, poner en directo, registrar
   el resultado, posponer, reprogramar o corregir.
6. **Clasificación** (`/admin/standings`): se recalcula sola.
7. **Sanciones** (`/admin/sanctions`) y **Auditoría** (`/admin/audit`).

El mismo recorrido por API está en [api.md](api.md).

## Estructura

```
packages/domain     Motor de competición. Sin I/O, sin dependencias de runtime.
packages/database   Esquema PostgreSQL, migraciones y utilidades de test.
apps/api
├── src/data        Acceso a datos. Consultas, sin reglas.
├── src/services    Orquestación: cargar → decidir con el dominio → persistir → auditar.
├── src/routes      HTTP: validar, llamar al servicio, serializar.
├── src/auth        Contraseñas, sesiones y guardas.
├── src/admin-ui    Panel de administración (HTML servido por el backend).
└── src/scripts     Seed y servidor de demostración.
apps/web            Frontend público. Fase 2.
```

Regla de dependencias: `routes → services → data → database`, y cualquiera
puede usar `domain`. **`domain` no importa a nadie.**

## Tests

```bash
npm test
```

- `packages/domain` — reglas puras, sin base de datos.
- `packages/database` — restricciones del esquema contra PostgreSQL real.
- `apps/api` — integración de punta a punta: HTTP → servicio → base de datos.

Los tests de integración usan **PGlite**, PostgreSQL compilado a WebAssembly.
Se aplican las mismas migraciones que en producción, así que se prueban los
`CHECK`, los índices únicos parciales y las claves foráneas de verdad, sin
necesidad de tener Docker arrancado y sin estado compartido entre suites.

Detalle en [testing.md](testing.md).

## Convenciones

- Código y nombres en inglés; comentarios, documentación e interfaz en español.
- Comentarios que expliquen **por qué**, no qué hace la línea siguiente.
- Nada de emojis como iconos de interfaz.
- Los secretos van en `.env`, que no se sube al repositorio.
