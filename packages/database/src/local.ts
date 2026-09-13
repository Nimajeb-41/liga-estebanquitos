/**
 * Base de datos local, guardada en disco.
 *
 * Es el mismo PostgreSQL que usan los tests —PGlite, compilado a WebAssembly—
 * pero apuntando a una carpeta en vez de a memoria. Se aplican **las mismas
 * migraciones** que en un servidor nativo, así que los CHECK, los enums, los
 * índices únicos parciales y las claves foráneas se comportan igual.
 *
 * Por qué existe: una liga de diez personas que se juega los sábados no
 * necesita un servidor de base de datos, y obligar a arrancar Docker antes de
 * cada jornada es una forma segura de que un día no arranque. Con esto la liga
 * se opera con `npm start` y nada más.
 *
 * Lo que **no** es: una base de datos para varios procesos. PGlite abre la
 * carpeta en exclusiva, así que solo puede haber un servidor encendido a la vez.
 * Para producción con varias instancias sigue estando `createDatabase` contra
 * PostgreSQL nativo, y las dos comparten migraciones.
 */

import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import type { LigaDatabase } from './client.ts';
import { MIGRATIONS_FOLDER } from './migrate.ts';
import * as schema from './schema/index.ts';

export interface LocalDatabaseHandle {
  readonly db: LigaDatabase;
  readonly close: () => Promise<void>;
  /** Dónde quedaron los datos. Se registra al arrancar, para poder respaldarlo. */
  readonly dataDir: string;
}

/**
 * Reconoce las cadenas de conexión que piden base local.
 *
 * Se acepta `file:` porque es lo que usan otras bases embebidas y no obliga a
 * inventar una variable de entorno nueva.
 */
export function isLocalDatabaseUrl(url: string): boolean {
  return url.startsWith('file:');
}

/** `file:./datos/liga` → ruta absoluta. */
export function localDataDir(url: string, cwd: string = process.cwd()): string {
  const raw = url.slice('file:'.length);
  return path.resolve(cwd, raw === '' ? './data/liga' : raw);
}

/**
 * Abre (o crea) la base local y aplica las migraciones pendientes.
 *
 * Migrar al abrir es deliberado: con un archivo local no hay un paso de
 * despliegue donde meter `db:migrate`, y arrancar contra un esquema viejo
 * fallaría más tarde y peor.
 */
export async function createLocalDatabase(
  url: string,
  options: { readonly cwd?: string } = {},
): Promise<LocalDatabaseHandle> {
  const dataDir = localDataDir(url, options.cwd);
  mkdirSync(dataDir, { recursive: true });

  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  return {
    // PGlite y node-postgres exponen la misma API de consulta de Drizzle.
    db: db as unknown as LigaDatabase,
    close: async () => {
      await client.close();
    },
    dataDir,
  };
}
