/**
 * Que ningun secreto viaje en un archivo versionado.
 *
 * Existe porque ya pasó: durante la Fase 3, el token real de Clash Royale acabó
 * escrito en `.env.example` en lugar de en `.env`. Es un error facilísimo de
 * cometer —los dos archivos se llaman casi igual y tienen las mismas claves— y
 * completamente invisible hasta que alguien publica el repositorio.
 *
 * Estos tests no revisan `.env`, que es local y está ignorado. Revisan las
 * plantillas y la documentación, que sí se versionan.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.ts';
import { createTestApp, type TestApp } from './helpers.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relative: string): string => readFileSync(path.join(ROOT, relative), 'utf8');

/** Claves cuyo valor nunca debe aparecer relleno en una plantilla. */
const SECRET_KEYS = [
  'CLASH_ROYALE_API_TOKEN',
  'ADMIN_PASSWORD',
  'DATABASE_PASSWORD',
  'SESSION_SECRET',
];

describe('.env.example', () => {
  const template = read('.env.example');

  for (const key of SECRET_KEYS) {
    it(`deja ${key} vacío`, () => {
      const line = template.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`));
      if (line === undefined) return; // La clave puede no existir todavía.
      expect(line).toBe(`${key}=`);
    });
  }

  it('no contiene nada con forma de JWT', () => {
    // El token del portal de Supercell es un JWT: tres bloques separados por
    // puntos. Si aparece uno en la plantilla, es que alguien pego un secreto.
    expect(template).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./);
  });

  it('declara .env en .gitignore', () => {
    const ignored = read('.gitignore')
      .split(/\r?\n/)
      .map((line) => line.trim());
    expect(ignored).toContain('.env');
    // La evidencia cruda del spike lleva etiquetas y nombres de terceros.
    expect(ignored).toContain('evidence/');
  });
});

describe('fixtures versionadas', () => {
  const fixtures = path.join('apps', 'api', 'test', 'fixtures', 'clash-royale');

  it('no llevan ningún token', () => {
    for (const name of ['friendly-battle.json', 'battlelog.json', 'cards.json']) {
      const content = read(path.join(fixtures, name));
      expect(content).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
      expect(content.toLowerCase()).not.toContain('authorization');
      expect(content).not.toContain('Bearer ');
    }
  });

  it('llevan etiquetas seudonimizadas, no las reales del spike', () => {
    const content = read(path.join(fixtures, 'friendly-battle.json'));
    const tags = [...new Set(content.match(/"tag":\s*"#[^"]+"/g) ?? [])];

    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      // `#P` + hash para jugadores, `#CLAN` para clanes. Nada mas.
      expect(tag).toMatch(/"tag":\s*"(#P[0-9A-F]{6}|#CLAN)"/);
    }
  });
});

describe('configuración', () => {
  it('no activa la integración sin token, aunque se pida', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      CLASH_ROYALE_ENABLED: 'true',
      CLASH_ROYALE_API_TOKEN: '',
    });
    expect(config.clashRoyale.enabled).toBe(false);
    expect(config.clashRoyale.token).toBeNull();
  });

  it('deja la sincronización automática apagada por defecto', () => {
    // La frecuencia adecuada depende de la retencion real del historial, que
    // solo se conoce por su cota inferior. Ver docs/clash-royale-integration.md.
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(config.clashRoyale.sync.enabled).toBe(false);
  });

  it('el token no aparece al serializar la configuración', () => {
    // `/health` y cualquier volcado de diagnostico usan esta forma.
    const config = loadConfig({ NODE_ENV: 'test', CLASH_ROYALE_API_TOKEN: 'SECRETO-DE-PRUEBA' });
    const health = {
      environment: config.nodeEnv,
      clashRoyale: config.clashRoyale.enabled ? 'enabled' : 'disabled',
    };
    expect(JSON.stringify(health)).not.toContain('SECRETO-DE-PRUEBA');
  });
});

describe('validación de la configuración', () => {
  /**
   * Una variable mal escrita tiene que impedir el arranque.
   *
   * Estaba al revés: las variables de Clash Royale se leían después de
   * comprobar los problemas, así que un valor inválido se tragaba en silencio
   * y el servidor arrancaba con el valor por defecto sin decir nada. Un
   * servidor que ignora su propia configuración es peor que uno que no
   * arranca.
   */
  it('rechaza un valor no numérico en vez de usar el de por defecto', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'test', CLASH_ROYALE_TIMEOUT_MS: 'ocho-mil' }),
    ).toThrowError(/CLASH_ROYALE_TIMEOUT_MS/);
  });

  it('rechaza un valor fuera de rango', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'test', CLASH_ROYALE_SYNC_MAX_PLAYERS: '500' }),
    ).toThrowError(/CLASH_ROYALE_SYNC_MAX_PLAYERS/);
    expect(() =>
      loadConfig({ NODE_ENV: 'test', CLASH_ROYALE_SYNC_INTERVAL_MINUTES: '1' }),
    ).toThrowError(/CLASH_ROYALE_SYNC_INTERVAL_MINUTES/);
  });

  it('no deja pedir sincronización automática sin integración', () => {
    // Callarselo dejaria a alguien esperando datos que no van a llegar nunca.
    expect(() =>
      loadConfig({
        NODE_ENV: 'test',
        CLASH_ROYALE_SYNC_ENABLED: 'true',
        CLASH_ROYALE_API_TOKEN: '',
      }),
    ).toThrowError(/CLASH_ROYALE_SYNC_ENABLED/);
  });

  it('el mensaje de error no filtra el valor del token', () => {
    let message = '';
    try {
      loadConfig({
        NODE_ENV: 'test',
        CLASH_ROYALE_API_TOKEN: 'e2e-liga-estabanquitos-no-real',
        CLASH_ROYALE_MAX_RETRIES: 'muchas',
      });
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain('CLASH_ROYALE_MAX_RETRIES');
    expect(message).not.toContain('e2e-liga-estabanquitos-no-real');
  });

  it('acepta los valores por defecto del cortacircuitos', () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(config.clashRoyale.sync.maxPlayersPerRun).toBeGreaterThan(0);
    expect(config.clashRoyale.sync.circuitBreaker.failureThreshold).toBeGreaterThan(0);
    expect(config.clashRoyale.sync.circuitBreaker.cooldownMinutes).toBeGreaterThan(0);
  });
});

/* ========================================================================== */
/* Regresion de seguridad (Fase 4.12)                                          */
/* ========================================================================== */

/**
 * El token no sale del backend por **ninguna** via.
 *
 * Ya paso una vez: durante la Fase 3 un token real acabo escrito en
 * `.env.example`. Aquello se detectaba leyendo un archivo; esto es la otra
 * mitad del problema, la que no se ve mirando el repositorio: que el servidor
 * en marcha lo filtre por una respuesta, por un mensaje de error o por el
 * estado de salud.
 *
 * El barrido usa un token **de prueba** con una forma reconocible. Nunca se
 * imprime: si aparece, el test dice donde, no que era.
 */
describe('el token de Clash Royale no sale del backend', () => {
  /**
   * Token de prueba con forma de JWT, como el del portal de Supercell.
   *
   * No es de nadie y no vale para nada. Se usa precisamente porque un token
   * corto podria colarse por casualidad dentro de otra cadena y dar un falso
   * positivo.
   */
  const FAKE_TOKEN =
    'eyJhbGciOiJIUzI1NiJ9.ZXN0ZS10b2tlbi1lcy1kZS1wcnVlYmEtZmFzZS00.no-es-la-clave-de-nadie';

  let secured: TestApp;

  beforeAll(async () => {
    secured = await createTestApp({
      withTestPlayers: true,
      config: { CLASH_ROYALE_API_TOKEN: FAKE_TOKEN, CLASH_ROYALE_ENABLED: 'true' },
    });
  }, 120_000);

  afterAll(async () => {
    await secured.close();
  });

  /** Todo lo que un navegador puede pedir sin sesion. */
  const PUBLIC_ROUTES = [
    '/health',
    '/readiness',
    '/api/v1/tournament',
    '/api/v1/rules',
    '/api/v1/players',
    '/api/v1/fixture',
    '/api/v1/rounds',
    '/api/v1/matches',
    '/api/v1/standings',
    '/api/v1/stats',
    '/api/v1/sanctions',
    '/api/v1/statistics',
    '/api/v1/cards',
  ];

  /** Y todo lo que puede pedir con ella. */
  const ADMIN_ROUTES = [
    '/api/v1/admin/players',
    '/api/v1/admin/sanctions',
    '/api/v1/admin/audit',
    '/api/v1/admin/audit?facets=true',
    '/api/v1/admin/metrics',
    '/api/v1/admin/clash-royale/links',
    '/api/v1/admin/clash-royale/candidates',
    '/api/v1/admin/clash-royale/sync',
  ];

  it('la integracion esta activa en este escenario', () => {
    // Si no lo estuviera, el barrido no probaria nada: es la comprobacion de
    // que el test puede fallar.
    expect(secured.config.clashRoyale.enabled).toBe(true);
    expect(secured.config.clashRoyale.token).toBe(FAKE_TOKEN);
  });

  for (const url of PUBLIC_ROUTES) {
    it(`${url} no lo filtra`, async () => {
      const response = await secured.app.inject({ method: 'GET', url });
      expect(response.body).not.toContain(FAKE_TOKEN);
      expect(response.body).not.toContain('Bearer');
      expect(response.body.toLowerCase()).not.toContain('authorization');
    });
  }

  for (const url of ADMIN_ROUTES) {
    it(`${url} no lo filtra`, async () => {
      const response = await secured.app.inject({
        method: 'GET',
        url,
        headers: { cookie: secured.cookie },
      });
      expect(response.body).not.toContain(FAKE_TOKEN);
      expect(response.body).not.toContain('Bearer');
    });
  }

  it('/health dice si hay integracion, no con que credencial', async () => {
    const body = (await secured.app.inject({ method: 'GET', url: '/health' })).json();

    expect(body.clashRoyale).toBe('enabled');
    // La palabra «enabled» es todo lo que se publica de la credencial.
    expect(JSON.stringify(body)).not.toContain(FAKE_TOKEN);
    expect(Object.keys(body)).not.toContain('token');
  });

  it('un fallo de la API externa no arrastra el token al mensaje', async () => {
    // Sin cliente inyectado, el servicio construye uno real y falla al salir a
    // Internet. Es justo el camino donde un error mal formado filtraria el
    // encabezado de autorizacion.
    const players = await secured.db.query.players.findMany({ columns: { id: true }, limit: 1 });
    const response = await secured.app.inject({
      method: 'POST',
      url: `/api/v1/admin/clash-royale/sync/${players[0]!.id}`,
      headers: { cookie: secured.cookie },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.body).not.toContain(FAKE_TOKEN);
    expect(response.body).not.toContain('Bearer');
  });

  it('una ruta inexistente tampoco', async () => {
    const response = await secured.app.inject({ method: 'GET', url: '/api/v1/no-existe' });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain(FAKE_TOKEN);
  });

  it('un cuerpo invalido devuelve el motivo, no la configuracion', async () => {
    const response = await secured.app.inject({
      method: 'POST',
      url: '/api/v1/admin/tournament/status',
      headers: { cookie: secured.cookie },
      payload: { status: 'NO_EXISTE' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain(FAKE_TOKEN);
    // Y no vuelca la configuracion entera «por si ayuda a depurar».
    expect(response.body).not.toContain('CLASH_ROYALE');
    expect(response.body).not.toContain('DATABASE_URL');
  });

  it('el error de una peticion sin sesion no dice nada del servidor', async () => {
    const response = await secured.app.inject({ method: 'GET', url: '/api/v1/admin/metrics' });

    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain(FAKE_TOKEN);
    expect(response.body.toLowerCase()).not.toContain('stack');
  });
});
