/**
 * @liga/domain — motor de competicion de la Liga Estabanquitos 2026-1.
 *
 * Paquete puro: sin acceso a base de datos, sin HTTP, sin dependencias de
 * runtime. Todo lo que decide "quien va primero" vive aqui y esta cubierto por
 * tests.
 */

export * from './errors.ts';
export * from './tournament/index.ts';
export * from './roster/index.ts';
export * from './matches/index.ts';
export * from './fixture/index.ts';
export * from './results/index.ts';
export * from './scoring/index.ts';
export * from './sanctions/index.ts';
export * from './standings/index.ts';
export * from './statistics/index.ts';
export * from './labels/index.ts';
