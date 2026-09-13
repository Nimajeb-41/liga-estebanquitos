/**
 * Aleatoriedad reproducible.
 *
 * El sorteo del fixture tiene que poder repetirse: guardamos la semilla y
 * cualquiera puede regenerar el mismo calendario. `Math.random` no sirve para
 * eso, asi que usamos un generador propio y determinista (mulberry32 sobre un
 * hash cyrb128 de la semilla en texto).
 */

/** Hash de 32 bits de una cadena, usado como estado inicial del PRNG. */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Devuelve una funcion que produce numeros en [0, 1) de forma determinista. */
export function createRandom(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates con el PRNG proporcionado. No muta la entrada. */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/**
 * Semilla legible para un sorteo nuevo. Se guarda junto al fixture.
 * Formato: `<marca de tiempo ISO>-<sufijo aleatorio>`.
 */
export function createSeed(now: Date = new Date()): string {
  const suffix = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  return `${now.toISOString()}-${suffix}`;
}
