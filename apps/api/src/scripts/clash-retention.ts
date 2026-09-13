/**
 * Observacion de la retencion del historial de batallas.
 *
 * La Fase 3 dejo una cota inferior: una amistosa seguia apareciendo **al menos
 * 41,4 horas** despues. El techo sigue sin conocerse, y no se puede deducir: hay
 * que mirar la misma batalla varias veces y anotar cuando deja de estar.
 *
 * Esto no mide nada por si solo. Es un observador: cada ejecucion anota una
 * fila, y la conclusion sale de cruzar muchas ejecuciones separadas en el tiempo.
 *
 *   npm run clash:retention -- --tag "#ABC123"
 *   npm run clash:retention -- --report
 *
 * Conviene ejecutarlo periodicamente —una vez al dia basta— sobre las cuentas
 * de las que interese conocer la ventana.
 *
 * El token entra por entorno y no sale nunca: no se imprime, no se anota y no
 * aparece en ningun error.
 */

import { createDatabase, type LigaDatabase } from '@liga/database/client';
import { schema } from '@liga/database';
import { desc, eq } from 'drizzle-orm';

import { loadConfig } from '../config.ts';
import { ClashRoyaleClient, normalizeTag } from '../integrations/clash-royale/client.ts';
import { normalizeBattlelog } from '../integrations/clash-royale/normalizer.ts';
import { ClashRoyaleError } from '../integrations/clash-royale/types.ts';

/* -------------------------------------------------------------------------- */
/* Argumentos                                                                  */
/* -------------------------------------------------------------------------- */

function parseArgs(argv: readonly string[]) {
  const tags: string[] = [];
  let report = false;

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--tag' && typeof argv[index + 1] === 'string') {
      tags.push(argv[index + 1] as string);
      index += 1;
    }
    if (argv[index] === '--report') report = true;
  }

  return { tags, report };
}

const hoursBetween = (from: Date, to: Date): number =>
  Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 10) / 10;

/* -------------------------------------------------------------------------- */
/* Informe                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Lo que se puede afirmar con las observaciones acumuladas.
 *
 * Dos numeros, y ninguno es «la retencion»:
 *
 * - la mayor edad con la batalla **presente** es la cota inferior: al menos
 *   tanto se conserva;
 * - la menor edad con la batalla **ausente** es la cota superior: antes de eso
 *   ya habia desaparecido.
 *
 * Mientras no exista ninguna observacion de ausencia, no hay cota superior. Se
 * dice, en lugar de rellenarla con la inferior.
 */
async function printReport(db: LigaDatabase): Promise<void> {
  const rows = await db
    .select()
    .from(schema.battleRetentionObservations)
    .orderBy(desc(schema.battleRetentionObservations.observedAt))
    .limit(500);

  if (rows.length === 0) {
    console.log('\n  Todavia no hay ninguna observacion.');
    console.log('  Ejecuta:  npm run clash:retention -- --tag "#TUTAG"\n');
    return;
  }

  const usable = rows.filter((row) => row.requestStatus === 'OK');
  const present = usable.filter((row) => row.stillPresent).map((row) => Number(row.ageHours));
  const absent = usable.filter((row) => !row.stillPresent).map((row) => Number(row.ageHours));

  const first = rows[rows.length - 1]!.observedAt;
  const last = rows[0]!.observedAt;

  console.log('\n  RETENCION OBSERVADA del historial de batallas');
  console.log('  (observada, no garantizada: Supercell no publica ninguna)\n');
  console.log(`    observaciones ............ ${rows.length}`);
  console.log(`    con respuesta correcta ... ${usable.length}`);
  console.log(
    `    huellas distintas ........ ${new Set(rows.map((r) => r.battleFingerprint)).size}`,
  );
  console.log(`    desde .................... ${first.toISOString()}`);
  console.log(`    hasta .................... ${last.toISOString()}`);
  console.log('');
  console.log(
    `    cota INFERIOR ............ ${present.length === 0 ? 'sin datos' : `${Math.max(...present)} h (seguia estando)`}`,
  );
  console.log(
    `    cota SUPERIOR ............ ${absent.length === 0 ? 'sin determinar: ninguna batalla ha desaparecido todavia' : `${Math.min(...absent)} h (ya no estaba)`}`,
  );

  const failures = rows.filter((row) => row.requestStatus !== 'OK');
  if (failures.length > 0) {
    const kinds = new Map<string, number>();
    for (const row of failures)
      kinds.set(row.requestStatus, (kinds.get(row.requestStatus) ?? 0) + 1);
    console.log(`\n    observaciones fallidas ... ${failures.length}`);
    for (const [kind, count] of kinds) console.log(`      ${kind}: ${count}`);
    console.log('    (un fallo no significa que la batalla desaparecio)');
  }
  console.log('');
}

/* -------------------------------------------------------------------------- */
/* Observacion                                                                 */
/* -------------------------------------------------------------------------- */

async function observe(
  db: LigaDatabase,
  client: ClashRoyaleClient,
  tag: string,
  now: Date,
): Promise<void> {
  console.log(`\n  ${tag}`);

  /* Huellas que ya se conocian de esta cuenta. */
  const known = await db
    .selectDistinct({
      fingerprint: schema.battleRetentionObservations.battleFingerprint,
      battleTime: schema.battleRetentionObservations.battleTime,
    })
    .from(schema.battleRetentionObservations)
    .where(eq(schema.battleRetentionObservations.playerTag, tag));

  /* Lo que devuelve la API ahora mismo. */
  let present = new Map<string, Date>();
  let requestStatus = 'OK';

  try {
    const raw = await client.getBattleLog(tag);
    const { battles } = normalizeBattlelog(raw);
    present = new Map(battles.map((battle) => [battle.fingerprint, battle.battleTime]));
    console.log(`    la API devolvio ${raw.length} entradas, ${battles.length} utilizables`);
  } catch (error) {
    requestStatus = error instanceof ClashRoyaleError ? error.kind : 'UNKNOWN_ERROR';
    console.log(`    la peticion fallo: ${requestStatus}`);
    // Se anota igual. Sin esto, un 403 se confundiria con «desaparecieron».
  }

  const observations: (typeof schema.battleRetentionObservations.$inferInsert)[] = [];

  /* Las que ya se seguian: ¿siguen? */
  for (const entry of known) {
    observations.push({
      playerTag: tag,
      battleFingerprint: entry.fingerprint,
      battleTime: entry.battleTime,
      ageHours: String(hoursBetween(entry.battleTime, now)),
      stillPresent: requestStatus === 'OK' && present.has(entry.fingerprint),
      requestStatus,
      notes: requestStatus === 'OK' ? null : 'La API no respondio: la ausencia no es concluyente.',
    });
  }

  /* Las que aparecen por primera vez: se empiezan a seguir. */
  const knownFingerprints = new Set(known.map((entry) => entry.fingerprint));
  for (const [fingerprint, battleTime] of present) {
    if (knownFingerprints.has(fingerprint)) continue;
    observations.push({
      playerTag: tag,
      battleFingerprint: fingerprint,
      battleTime,
      ageHours: String(hoursBetween(battleTime, now)),
      stillPresent: true,
      requestStatus,
      notes: 'Primera observacion de esta batalla.',
    });
  }

  if (observations.length === 0) {
    console.log('    nada que anotar todavia');
    return;
  }

  await db.insert(schema.battleRetentionObservations).values(observations);

  const nuevas = observations.filter((entry) => entry.notes?.startsWith('Primera')).length;
  const desaparecidas = observations.filter((entry) => !entry.stillPresent).length;
  console.log(`    anotadas ${observations.length} observaciones`);
  console.log(`      nuevas a seguir: ${nuevas}`);
  console.log(`      ya no aparecen:  ${desaparecidas}`);
}

/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const { tags, report } = parseArgs(process.argv.slice(2));
  const config = loadConfig();

  if (config.databaseUrl === null) {
    console.error(
      [
        '',
        '  Falta DATABASE_URL.',
        '',
        '  Medir la retencion exige una base de datos que persista entre',
        '  ejecuciones: la conclusion sale de comparar observaciones separadas',
        '  en el tiempo. La demostracion usa memoria y no sirve para esto.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  const db = createDatabase({ connectionString: config.databaseUrl });

  try {
    if (tags.length === 0 || report) {
      await printReport(db);
      if (tags.length === 0) return;
    }

    if (config.clashRoyale.token === null) {
      console.error(
        [
          '',
          '  Falta CLASH_ROYALE_API_TOKEN.',
          '',
          '  Guardalo en .env, que ya esta en .gitignore. Nunca en la linea de',
          '  comandos: quedaria en el historial del interprete.',
          '',
        ].join('\n'),
      );
      process.exit(1);
    }

    const client = new ClashRoyaleClient({
      baseUrl: config.clashRoyale.baseUrl,
      token: config.clashRoyale.token,
      timeoutMs: config.clashRoyale.timeoutMs,
      maxRetries: config.clashRoyale.maxRetries,
    });

    const now = new Date();
    console.log(`\n  Observacion de retencion · ${now.toISOString()}`);

    for (const raw of tags) {
      await observe(db, client, normalizeTag(raw), now);
    }

    await printReport(db);
  } finally {
    // El proceso es de un solo uso: dejar que Node cierre el pool al salir.
  }
}

main().catch((error: unknown) => {
  // Un fallo aqui no debe arrastrar el token a los logs.
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
