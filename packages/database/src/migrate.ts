/**
 * Aplicacion de migraciones.
 *
 * Se usa desde `npm run db:migrate` y desde los tests de integracion. Las
 * migraciones son los ficheros SQL versionados de `drizzle/`: nunca se cambia
 * el esquema tocando la base de datos a mano.
 */

import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/** Carpeta con las migraciones SQL generadas por drizzle-kit. */
export const MIGRATIONS_FOLDER = join(import.meta.dirname, '..', 'drizzle');

export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

/** Punto de entrada CLI: `node src/migrate.ts`. */
async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (connectionString === undefined || connectionString.trim() === '') {
    console.error('Falta DATABASE_URL. Copia .env.example a .env y rellenala.');
    process.exit(78);
  }
  await runMigrations(connectionString);
  console.log('Migraciones aplicadas.');
}

if (process.argv[1] !== undefined && import.meta.filename === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
