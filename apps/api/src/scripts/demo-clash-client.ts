/**
 * Cliente de Clash Royale para el servidor de demostracion.
 *
 * Devuelve las fixtures del spike en lugar de llamar a Supercell. Existe por
 * dos razones, y las dos importan:
 *
 * 1. **La demo no debe depender de nada externo.** Su gracia es arrancar sin
 *    Docker, sin base de datos y sin credenciales.
 * 2. **El token esta ligado a una IP.** En una conexion domestica esa IP cambia
 *    sola: durante el desarrollo de esta fase cambio de `.101` a `.208` en unas
 *    horas y el token dejo de valer. Una demo que se rompe por eso no sirve.
 *
 * Los datos son los de una batalla real, con las etiquetas y los nombres
 * seudonimizados, y las etiquetas se reasignan a los participantes de la propia
 * demostracion. No son resultados oficiales de nada.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ClashRoyaleClient } from '../integrations/clash-royale/client.ts';
import type { ClashBattle } from '../integrations/clash-royale/types.ts';

/**
 * Relativo a este modulo, no al directorio de trabajo.
 *
 * `npm run demo` desde la raiz y `npm run demo --workspace=@liga/api` arrancan
 * con `cwd` distintos, y con una ruta basada en `process.cwd()` uno de los dos
 * siempre falla. Este archivo esta en `apps/api/src/scripts/`, asi que las
 * fixtures estan tres niveles arriba.
 */
const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'test',
  'fixtures',
  'clash-royale',
);

const load = <T>(name: string): T =>
  JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8')) as T;

/** Etiquetas inventadas para la demostracion. No son de nadie. */
export const DEMO_TAGS = ['#DEMO0001', '#DEMO0002', '#DEMO0003', '#DEMO0004'] as const;

/** Reescribe la batalla de la fixture con otras identidades y otra hora. */
function reassign(
  battle: ClashBattle,
  homeTag: string,
  awayTag: string,
  when: Date,
  crowns: readonly [number, number],
): ClashBattle {
  const stamp = when
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, '.000Z');
  const side = (source: unknown, tag: string, value: number): Record<string, unknown> => ({
    ...(source as Record<string, unknown>),
    tag,
    name: `Cuenta ${tag.slice(-4)}`,
    crowns: value,
  });

  return {
    ...battle,
    battleTime: stamp,
    team: [side(battle.team?.[0], homeTag, crowns[0])] as never,
    opponent: [side(battle.opponent?.[0], awayTag, crowns[1])] as never,
  };
}

/**
 * Cliente de demostracion.
 *
 * Cumple el mismo contrato que el real, asi que el servicio no sabe —ni le
 * importa— que no esta hablando con Supercell.
 */
export function createDemoClashClient(now: Date): ClashRoyaleClient {
  const template = load<ClashBattle>('friendly-battle.json');
  const catalogue = load<{ items: unknown[] }>('cards.json');

  // Dos enfrentamientos: uno limpio y otro que se aparta por empate de coronas,
  // para que la cola de revision tenga los dos casos que un administrador va a
  // encontrarse de verdad.
  const battles: Record<string, ClashBattle[]> = {
    [DEMO_TAGS[0]]: [
      reassign(template, DEMO_TAGS[0], DEMO_TAGS[1], new Date(now.getTime() - 3_600_000), [3, 1]),
    ],
    [DEMO_TAGS[1]]: [
      reassign(template, DEMO_TAGS[1], DEMO_TAGS[0], new Date(now.getTime() - 3_600_000), [1, 3]),
    ],
    [DEMO_TAGS[2]]: [
      reassign(template, DEMO_TAGS[2], DEMO_TAGS[3], new Date(now.getTime() - 7_200_000), [2, 2]),
    ],
    [DEMO_TAGS[3]]: [],
  };

  return {
    async getPlayer(tag: string) {
      return { tag, name: `Cuenta ${tag.slice(-4)}` };
    },
    async getBattleLog(tag: string) {
      return battles[tag] ?? [];
    },
    async getCards() {
      return {
        cards: catalogue.items,
        supportCards: [{ id: 159000000, name: 'Tower Princess', rarity: 'common', maxLevel: 16 }],
      };
    },
  } as unknown as ClashRoyaleClient;
}
