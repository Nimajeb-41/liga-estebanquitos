/**
 * Auditoria de indices.
 *
 * Postgres **no** indexa las claves ajenas por su cuenta. Una clave ajena sin
 * indice se paga dos veces: cada consulta que navega la relacion recorre la
 * tabla entera, y cada borrado en la tabla referenciada tiene que comprobar
 * todas las filas que podrian apuntar a la que se va.
 *
 * En una liga de diez personas nada de esto se nota. Se nota en la temporada
 * cuatro, y para entonces nadie se acuerda de que faltaba un indice. Por eso
 * esto es un script y no una revision a ojo: se ejecuta, y si aparece una
 * relacion sin cubrir lo dice con nombre y apellidos.
 *
 * Un indice **cubre** una columna si esa columna es la primera del indice. Un
 * indice sobre `(a, b)` sirve para buscar por `a`, pero no por `b`; el script
 * aplica esa misma regla en vez de conformarse con «la columna aparece».
 *
 *   npm run audit:indexes
 */

import { createTestDatabase } from '../packages/database/src/testing.ts';

const CYAN = '[36m';
const DIM = '[2m';
const RED = '[31m';
const GREEN = '[32m';
const RESET = '[0m';

/**
 * Relaciones que no necesitan indice, con el motivo.
 *
 * La lista es corta y cada entrada explica por que. Sin motivo escrito, esto
 * se convertiria en el sitio donde se esconde lo que da pereza arreglar.
 */
const ADMIN_NEVER_DELETED =
  'La aplicacion no borra administradores por ninguna via: no hay endpoint ni script. ' +
  'Un indice que nunca se usa solo cuesta escrituras. Si algun dia se anade el borrado, ' +
  'quitar esta excepcion y crear el indice.';

const ACCEPTED = new Map([
  ['battle_candidates.resolved_by_admin_id', ADMIN_NEVER_DELETED],
  ['fixture_generations.generated_by_admin_id', ADMIN_NEVER_DELETED],
  ['match_postponements.admin_id', ADMIN_NEVER_DELETED],
  ['match_result_revisions.changed_by_admin_id', ADMIN_NEVER_DELETED],
  ['match_results.verified_by_admin_id', ADMIN_NEVER_DELETED],
  ['sanctions.issued_by_admin_id', ADMIN_NEVER_DELETED],
  ['sanctions.revoked_by_admin_id', ADMIN_NEVER_DELETED],
  [
    'deck_cards.card_id',
    'El catalogo de cartas no se borra: se sincroniza con upsert, y la clave es RESTRICT. ' +
      'Ademas deck_cards solo se lee por mazo, nunca por carta.',
  ],
]);

async function main() {
  const handle = await createTestDatabase();

  // Claves ajenas declaradas, con su columna.
  const { rows: keys } = await handle.db.execute(`
    select
      tc.table_name       as table_name,
      kcu.column_name     as column_name,
      ccu.table_name      as target_table
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
     and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
    order by tc.table_name, kcu.column_name
  `);

  // Primera columna de cada indice: es la unica que sirve para buscar sola.
  const { rows: indexes } = await handle.db.execute(`
    select
      t.relname  as table_name,
      a.attname  as column_name,
      i.relname  as index_name
    from pg_index ix
    join pg_class t on t.oid = ix.indrelid
    join pg_class i on i.oid = ix.indexrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = ix.indkey[0]
    where n.nspname = 'public'
  `);

  const covered = new Set(
    indexes.map((row) => `${String(row.table_name)}.${String(row.column_name)}`),
  );

  const missing = [];
  const accepted = [];

  for (const key of keys) {
    const name = `${String(key.table_name)}.${String(key.column_name)}`;
    if (covered.has(name)) continue;
    if (ACCEPTED.has(name)) {
      accepted.push({ name, reason: ACCEPTED.get(name) });
      continue;
    }
    missing.push({ name, target: String(key.target_table) });
  }

  console.log(
    `\n  ${CYAN}Auditoria de indices${RESET} ${DIM}· ${keys.length} claves ajenas, ${covered.size} columnas indexadas${RESET}\n`,
  );

  for (const entry of accepted) {
    console.log(`  ${DIM}aceptada${RESET}  ${entry.name}`);
    console.log(`            ${DIM}${entry.reason}${RESET}`);
  }

  if (missing.length === 0) {
    console.log(`  ${GREEN}Toda clave ajena tiene un indice que la cubre.${RESET}\n`);
    await handle.close();
    return;
  }

  console.log(`  ${RED}${missing.length} clave(s) ajena(s) sin indice:${RESET}\n`);
  for (const entry of missing) {
    console.log(`  ${RED}·${RESET} ${entry.name} ${DIM}-> ${entry.target}${RESET}`);
  }
  console.log(`\n  ${DIM}Anade el indice en packages/database/src/schema y su migracion,${RESET}`);
  console.log(`  ${DIM}o justifica la excepcion en ACCEPTED dentro de este script.${RESET}\n`);

  await handle.close();
  process.exitCode = 1;
}

await main();
