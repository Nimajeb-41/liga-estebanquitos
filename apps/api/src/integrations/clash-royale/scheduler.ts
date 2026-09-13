/**
 * Sincronizacion automatica del historial de batallas.
 *
 * Apagada por defecto, y no por prudencia generica: **no sabemos cada cuanto
 * hay que sincronizar**. El historial de Clash Royale se vacia solo, y del
 * spike solo salio una cota inferior de retencion (>= 41,4 h); la superior
 * sigue sin medir. Encender esto con un intervalo inventado seria fingir que
 * conocemos un numero que no conocemos.
 *
 * Cuando se encienda, lo que hace es deliberadamente poco:
 *
 * - Consulta **unos pocos** participantes por vuelta, empezando por los que
 *   llevan mas tiempo sin consultarse. La API oficial no publica sus limites de
 *   peticiones y el spike no los midio: se prefiere tardar dos horas en dar la
 *   vuelta a la plantilla antes que arriesgar un bloqueo a mitad de temporada.
 * - **No confirma nada.** Igual que la sincronizacion manual, deja candidatos
 *   en la cola de revision. Ningun resultado oficial sale de aqui.
 * - Se corta sola si la API falla varias veces seguidas. Un token caducado o
 *   una IP que cambio —que es lo que paso durante el desarrollo de la Fase 3—
 *   producirian si no un 403 por jugador y por vuelta, indefinidamente.
 *
 * El cortacircuitos vive en memoria. Es lo correcto para lo que protege: si el
 * proceso se reinicia, lo sensato es volver a probar una vez, no heredar un
 * bloqueo de la encarnacion anterior.
 */

import { schema } from '@liga/database';
import { and, asc, eq, isNotNull } from 'drizzle-orm';

import type { AppContext } from '../../data/context.ts';
import { requireTournament } from '../../data/tournament.ts';
import { syncPlayerBattlelog } from '../../services/clash-royale.ts';

declare module 'fastify' {
  interface FastifyInstance {
    /** El planificador de esta instancia. Los tests lo usan para no esperar. */
    readonly clashSyncScheduler: ClashSyncScheduler;
  }
}

export type BreakerState = 'CLOSED' | 'OPEN';

export interface SchedulerStatus {
  readonly enabled: boolean;
  readonly running: boolean;
  readonly intervalMinutes: number;
  readonly maxPlayersPerRun: number;
  readonly breaker: BreakerState;
  readonly consecutiveFailures: number;
  /** Cuando el cortacircuitos vuelve a dejar pasar. `null` si esta cerrado. */
  readonly openUntil: string | null;
  readonly lastRunAt: string | null;
  readonly lastRun: RunReport | null;
}

export interface RunReport {
  readonly startedAt: string;
  readonly players: number;
  readonly imported: number;
  readonly candidatesCreated: number;
  readonly failures: number;
  /**
   * Motivos de fallo, sin detalle tecnico ni nada del token: solo el codigo,
   * que es lo que sirve para diagnosticar (`CLASH_ACCESS_DENIED` casi siempre
   * es la IP).
   */
  readonly failureCodes: readonly string[];
  /** `true` si la vuelta no llego a ejecutarse por el cortacircuitos. */
  readonly skipped: boolean;
}

interface Failure {
  readonly code: string;
}

/** El codigo de un error de la API, sin arrastrar mensajes ni detalles. */
function codeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as Failure).code;
    if (typeof code === 'string') return code;
  }
  return 'UNKNOWN';
}

export class ClashSyncScheduler {
  readonly #ctx: AppContext;
  #timer: ReturnType<typeof setInterval> | null = null;
  #failures = 0;
  #openUntil: Date | null = null;
  #lastRun: RunReport | null = null;
  #inFlight = false;

  constructor(ctx: AppContext) {
    this.#ctx = ctx;
  }

  get #config() {
    return this.#ctx.config.clashRoyale.sync;
  }

  status(): SchedulerStatus {
    return {
      enabled: this.#config.enabled,
      running: this.#timer !== null,
      intervalMinutes: this.#config.intervalMinutes,
      maxPlayersPerRun: this.#config.maxPlayersPerRun,
      breaker: this.#breakerState(),
      consecutiveFailures: this.#failures,
      openUntil: this.#openUntil?.toISOString() ?? null,
      lastRunAt: this.#lastRun?.startedAt ?? null,
      lastRun: this.#lastRun,
    };
  }

  #breakerState(): BreakerState {
    if (this.#openUntil === null) return 'CLOSED';
    return this.#openUntil > this.#ctx.now() ? 'OPEN' : 'CLOSED';
  }

  /**
   * Arranca el temporizador si la configuracion lo pide.
   *
   * `unref()` para que un proceso que solo tenia este temporizador pendiente
   * pueda terminar: un script de un solo uso no debe quedarse vivo por esto.
   */
  start(): void {
    if (!this.#config.enabled || this.#timer !== null) return;
    this.#timer = setInterval(() => void this.runOnce(), this.#config.intervalMinutes * 60_000);
    this.#timer.unref?.();
  }

  stop(): void {
    if (this.#timer === null) return;
    clearInterval(this.#timer);
    this.#timer = null;
  }

  /**
   * Una vuelta.
   *
   * Publico para poder probarlo sin esperar al temporizador, y para poder
   * lanzarlo a mano desde un script.
   */
  async runOnce(): Promise<RunReport> {
    const startedAt = this.#ctx.now();

    // Dos vueltas solapadas duplicarian las peticiones sin ganar nada: si la
    // anterior sigue corriendo, esta se salta.
    if (this.#inFlight || this.#breakerState() === 'OPEN') {
      const report: RunReport = {
        startedAt: startedAt.toISOString(),
        players: 0,
        imported: 0,
        candidatesCreated: 0,
        failures: 0,
        failureCodes: [],
        skipped: true,
      };
      this.#lastRun = report;
      return report;
    }

    this.#inFlight = true;
    try {
      const players = await this.#nextPlayers();

      let imported = 0;
      let candidatesCreated = 0;
      const failureCodes: string[] = [];

      for (const player of players) {
        try {
          // `null` como actor: lo hizo el sistema, y la auditoria lo dice tal
          // cual en vez de atribuirselo a una persona que no estaba.
          const result = await syncPlayerBattlelog(this.#ctx, null, player.id);
          imported += result.imported;
          candidatesCreated += result.candidatesCreated;
          this.#failures = 0;
        } catch (error) {
          failureCodes.push(codeOf(error));
          this.#recordFailure();
          // Si el cortacircuitos salta a mitad de vuelta, no se insiste con el
          // resto: el fallo casi nunca es de un jugador concreto.
          if (this.#breakerState() === 'OPEN') break;
        }
      }

      const report: RunReport = {
        startedAt: startedAt.toISOString(),
        players: players.length,
        imported,
        candidatesCreated,
        failures: failureCodes.length,
        failureCodes,
        skipped: false,
      };
      this.#lastRun = report;
      return report;
    } finally {
      this.#inFlight = false;
    }
  }

  #recordFailure(): void {
    this.#failures += 1;
    const { failureThreshold, cooldownMinutes } = this.#ctx.config.clashRoyale.sync.circuitBreaker;
    if (this.#failures >= failureThreshold) {
      this.#openUntil = new Date(this.#ctx.now().getTime() + cooldownMinutes * 60_000);
    }
  }

  /** Los participantes vinculados que llevan mas tiempo sin consultarse. */
  async #nextPlayers(): Promise<{ id: string }[]> {
    const { tournament } = await requireTournament(this.#ctx.db, this.#ctx.config.tournamentSlug);

    return (
      this.#ctx.db
        .select({ id: schema.players.id })
        .from(schema.players)
        .where(
          and(eq(schema.players.tournamentId, tournament.id), isNotNull(schema.players.clashTag)),
        )
        // `nulls first`: quien nunca se ha sincronizado va antes que nadie.
        .orderBy(asc(schema.players.clashSyncedAt))
        .limit(this.#config.maxPlayersPerRun)
    );
  }
}
