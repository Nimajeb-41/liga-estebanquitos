/**
 * Servidor HTTP.
 *
 * Aqui solo se ensambla: seguridad, parseo, manejo de errores, rutas y panel.
 * Ninguna regla de competicion vive en este archivo.
 */

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { LigaDatabase } from '@liga/database/client';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';

import { registerAdminUi } from './admin-ui/routes.ts';
import type { ApiConfig } from './config.ts';
import type { AppContext } from './data/context.ts';
import type { ClashRoyaleClient } from './integrations/clash-royale/client.ts';
import { ClashSyncScheduler } from './integrations/clash-royale/scheduler.ts';
import { toErrorBody } from './errors.ts';
import { createEventBus, createMatchRevisions } from './events.ts';
import { KickClient } from './integrations/kick/client.ts';
import { registerAdminRoutes } from './routes/admin.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerPublicRoutes } from './routes/public.ts';

export interface BuildServerOptions {
  readonly config: ApiConfig;
  readonly db: LigaDatabase;
  /** Reloj inyectable: los tests necesitan controlar los plazos. */
  readonly now?: () => Date;
  /**
   * Cliente de Clash Royale inyectable. Sin pasar nada, el servicio lo
   * construye con el token de la configuracion.
   */
  readonly clashRoyaleClient?: ClashRoyaleClient;
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const { config } = options;

  /*
    Los eventos se crean antes que el contexto porque los servicios los reciben
    por el, y antes que el servidor porque el registro se engancha en cuanto hay
    logger. Un suscriptor roto nunca tumba la operacion que lo disparo.
  */
  /*
    Cliente de Kick, uno por servidor.

    Lleva caché y cortafuegos dentro, así que crear uno por petición anularía
    las dos cosas y convertiría cada visita a la portada en una llamada a un
    servicio de terceros.
  */
  const kick = config.broadcast.enabled
    ? new KickClient({
        slug: config.broadcast.channelSlug,
        baseUrl: config.broadcast.baseUrl,
        timeoutMs: config.broadcast.timeoutMs,
        cacheSeconds: config.broadcast.cacheSeconds,
        now: options.now ?? (() => new Date()),
      })
    : undefined;

  const events = createEventBus();
  const revisions = createMatchRevisions();
  revisions.subscribe(events);

  const ctx: AppContext = {
    events,
    ...(kick === undefined ? {} : { kick }),
    db: options.db,
    config,
    now: options.now ?? (() => new Date()),
    ...(options.clashRoyaleClient === undefined
      ? {}
      : { clashRoyaleClient: options.clashRoyaleClient }),
  };

  const app = Fastify({
    logger:
      config.nodeEnv === 'test'
        ? false
        : {
            level: config.nodeEnv === 'production' ? 'info' : 'debug',
            // Nunca registrar cookies ni cabeceras de autorizacion.
            redact: ['req.headers.cookie', 'req.headers.authorization'],
          },
    genReqId: () => crypto.randomUUID(),
    trustProxy: config.nodeEnv === 'production',
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // El panel no usa JavaScript ni estilos en linea: todo va en un CSS
        // servido desde el propio origen.
        scriptSrc: ["'none'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? [...config.corsOrigins] : false,
    credentials: true,
  });

  await app.register(cookie);
  await app.register(formbody);

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
  });

  app.setErrorHandler((error, request, reply) => {
    const { status, body } = toErrorBody(error, String(request.id));
    if (status >= 500) {
      request.log.error({ err: error }, 'error no controlado');
    } else {
      request.log.info({ code: body.error.code, status }, 'peticion rechazada');
    }
    reply.code(status).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: { code: 'NOT_FOUND', message: `No existe la ruta ${request.url}.` },
      requestId: String(request.id),
    });
  });

  /**
   * Sincronizacion automatica.
   *
   * Se construye siempre —para poder responder por su estado— pero solo
   * arranca si la configuracion lo pide, que por defecto no lo hace. Se para
   * al cerrar el servidor: un temporizador huerfano mantendria vivo el proceso
   * y seguiria pidiendo datos despues del apagado.
   */
  /*
    Registro de eventos.

    Va aqui y no en el bus porque necesita el logger de Fastify. Solo salen
    identificadores y estados: ningun evento lleva secretos, y este suscriptor
    tampoco los inventaria.
  */
  events.on((event) => {
    app.log.info({ leagueEvent: event }, 'evento de competicion');
  });

  app.decorate('matchRevisions', revisions);

  const scheduler = new ClashSyncScheduler(ctx);
  scheduler.start();
  app.addHook('onClose', async () => scheduler.stop());
  app.decorate('clashSyncScheduler', scheduler);

  /**
   * Estado del servicio.
   *
   * Dice **si** hay integracion y **si** hay base de datos configurada, nunca
   * con que credenciales. El token no aparece aqui ni en ninguna otra
   * respuesta: `/health` es publica y es justo el sitio donde un secreto se
   * filtraria sin que nadie se diera cuenta.
   */
  app.get('/health', async () => ({
    status: 'ok',
    service: 'liga-estabanquitos-api',
    environment: config.nodeEnv,
    database: config.databaseUrl === null ? 'not-configured' : 'configured',
    clashRoyale: config.clashRoyale.enabled ? 'enabled' : 'disabled',
    sync: scheduler.status(),
    uptimeSeconds: Math.round(process.uptime()),
  }));

  /**
   * ¿Puede atender trafico?
   *
   * `/health` dice que el proceso vive; esto dice que **sirve**. La diferencia
   * importa en un despliegue: un proceso arrancado pero sin base de datos
   * responde a lo primero y no debe recibir peticiones.
   */
  app.get('/readiness', async (_request, reply) => {
    const started = Date.now();
    let database: 'ok' | 'unreachable' = 'ok';
    try {
      await options.db.execute(sql`select 1`);
    } catch {
      database = 'unreachable';
    }

    const ready = database === 'ok';
    reply.code(ready ? 200 : 503);
    return {
      status: ready ? 'ready' : 'not-ready',
      database,
      latencyMs: Date.now() - started,
      // La integracion externa **no** decide si el servicio esta listo: la liga
      // funciona entera sin Clash Royale, que solo aporta evidencia.
      clashRoyale: config.clashRoyale.enabled ? 'enabled' : 'disabled',
    };
  });

  registerPublicRoutes(app, ctx);
  registerAuthRoutes(app, ctx);
  registerAdminRoutes(app, ctx);
  await registerAdminUi(app, ctx);

  return app;
}
