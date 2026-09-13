/**
 * Contrasenas de administracion.
 *
 * Argon2id con los parametros recomendados por OWASP (19 MiB de memoria, 2
 * iteraciones, paralelismo 1). Nunca se guarda ni se registra la contrasena en
 * claro, y la verificacion es de tiempo constante.
 */

import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id es el algoritmo por defecto de @node-rs/argon2; no se importa su
 * enum porque es un `const enum` y este proyecto compila con
 * `verbatimModuleSyntax`. Los parametros son los recomendados por OWASP.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const MIN_PASSWORD_LENGTH = 12;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contrasena debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  return hash(password, OPTIONS);
}

export async function verifyPassword(digest: string, password: string): Promise<boolean> {
  try {
    return await verify(digest, password, OPTIONS);
  } catch {
    // Un hash corrupto o de otro algoritmo no debe tumbar el login: es un
    // intento fallido mas.
    return false;
  }
}
