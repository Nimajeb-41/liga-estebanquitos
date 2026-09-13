/**
 * Configuracion por entorno.
 *
 * Todo secreto entra por variable de entorno y se queda en el backend. La API
 * key de Clash Royale no viaja jamas al navegador: el frontend habla con esta
 * API, y esta API habla con Supercell.
 */

export interface ApiConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string | null;
  /** Torneo que sirve esta instancia. */
  readonly tournamentSlug: string;
  readonly session: {
    /** Duracion de la sesion administrativa. */
    readonly ttlHours: number;
    /** `secure` en la cookie: obligatorio en produccion. */
    readonly secureCookie: boolean;
  };
  /** Origenes permitidos por CORS. Vacio = solo mismo origen. */
  readonly corsOrigins: readonly string[];
  readonly clashRoyale: {
    /**
     * Si la integracion esta activa. Sin token no lo esta, aunque se pida:
     * arrancar con la integracion encendida y sin credencial solo produciria
     * un 403 por cada peticion.
     */
    readonly enabled: boolean;
    readonly baseUrl: string;
    /**
     * El token del portal.
     *
     * **Nunca sale del backend.** No se registra, no se serializa en ninguna
     * respuesta y no aparece en `/health`, que solo dice si esta configurado.
     * Es `null` cuando no hay ninguno.
     */
    readonly token: string | null;
    readonly timeoutMs: number;
    readonly maxRetries: number;
    readonly matching: {
      /**
       * Margen alrededor de la hora prevista dentro del cual una batalla se
       * considera creible para ese partido.
       *
       * No sale de ninguna medicion: el spike no midio esto. Es un valor de
       * operacion, para ajustar cuando haya jornadas jugadas.
       */
      readonly timeWindowMinutes: number;
    };
    readonly sync: {
      /**
       * Sincronizacion automatica. Apagada por defecto **a proposito**: la
       * frecuencia adecuada depende de la retencion real del historial, que
       * solo se conoce por su cota inferior (>= 41,4 h). Hasta repetir la
       * medicion, la sincronizacion se lanza a mano.
       */
      readonly enabled: boolean;
      readonly intervalMinutes: number;
      /**
       * Cuantos participantes se consultan por vuelta.
       *
       * La API oficial no publica sus limites de peticiones y el spike no los
       * midio, asi que el valor por defecto es deliberadamente bajo: se
       * prefiere tardar en recorrer la plantilla a que Supercell corte el
       * acceso a mitad de temporada.
       */
      readonly maxPlayersPerRun: number;
      /**
       * Corta la sincronizacion cuando la API falla repetidamente.
       *
       * Sin esto, un token caducado o una IP que cambio producirian un 403 por
       * jugador y por vuelta, para siempre: ruido en los registros y un
       * castigo gratuito al servicio del otro lado.
       */
      readonly circuitBreaker: {
        readonly failureThreshold: number;
        readonly cooldownMinutes: number;
      };
    };
  };
  /**
   * Retransmision.
   *
   * El canal donde se narra la liga y si se comprueba su estado en vivo. La API
   * publica de Kick **no esta documentada oficialmente**, asi que la
   * comprobacion se puede apagar: sin ella el sitio sigue funcionando, solo que
   * el aviso de directo no se enciende solo.
   */
  readonly broadcast: {
    readonly enabled: boolean;
    readonly channelSlug: string;
    readonly channelUrl: string;
    readonly channelName: string;
    readonly baseUrl: string;
    readonly timeoutMs: number;
    /** Cuanto vale una respuesta antes de volver a preguntar a Kick. */
    readonly cacheSeconds: number;
  };
}

export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Configuracion invalida:\n- ${problems.join('\n- ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

function parseInteger(
  value: string | undefined,
  fallback: number,
  field: string,
  problems: string[],
  min: number,
  max: number,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    problems.push(`${field} debe ser un entero entre ${min} y ${max}; se recibio "${value}".`);
    return fallback;
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const problems: string[] = [];

  const nodeEnvRaw = env['NODE_ENV'] ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnvRaw)) {
    problems.push(`NODE_ENV debe ser development, test o production; se recibio "${nodeEnvRaw}".`);
  }
  const nodeEnv = nodeEnvRaw as ApiConfig['nodeEnv'];

  const port = parseInteger(env['API_PORT'], 3000, 'API_PORT', problems, 1, 65535);
  const ttlHours = parseInteger(
    env['SESSION_TTL_HOURS'],
    12,
    'SESSION_TTL_HOURS',
    problems,
    1,
    720,
  );
  const databaseUrl = env['DATABASE_URL'] ?? null;

  if (nodeEnv === 'production' && databaseUrl === null) {
    problems.push('DATABASE_URL es obligatoria en produccion.');
  }

  const corsOrigins = (env['CORS_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (nodeEnv === 'production' && corsOrigins.includes('*')) {
    problems.push('CORS_ORIGINS no puede ser "*" en produccion.');
  }

  /*
    La configuracion de Clash Royale se resuelve **antes** de comprobar los
    problemas.

    Estaba al reves: sus `parseInteger` corrian dentro del objeto devuelto, es
    decir despues del `throw`, asi que un `CLASH_ROYALE_TIMEOUT_MS=abc` se
    tragaba en silencio y el servidor arrancaba con el valor por defecto sin
    decir nada. Una variable de entorno mal escrita tiene que impedir el
    arranque, no cambiar el comportamiento a escondidas.
  */
  const clashRoyale = resolveClashRoyale(env, problems);

  if (problems.length > 0) throw new ConfigError(problems);

  return {
    nodeEnv,
    host: env['API_HOST'] ?? '127.0.0.1',
    port,
    databaseUrl,
    tournamentSlug: env['TOURNAMENT_SLUG'] ?? 'liga-estabanquitos-2026-1',
    session: {
      ttlHours,
      secureCookie: nodeEnv === 'production',
    },
    corsOrigins,
    clashRoyale,
    broadcast: resolveBroadcast(env, problems),
  };
}

/**
 * Canal de retransmision.
 *
 * Por defecto **activado**: el sitio publica un aviso de directo y esa es la
 * unica forma de que sea cierto. Se apaga con `BROADCAST_CHECK_ENABLED=false`
 * si Kick empieza a dar problemas.
 */
function resolveBroadcast(env: NodeJS.ProcessEnv, problems: string[]): ApiConfig['broadcast'] {
  const slug = (env['BROADCAST_CHANNEL_SLUG'] ?? 'esstebannpluss').trim();
  const wanted = (env['BROADCAST_CHECK_ENABLED'] ?? '').trim().toLowerCase();
  const enabled = wanted === '' ? true : wanted === 'true' || wanted === '1';

  if (enabled && slug === '') {
    problems.push('BROADCAST_CHECK_ENABLED activo exige BROADCAST_CHANNEL_SLUG.');
  }

  return {
    enabled,
    channelSlug: slug,
    channelUrl: env['BROADCAST_CHANNEL_URL'] ?? `https://kick.com/${slug}`,
    channelName: env['BROADCAST_CHANNEL_NAME'] ?? 'EsstebannPluss',
    baseUrl: env['BROADCAST_API_BASE_URL'] ?? 'https://kick.com/api/v2/channels',
    timeoutMs: parseInteger(
      env['BROADCAST_TIMEOUT_MS'],
      6000,
      'BROADCAST_TIMEOUT_MS',
      problems,
      1000,
      30_000,
    ),
    cacheSeconds: parseInteger(
      env['BROADCAST_CACHE_SECONDS'],
      45,
      'BROADCAST_CACHE_SECONDS',
      problems,
      5,
      600,
    ),
  };
}

function resolveClashRoyale(env: NodeJS.ProcessEnv, problems: string[]): ApiConfig['clashRoyale'] {
  const token = (env['CLASH_ROYALE_API_TOKEN'] ?? '').trim();
  const wanted = (env['CLASH_ROYALE_ENABLED'] ?? '').trim().toLowerCase();
  const requested = wanted === '' ? true : wanted === 'true' || wanted === '1';

  const syncEnabled = (env['CLASH_ROYALE_SYNC_ENABLED'] ?? '').trim().toLowerCase() === 'true';
  const enabled = requested && token.length > 0;

  // Pedir sincronizacion automatica sin integracion es una contradiccion, y
  // callarsela dejaria a alguien esperando datos que no van a llegar.
  if (syncEnabled && !enabled) {
    problems.push(
      'CLASH_ROYALE_SYNC_ENABLED=true exige la integracion activa: hace falta CLASH_ROYALE_API_TOKEN y no desactivar CLASH_ROYALE_ENABLED.',
    );
  }

  return {
    // Sin token no hay integracion, se pida o no.
    enabled,
    baseUrl: env['CLASH_ROYALE_API_BASE_URL'] ?? 'https://api.clashroyale.com/v1',
    token: token.length > 0 ? token : null,
    timeoutMs: parseInteger(
      env['CLASH_ROYALE_TIMEOUT_MS'],
      8000,
      'CLASH_ROYALE_TIMEOUT_MS',
      problems,
      1000,
      60_000,
    ),
    maxRetries: parseInteger(
      env['CLASH_ROYALE_MAX_RETRIES'],
      3,
      'CLASH_ROYALE_MAX_RETRIES',
      problems,
      0,
      10,
    ),
    matching: {
      timeWindowMinutes: parseInteger(
        env['CLASH_ROYALE_MATCH_WINDOW_MINUTES'],
        180,
        'CLASH_ROYALE_MATCH_WINDOW_MINUTES',
        problems,
        1,
        10_080,
      ),
    },
    sync: {
      enabled: syncEnabled,
      intervalMinutes: parseInteger(
        env['CLASH_ROYALE_SYNC_INTERVAL_MINUTES'],
        60,
        'CLASH_ROYALE_SYNC_INTERVAL_MINUTES',
        problems,
        5,
        1440,
      ),
      maxPlayersPerRun: parseInteger(
        env['CLASH_ROYALE_SYNC_MAX_PLAYERS'],
        3,
        'CLASH_ROYALE_SYNC_MAX_PLAYERS',
        problems,
        1,
        50,
      ),
      circuitBreaker: {
        failureThreshold: parseInteger(
          env['CLASH_ROYALE_BREAKER_FAILURES'],
          3,
          'CLASH_ROYALE_BREAKER_FAILURES',
          problems,
          1,
          20,
        ),
        cooldownMinutes: parseInteger(
          env['CLASH_ROYALE_BREAKER_COOLDOWN_MINUTES'],
          15,
          'CLASH_ROYALE_BREAKER_COOLDOWN_MINUTES',
          problems,
          1,
          1440,
        ),
      },
    },
  };
}
