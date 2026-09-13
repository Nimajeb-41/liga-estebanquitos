/**
 * Utilidades para los tests de integracion.
 *
 * Cada suite levanta un PostgreSQL real (PGlite), aplica las migraciones,
 * siembra el torneo y arranca la API completa. No hay mocks: se prueba lo que
 * se despliega.
 */

import { createTestDatabase } from '@liga/database/testing';
import type { LigaDatabase } from '@liga/database/client';
import type { FastifyInstance } from 'fastify';

import { loadConfig, type ApiConfig } from '../src/config.ts';
import type { ClashRoyaleClient } from '../src/integrations/clash-royale/client.ts';
import { seed } from '../src/scripts/seed.ts';
import { buildServer } from '../src/server.ts';

export const ADMIN_EMAIL = 'admin@liga.test';
export const ADMIN_PASSWORD = 'contrasena-de-prueba-larga';

export interface TestApp {
  readonly app: FastifyInstance;
  readonly db: LigaDatabase;
  readonly config: ApiConfig;
  readonly tournamentId: string;
  readonly adminId: string;
  /** Cookie de sesion del administrador ya autenticado. */
  readonly cookie: string;
  /** Reloj controlable: los plazos se prueban sin esperar. */
  readonly clock: { current: Date };
  readonly close: () => Promise<void>;
}

export async function createTestApp(
  options: {
    withTestPlayers?: boolean;
    clashRoyaleClient?: ClashRoyaleClient;
    /**
     * Variables de entorno extra para esta instancia.
     *
     * Sirve para montar escenarios que dependen de la configuracion —una
     * integracion activa con token, por ejemplo— sin tocar el entorno del
     * proceso, que compartirian todas las suites.
     */
    config?: Record<string, string>;
  } = {},
): Promise<TestApp> {
  const handle = await createTestDatabase();
  const config = loadConfig({
    NODE_ENV: 'test',
    TOURNAMENT_SLUG: 'liga-estabanquitos-2026-1',
    ...options.config,
  });

  const seeded = await seed(handle.db, {
    tournamentSlug: config.tournamentSlug,
    adminEmail: ADMIN_EMAIL,
    adminPassword: ADMIN_PASSWORD,
    ...(options.withTestPlayers === undefined ? {} : { withTestPlayers: options.withTestPlayers }),
  });

  const clock = { current: new Date('2026-10-01T20:00:00.000Z') };
  const app = await buildServer({
    config,
    db: handle.db,
    now: () => clock.current,
    ...(options.clashRoyaleClient === undefined
      ? {}
      : { clashRoyaleClient: options.clashRoyaleClient }),
  });
  await app.ready();

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (login.statusCode !== 200) {
    throw new Error(`No se pudo iniciar sesion en el entorno de test: ${login.body}`);
  }
  const token = login.cookies.find((cookie) => cookie.name === 'liga_admin_session');
  if (token === undefined) throw new Error('El login no devolvio cookie de sesion.');

  return {
    app,
    db: handle.db,
    config,
    tournamentId: seeded.tournamentId,
    adminId: seeded.adminId,
    cookie: `liga_admin_session=${token.value}`,
    clock,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}

/** Peticion autenticada como administrador. */
export function asAdmin(test: TestApp) {
  return {
    get: (url: string) => test.app.inject({ method: 'GET', url, headers: { cookie: test.cookie } }),
    post: (url: string, payload?: unknown) =>
      test.app.inject({
        method: 'POST',
        url,
        headers: { cookie: test.cookie },
        payload: payload ?? {},
      }),
    patch: (url: string, payload?: unknown) =>
      test.app.inject({
        method: 'PATCH',
        url,
        headers: { cookie: test.cookie },
        payload: payload ?? {},
      }),
    delete: (url: string) =>
      test.app.inject({ method: 'DELETE', url, headers: { cookie: test.cookie } }),
  };
}

/** Lleva el torneo hasta LIVE con el calendario generado. */
export async function startCompetition(test: TestApp, seedValue = 'test-seed'): Promise<void> {
  const admin = asAdmin(test);
  const ready = await admin.post('/api/v1/admin/tournament/status', { status: 'READY' });
  if (ready.statusCode !== 200) throw new Error(`No paso a READY: ${ready.body}`);

  const fixture = await admin.post('/api/v1/admin/fixture/generate', { seed: seedValue });
  if (fixture.statusCode !== 200) throw new Error(`No genero fixture: ${fixture.body}`);

  const live = await admin.post('/api/v1/admin/tournament/status', { status: 'LIVE' });
  if (live.statusCode !== 200) throw new Error(`No paso a LIVE: ${live.body}`);
}
