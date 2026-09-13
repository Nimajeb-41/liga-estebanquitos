# ADR 0009 — Los tests de integración corren contra PGlite

**Estado:** aceptada · 2026-09-08

## Contexto

La Fase 1 exige persistencia real: si las restricciones del esquema no se
prueban, no sirven de nada. Pero atar la suite de tests a un contenedor Docker
tiene dos problemas conocidos: falla cuando el demonio no está arrancado (es
justo lo que pasó al empezar esta fase) y deja estado entre ejecuciones, así que
los tests empiezan a depender del orden.

Sustituir PostgreSQL por SQLite en los tests tampoco vale: el esquema usa enums,
`text[]`, `jsonb`, índices únicos parciales y `CHECK`. Probar contra otro motor
sería probar otra cosa.

## Decisión

Los tests de integración usan **PGlite**: PostgreSQL compilado a WebAssembly,
en memoria. Cada suite crea su propia base, le aplica **las mismas migraciones
SQL** que producción y la descarta al terminar.

`packages/database/src/testing.ts` expone `createTestDatabase()`, y el tipo que
devuelve es el mismo `LigaDatabase` que usa la aplicación: el código de negocio
no sabe contra qué está corriendo.

Docker y PostgreSQL nativo siguen siendo el entorno de desarrollo y producción.

## Alternativas descartadas

- **Testcontainers / Docker en los tests.** Depende de que el demonio esté
  arrancado y añade decenas de segundos por suite.
- **Una base de datos compartida de test.** Estado entre ejecuciones y tests que
  se pisan entre sí.
- **Mocks del repositorio.** Probarían que el código llama a lo que creemos, no
  que la base de datos acepta lo que le mandamos. Justamente lo que hay que
  comprobar aquí son los `CHECK` y los índices únicos.

## Consecuencias

- `npm test` funciona sin Docker, en cualquier máquina y en CI.
- Se prueban de verdad las restricciones del esquema: hay 12 tests que
  comprueban que la base rechaza plazas duplicadas, auto-enfrentamientos,
  sanciones positivas y motivos vacíos.
- Cada suite parte de cero: no hay orden implícito entre tests.
- **Coste asumido**: PGlite es una build de PostgreSQL, no el binario oficial.
  Puede haber diferencias en extensiones o en detalles de rendimiento. Nada de
  lo que este proyecto usa entra en esa zona, pero antes de desplegar conviene
  aplicar las migraciones también contra el PostgreSQL de verdad
  (`npm run db:up && npm run db:migrate`), que es un paso documentado.
