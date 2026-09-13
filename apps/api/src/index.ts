/** Punto de entrada del servidor. */

import { createDatabase } from '@liga/database/client';
import { createLocalDatabase, isLocalDatabaseUrl } from '@liga/database/local';

import { ConfigError, loadConfig } from './config.ts';
import { buildServer } from './server.ts';

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.databaseUrl === null) {
    console.error(
      'Falta DATABASE_URL. Copia .env.example a .env, arranca la base con "npm run db:up" y aplica las migraciones con "npm run db:migrate".',
    );
    process.exit(78); // EX_CONFIG
  }

  /*
    Dos formas de guardar los datos, misma base y mismas migraciones:

      postgres://...   servidor nativo. Lo de siempre, y lo de produccion.
      file:./datos     carpeta local. Un solo proceso, sin Docker, sin servicio.

    La segunda existe porque una liga de diez personas no necesita un servidor
    de base de datos, y obligar a arrancar Docker antes de cada jornada es una
    forma segura de que un dia no arranque.
  */
  const local = isLocalDatabaseUrl(config.databaseUrl)
    ? await createLocalDatabase(config.databaseUrl)
    : null;
  const db = local?.db ?? createDatabase({ connectionString: config.databaseUrl });
  const app = await buildServer({ config, db });

  if (local !== null) {
    app.log.info({ dataDir: local.dataDir }, 'base de datos local');
    // Cerrarla al apagar: PGlite abre la carpeta en exclusiva y dejarla tomada
    // impediria volver a arrancar.
    app.addHook('onClose', async () => local.close());
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'cerrando servidor');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(78);
  }
  console.error(error);
  process.exit(1);
});
