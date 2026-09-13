/**
 * Base de datos para tests de integracion.
 *
 * Usa PGlite: PostgreSQL de verdad compilado a WebAssembly, en memoria. Se
 * aplican las mismas migraciones SQL que en produccion, asi que se prueban los
 * CHECK, los indices unicos parciales, los enums y las claves foraneas reales,
 * sin depender de que Docker este arrancado ni dejar estado entre tests.
 *
 * Para desarrollo y produccion se sigue usando PostgreSQL nativo (ver
 * docker-compose.yml y `createDatabase`).
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import type { LigaDatabase } from './client.ts';
import { MIGRATIONS_FOLDER } from './migrate.ts';
import * as schema from './schema/index.ts';

export type TestDatabase = LigaDatabase;

export interface TestDatabaseHandle {
  readonly db: TestDatabase;
  readonly close: () => Promise<void>;
}

/** Crea una base de datos limpia y migrada. Cada llamada es independiente. */
export async function createTestDatabase(): Promise<TestDatabaseHandle> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return {
    // PGlite y node-postgres exponen la misma API de consulta de Drizzle; el
    // codigo de aplicacion trabaja contra un unico tipo.
    db: db as unknown as LigaDatabase,
    close: async () => {
      await client.close();
    },
  };
}
