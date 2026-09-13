/**
 * Spike de la API de Clash Royale.
 *
 * Este script NO forma parte del flujo del torneo. No toca la base de datos, no
 * escribe resultados y no importa nada. Lo unico que hace es preguntarle a la
 * API real y **anotar lo que responde**, para que las dudas abiertas de
 * `docs/clash-royale-api.md` se cierren con evidencia y no con suposiciones.
 *
 * Las respuestas las deduce el codigo contando lo que llega, no interpretandolo:
 * cuantas batallas hay, que valores de `type` aparecen, si existe `crowns`, que
 * claves trae cada objeto. Si un campo no viene, se anota como ausente. Nunca se
 * rellena con un valor plausible.
 *
 *   CLASH_ROYALE_API_TOKEN=... npm run spike:clash-royale -- --tag "#ABC123"
 *
 * Se pueden pasar varios `--tag`. Para responder a la pregunta que importa —si
 * una batalla amistosa aparece en el historial— conviene pasar los tags de los
 * DOS jugadores que la disputaron, y ejecutarlo poco despues de jugarla.
 *
 * Escribe tres cosas en `evidence/clash-royale/` (carpeta ignorada por git):
 *
 * - el volcado crudo, para poder revisarlo a mano;
 * - un informe con las respuestas mecanicas a cada pregunta;
 * - fixtures **seudonimizadas**, sin tags ni nombres reales, que si son seguras
 *   de versionar y que alimentan los tests sin depender de Internet.
 *
 * El token entra por variable de entorno y no sale nunca: no se imprime, no se
 * vuelca y no se escribe en ningun archivo.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { ClashRoyaleClient, normalizeTag } from '../integrations/clash-royale/client.ts';
import { ClashRoyaleError, type ClashBattle } from '../integrations/clash-royale/types.ts';

const OUT_DIR = path.join(process.cwd(), 'evidence', 'clash-royale');
const FIXTURE_DIR = path.join(process.cwd(), 'apps', 'api', 'test', 'fixtures', 'clash-royale');

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                  */
/* -------------------------------------------------------------------------- */

function parseTags(argv: readonly string[]): string[] {
  const tags: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--tag' && typeof argv[index + 1] === 'string') {
      tags.push(argv[index + 1] as string);
      index += 1;
    }
  }
  return tags;
}

/**
 * Seudonimo estable para un tag o un nombre.
 *
 * Un historial de batallas lleva tags y nombres de terceros que no han dado
 * permiso para acabar en un repositorio. Se sustituyen por un identificador
 * derivado por hash: sirve para distinguir jugadores dentro de la fixture y no
 * permite recuperar el original.
 */
function pseudonym(prefix: string, value: string): string {
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 6).toUpperCase();
  return `${prefix}${digest}`;
}

/** Todas las claves que aparecen en una coleccion de objetos. */
function keysOf(values: readonly unknown[]): string[] {
  const keys = new Set<string>();
  for (const value of values) {
    if (value !== null && typeof value === 'object') {
      for (const key of Object.keys(value)) keys.add(key);
    }
  }
  return [...keys].sort();
}

function count<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  return values.filter(predicate).length;
}

/**
 * `battleTime` llega como `20260908T220000.000Z`, sin guiones ni dos puntos.
 * Se convierte a ISO para poder ordenarlo y restarlo.
 */
function parseBattleTime(value: string | undefined): Date | null {
  if (typeof value !== 'string') return null;
  const iso = value.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6');
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* -------------------------------------------------------------------------- */
/* Analisis                                                                    */
/* -------------------------------------------------------------------------- */

interface SideAnalysis {
  readonly sides: number;
  readonly withCrowns: number;
  readonly withCards: number;
  readonly withTag: number;
  readonly cardCounts: readonly number[];
  readonly keys: readonly string[];
  readonly cardKeys: readonly string[];
}

function analyzeSides(battles: readonly ClashBattle[]): SideAnalysis {
  const sides = battles.flatMap((battle) => [...(battle.team ?? []), ...(battle.opponent ?? [])]);
  const cards = sides.flatMap((side) => [...(side.cards ?? [])]);

  return {
    sides: sides.length,
    withCrowns: count(sides, (side) => typeof side.crowns === 'number'),
    withCards: count(sides, (side) => Array.isArray(side.cards) && side.cards.length > 0),
    withTag: count(sides, (side) => typeof side.tag === 'string' && side.tag.length > 0),
    cardCounts: [...new Set(sides.map((side) => (side.cards ?? []).length))].sort((a, b) => a - b),
    keys: keysOf(sides),
    cardKeys: keysOf(cards),
  };
}

interface BattlelogAnalysis {
  readonly tag: string;
  readonly entries: number;
  readonly types: Record<string, number>;
  readonly gameModes: Record<string, number>;
  readonly teamSizes: readonly number[];
  readonly battleKeys: readonly string[];
  readonly oldest: string | null;
  readonly newest: string | null;
  readonly spanHours: number | null;
  readonly sides: SideAnalysis;
  readonly withBattleTime: number;
}

function analyzeBattlelog(tag: string, battles: readonly ClashBattle[]): BattlelogAnalysis {
  const tally = (values: readonly (string | undefined)[]): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const value of values) {
      const key = value ?? '(ausente)';
      result[key] = (result[key] ?? 0) + 1;
    }
    return result;
  };

  const times = battles
    .map((battle) => parseBattleTime(battle.battleTime))
    .filter((date): date is Date => date !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  const oldest = times[0] ?? null;
  const newest = times[times.length - 1] ?? null;

  return {
    tag,
    entries: battles.length,
    types: tally(battles.map((battle) => battle.type)),
    gameModes: tally(battles.map((battle) => battle.gameMode?.name)),
    teamSizes: [...new Set(battles.map((battle) => (battle.team ?? []).length))].sort(
      (a, b) => a - b,
    ),
    battleKeys: keysOf(battles),
    oldest: oldest?.toISOString() ?? null,
    newest: newest?.toISOString() ?? null,
    spanHours:
      oldest === null || newest === null
        ? null
        : Math.round(((newest.getTime() - oldest.getTime()) / 3_600_000) * 10) / 10,
    sides: analyzeSides(battles),
    withBattleTime: count(battles, (battle) => typeof battle.battleTime === 'string'),
  };
}

/* -------------------------------------------------------------------------- */
/* Seudonimizacion                                                             */
/* -------------------------------------------------------------------------- */

function sanitizeBattle(battle: ClashBattle): unknown {
  const side = (entry: Record<string, unknown>): Record<string, unknown> => ({
    ...entry,
    ...(typeof entry['tag'] === 'string'
      ? { tag: `#${pseudonym('P', entry['tag'] as string)}` }
      : {}),
    ...(typeof entry['name'] === 'string'
      ? { name: pseudonym('Jugador-', entry['name'] as string) }
      : {}),
    ...(entry['clan'] !== null && typeof entry['clan'] === 'object'
      ? { clan: { tag: '#CLAN', name: 'Clan' } }
      : {}),
  });

  const raw = battle as unknown as Record<string, unknown>;
  return {
    ...raw,
    ...(Array.isArray(raw['team'])
      ? { team: (raw['team'] as Record<string, unknown>[]).map(side) }
      : {}),
    ...(Array.isArray(raw['opponent'])
      ? { opponent: (raw['opponent'] as Record<string, unknown>[]).map(side) }
      : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Ejecucion                                                                   */
/* -------------------------------------------------------------------------- */

interface Probe {
  readonly name: string;
  readonly ok: boolean;
  readonly status: number | null;
  readonly reason: string | null;
  readonly detail: string;
}

async function probe(name: string, run: () => Promise<string>): Promise<Probe> {
  try {
    const detail = await run();
    return { name, ok: true, status: 200, reason: null, detail };
  } catch (error) {
    if (error instanceof ClashRoyaleError) {
      return {
        name,
        ok: false,
        status: error.status,
        reason: error.reason,
        detail: `${error.kind}: ${error.message}`,
      };
    }
    return {
      name,
      ok: false,
      status: null,
      reason: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const token = (process.env['CLASH_ROYALE_API_TOKEN'] ?? '').trim();
  const baseUrl = process.env['CLASH_ROYALE_API_BASE_URL'] ?? 'https://api.clashroyale.com/v1';
  const tags = parseTags(process.argv.slice(2)).map(normalizeTag);

  if (token.length === 0) {
    console.error(
      [
        '',
        '  Falta CLASH_ROYALE_API_TOKEN.',
        '',
        '  1. Entra en https://developer.clashroyale.com con tu cuenta de Supercell.',
        '  2. Crea un token declarando la IP publica desde la que se va a usar.',
        '     El token solo funciona desde esa IP.',
        '  3. Guardalo en .env (que ya esta en .gitignore):',
        '',
        '       CLASH_ROYALE_API_TOKEN=...',
        '',
        '  4. Vuelve a ejecutar:',
        '',
        '       npm run spike:clash-royale -- --tag "#TUTAG"',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  if (tags.length === 0) {
    console.error(
      '\n  Falta al menos un --tag. Ejemplo:\n\n    npm run spike:clash-royale -- --tag "#ABC123"\n',
    );
    process.exit(1);
  }

  const client = new ClashRoyaleClient({ baseUrl, token });

  console.log(`\n  Spike de Clash Royale · ${new Date().toISOString()}`);
  console.log(`  Base: ${baseUrl}`);
  console.log(`  Tags: ${tags.join(', ')}\n`);

  const probes: Probe[] = [];
  const analyses: BattlelogAnalysis[] = [];
  const rawBattlelogs: Record<string, readonly ClashBattle[]> = {};
  let cardCatalogueSize: number | null = null;
  let cardKeys: string[] = [];

  /* 1. Autenticacion y catalogo de cartas. */
  probes.push(
    await probe('GET /cards', async () => {
      const { cards, supportCards } = await client.getCards();
      cardCatalogueSize = cards.length;
      cardKeys = keysOf(cards);
      return `${cards.length} cartas y ${supportCards.length} tropas de torre · claves: ${cardKeys.join(', ')}`;
    }),
  );

  /* 2. Perfil y battlelog de cada tag. */
  for (const tag of tags) {
    probes.push(
      await probe(`GET /players/${tag}`, async () => {
        const player = await client.getPlayer(tag);
        const deck = player.currentDeck ?? [];
        return `nombre presente: ${typeof player.name === 'string'} · currentDeck: ${deck.length} cartas`;
      }),
    );

    probes.push(
      await probe(`GET /players/${tag}/battlelog`, async () => {
        const battles = await client.getBattleLog(tag);
        rawBattlelogs[tag] = battles;
        const analysis = analyzeBattlelog(tag, battles);
        analyses.push(analysis);
        return `${analysis.entries} batallas · tipos: ${Object.keys(analysis.types).join(', ') || 'ninguno'}`;
      }),
    );
  }

  /* 3. Salida. */
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(FIXTURE_DIR, { recursive: true });

  const report = {
    runAt: new Date().toISOString(),
    baseUrl,
    tagsProbed: tags.length,
    probes,
    cardCatalogueSize,
    cardKeys,
    battlelogs: analyses,
  };

  await writeFile(
    path.join(OUT_DIR, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(OUT_DIR, 'battlelogs.raw.json'),
    `${JSON.stringify(rawBattlelogs, null, 2)}\n`,
    'utf8',
  );

  const sanitized = Object.values(rawBattlelogs).flat().map(sanitizeBattle);
  if (sanitized.length > 0) {
    await writeFile(
      path.join(FIXTURE_DIR, 'battlelog.sample.json'),
      `${JSON.stringify(sanitized, null, 2)}\n`,
      'utf8',
    );
  }

  /* 4. Resumen en consola. */
  console.log('  PRUEBAS');
  for (const entry of probes) {
    const mark = entry.ok ? 'ok ' : 'NO ';
    const status = entry.status === null ? '---' : String(entry.status);
    console.log(`   ${mark} [${status}] ${entry.name}`);
    console.log(`        ${entry.detail}`);
  }

  for (const analysis of analyses) {
    console.log(`\n  BATTLELOG ${analysis.tag}`);
    console.log(`    entradas devueltas ....... ${analysis.entries}`);
    console.log(`    con battleTime ........... ${analysis.withBattleTime}`);
    console.log(`    mas antigua .............. ${analysis.oldest ?? 'n/d'}`);
    console.log(`    mas reciente ............. ${analysis.newest ?? 'n/d'}`);
    console.log(`    ventana cubierta ......... ${analysis.spanHours ?? 'n/d'} h`);
    console.log(`    valores de type .......... ${JSON.stringify(analysis.types)}`);
    console.log(`    gameMode.name ............ ${JSON.stringify(analysis.gameModes)}`);
    console.log(`    tamanos de team[] ........ ${analysis.teamSizes.join(', ') || 'n/d'}`);
    console.log(`    claves de la batalla ..... ${analysis.battleKeys.join(', ')}`);
    console.log(`    lados analizados ......... ${analysis.sides.sides}`);
    console.log(`    lados con crowns ......... ${analysis.sides.withCrowns}`);
    console.log(`    lados con cards .......... ${analysis.sides.withCards}`);
    console.log(`    lados con tag ............ ${analysis.sides.withTag}`);
    console.log(`    cartas por mazo .......... ${analysis.sides.cardCounts.join(', ') || 'n/d'}`);
    console.log(`    claves del lado .......... ${analysis.sides.keys.join(', ')}`);
    console.log(`    claves de la carta ....... ${analysis.sides.cardKeys.join(', ')}`);
  }

  console.log(
    [
      '',
      `  Evidencia cruda:  evidence/clash-royale/  (ignorada por git)`,
      `  Fixtures limpias: apps/api/test/fixtures/clash-royale/`,
      '',
      '  Revisa el volcado crudo antes de compartirlo: lleva tags y nombres de',
      '  terceros. Las fixtures ya van seudonimizadas.',
      '',
    ].join('\n'),
  );
}

main().catch((error: unknown) => {
  // Un fallo aqui no debe arrastrar el token a los logs.
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
