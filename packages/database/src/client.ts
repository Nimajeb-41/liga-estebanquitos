/**
 * Conexion a PostgreSQL.
 *
 * La cadena de conexion llega siempre por variable de entorno; nunca se
 * escribe en el codigo ni se expone al frontend.
 */

import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

import * as schema from './schema/index.ts';

/**
 * Tipo unico de base de datos para toda la aplicacion.
 *
 * En desarrollo y produccion es PostgreSQL nativo; en los tests es PGlite
 * (PostgreSQL en WebAssembly). La API de consulta es la misma, asi que el
 * codigo de aplicacion trabaja siempre contra este tipo.
 */
export type LigaDatabase = NodePgDatabase<typeof schema>;

/** Transaccion abierta con `db.transaction(...)`. */
export type LigaTransaction = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * Lo que acepta la capa de acceso a datos: da igual estar dentro o fuera de una
 * transaccion, la API de consulta es la misma.
 */
export type LigaDb = LigaDatabase | LigaTransaction;

export type Database = LigaDatabase;

export interface DatabaseOptions {
  readonly connectionString: string;
  readonly max?: number;
  readonly logger?: boolean;
}

export function createDatabase(options: DatabaseOptions): LigaDatabase {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
  });
  return drizzle(pool, { schema, logger: options.logger ?? false });
}
