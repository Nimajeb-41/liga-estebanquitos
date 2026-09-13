/**
 * Eventos internos de la competicion.
 *
 * No es lo mismo que la auditoria, y la diferencia importa:
 *
 *   AUDITORIA  Quien hizo que, cuando y con que datos. Se guarda en la base,
 *              es permanente y responde ante el reglamento. Si se pierde una
 *              entrada, hay un problema.
 *
 *   EVENTOS    Que ha pasado en la competicion, para que otras partes del
 *              sistema puedan reaccionar. Vive en memoria, no se guarda, y su
 *              perdida no rompe nada: el estado real sigue en la base.
 *
 * Existe para que registrar un resultado no tenga que saber quien mas se entera.
 * Hoy se enteran el registro estructurado y el contador de revisiones que usa el
 * sondeo en directo; manana podria enterarse un aviso al streamer sin tocar
 * `recordResult`.
 *
 * Tres reglas que no se negocian:
 *
 * - **Un suscriptor que falla no tumba la operacion.** El resultado ya esta
 *   escrito; que un oyente se equivoque no puede deshacerlo. Se registra el
 *   fallo y se sigue.
 * - **Sincrono y en proceso.** Nada de colas ni reintentos: una liga de diez
 *   personas no los necesita, y la complejidad se paga siempre.
 * - **Nunca viajan secretos.** Un evento lleva identificadores y estados, no
 *   tokens, cabeceras ni credenciales.
 */

/** Lo que puede pasar en la competicion. El codigo es estable. */
export type LeagueEventType =
  | 'MATCH_STATUS_CHANGED'
  | 'MATCH_RESULT_RECORDED'
  | 'MATCH_SCHEDULED'
  | 'SEASON_FINISHED'
  | 'SETTINGS_UPDATED';

interface BaseEvent {
  readonly at: string;
  readonly tournamentId: string;
}

export type LeagueEvent = BaseEvent &
  (
    | { readonly type: 'MATCH_STATUS_CHANGED'; readonly matchId: string; readonly status: string }
    | {
        readonly type: 'MATCH_RESULT_RECORDED';
        readonly matchId: string;
        /** `true` cuando corrige uno anterior; la tabla cambia hacia atras. */
        readonly correction: boolean;
      }
    | { readonly type: 'MATCH_SCHEDULED'; readonly matchId: string }
    | { readonly type: 'SEASON_FINISHED' }
    | {
        readonly type: 'SETTINGS_UPDATED';
        /** Si el cambio reescribe la clasificacion ya publicada. */
        readonly recalculatesStandings: boolean;
      }
  );

export type LeagueEventListener = (event: LeagueEvent) => void;

export interface EventBus {
  readonly emit: (event: LeagueEvent) => void;
  readonly on: (listener: LeagueEventListener) => () => void;
}

export interface EventBusOptions {
  /** Donde se avisa de un suscriptor roto. Por defecto, la consola. */
  readonly onListenerError?: (error: unknown, event: LeagueEvent) => void;
}

export function createEventBus(options: EventBusOptions = {}): EventBus {
  const listeners = new Set<LeagueEventListener>();

  return {
    emit(event) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          /*
            El fallo de un oyente no puede propagarse: la operacion que provoco
            el evento ya termino y es valida. Avisar y seguir es lo unico
            correcto aqui.
          */
          if (options.onListenerError === undefined) {
            console.error('[eventos] un suscriptor falló', { type: event.type, error });
          } else {
            options.onListenerError(error, event);
          }
        }
      }
    },

    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Revisiones de partido                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Un contador por partido que sube cada vez que algo suyo cambia.
 *
 * Lo usa el sondeo en directo: con la revision, el navegador sabe si hay algo
 * nuevo sin comparar el partido entero, y el overlay no se repinta cuando no ha
 * pasado nada.
 *
 * Vive en memoria a proposito. Si el proceso se reinicia, los contadores vuelven
 * a empezar y el unico efecto es que los clientes se refrescan una vez de mas:
 * no se pierde ningun dato, porque aqui no hay ninguno que perder.
 */
export interface MatchRevisions {
  readonly get: (matchId: string) => number;
  readonly subscribe: (bus: EventBus) => () => void;
}

export function createMatchRevisions(): MatchRevisions {
  const revisions = new Map<string, number>();

  const bump = (matchId: string): void => {
    revisions.set(matchId, (revisions.get(matchId) ?? 0) + 1);
  };

  return {
    get: (matchId) => revisions.get(matchId) ?? 0,
    subscribe: (bus) =>
      bus.on((event) => {
        if ('matchId' in event) bump(event.matchId);
      }),
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Revisiones por partido. Las lee el sondeo en directo. */
    readonly matchRevisions: MatchRevisions;
  }
}
