/**
 * Servidor de demostracion, solo para desarrollo.
 *
 * Levanta la API completa contra un PostgreSQL efimero en memoria (PGlite) ya
 * migrado y sembrado, sin necesidad de Docker. Sirve para ver el panel o probar
 * la API en un minuto; los datos se pierden al parar el proceso.
 *
 *   npm run demo --workspace=@liga/api
 *
 * Para trabajar con datos que persistan, usa PostgreSQL de verdad:
 * `npm run db:up && npm run db:migrate && npm run db:seed`.
 */

import { createTestDatabase } from '@liga/database/testing';

import { loadConfig } from '../config.ts';
import { buildServer } from '../server.ts';
import { createDemoClashClient } from './demo-clash-client.ts';
import { applyDemoScenario } from './demo-scenario.ts';
import { applySeasonStart } from './season-start.ts';
import { seed } from './seed.ts';

const DEMO_EMAIL = 'admin@liga-estabanquitos.local';
const DEMO_PASSWORD = 'demo-liga-estabanquitos';

async function main(): Promise<void> {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'development',
    API_PORT: process.env['API_PORT'] ?? '3000',
  });

  if (config.nodeEnv === 'production') {
    console.error('El servidor de demostracion no puede ejecutarse en produccion.');
    process.exit(1);
  }

  const handle = await createTestDatabase();
  const result = await seed(handle.db, {
    tournamentSlug: config.tournamentSlug,
    adminEmail: DEMO_EMAIL,
    adminPassword: DEMO_PASSWORD,
    withTestPlayers: process.argv.includes('--full-roster'),
  });

  // La demostracion nunca llama a Supercell: usa las fixtures del spike. Sin
  // esto haria falta un token valido, y el token esta atado a una IP que en una
  // conexion domestica cambia sola.
  const app = await buildServer({
    config,
    db: handle.db,
    clashRoyaleClient: createDemoClashClient(new Date()),
  });

  /*
    Por defecto, la temporada arranca **limpia**: calendario generado, primeras
    jornadas con fecha y ningun resultado. Es el estado con el que se publica
    una liga de verdad, y el que hay que ver al mirar la pagina.

    Con --scenario se aplica encima el escenario de demostracion, que si inventa
    partidos jugados. Lo usan las pruebas de extremo a extremo, que necesitan
    algo que mirar en cada estado.
  */
  const demo = process.argv.includes('--scenario');
  const scenario = demo
    ? await applyDemoScenario({ app, email: DEMO_EMAIL, password: DEMO_PASSWORD })
    : null;
  const season = demo
    ? null
    : await applySeasonStart({ app, email: DEMO_EMAIL, password: DEMO_PASSWORD });

  await app.listen({ host: config.host, port: config.port });

  console.log(
    [
      '',
      '  Servidor de demostracion (datos en memoria, se pierden al parar).',
      `  Panel:   http://${config.host}:${config.port}/admin`,
      `  API:     http://${config.host}:${config.port}/api/v1`,
      `  Usuario: ${DEMO_EMAIL}`,
      `  Clave:   ${DEMO_PASSWORD}`,
      `  Participantes confirmados: ${result.confirmed}`,
      ...(season !== null
        ? [
            '',
            '  TEMPORADA LISTA PARA EMPEZAR (sin resultados):',
            `    partidos:  ${season.matches} en ${season.rounds} jornadas`,
            `    con fecha: ${season.scheduled}`,
            '',
            '  Usa --scenario si necesitas datos de demostracion jugados.',
          ]
        : scenario === null
          ? ['  Escenario: no aplicado.']
          : [
              '',
              '  ESCENARIO DE DEMOSTRACION - estos NO son resultados oficiales:',
              `    finalizados: ${scenario.completed}`,
              `    en directo:  ${scenario.live}`,
              `    aplazados:   ${scenario.postponed}`,
              `    en disputa:  ${scenario.disputed}`,
              `    sanciones:   ${scenario.sanctions}`,
              `    cuentas de Clash Royale vinculadas: ${scenario.clashLinks}`,
              `    candidatos a revisar:               ${scenario.clashCandidates}`,
            ]),
      '',
    ].join('\n'),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
