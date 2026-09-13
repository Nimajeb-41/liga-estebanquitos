/**
 * ¿Hay algo que ver ahora mismo?
 *
 * Junta dos cosas que ninguna basta por sí sola:
 *
 *   KICK      Si el canal está emitiendo y con qué categoría. Lo sabe Kick.
 *   NUESTRA   Qué partidos de la liga están en juego. Lo sabemos nosotros.
 *
 * El aviso de directo solo se enciende cuando **las dos** dicen que sí: el canal
 * emitiendo Clash Royale, y partidos de la liga en curso. Con una sola se
 * mentiría en las dos direcciones: emitir Fortnite no es retransmitir la liga, y
 * un partido marcado en juego mientras el canal está apagado tampoco.
 *
 * Cuando Kick no responde, el estado es `UNKNOWN` y el aviso **no se enciende**.
 * Ante la duda, la web no afirma que hay directo.
 */

import { schema } from '@liga/database';
import { and, eq } from 'drizzle-orm';

import type { AppContext } from '../data/context.ts';
import type { KickClient, KickStatus } from '../integrations/kick/client.ts';

export interface BroadcastMatch {
  readonly id: string;
  readonly roundNumber: number;
  readonly home: string;
  readonly away: string;
}

export interface BroadcastStatus {
  /** Lo único que la interfaz necesita para decidir si enseña el aviso. */
  readonly live: boolean;
  readonly channel: {
    readonly name: string;
    readonly url: string;
    readonly state: KickStatus['state'];
    readonly category: string | null;
    readonly playingClashRoyale: boolean;
    readonly title: string | null;
    readonly startedAt: string | null;
    readonly checkedAt: string;
  };
  /** Partidos de la liga en juego ahora. */
  readonly matches: readonly BroadcastMatch[];
  /**
   * Por qué no se enciende el aviso, cuando no se enciende.
   *
   * Códigos estables; el texto lo pone quien lo muestra.
   */
  readonly reason:
    | 'LIVE'
    | 'CHANNEL_OFFLINE'
    | 'CHANNEL_OTHER_GAME'
    | 'NO_MATCHES_LIVE'
    | 'CHANNEL_UNKNOWN'
    | 'NOT_CONFIGURED';
}

export interface BroadcastOptions {
  readonly channelName: string;
  readonly channelUrl: string;
  readonly kick?: KickClient | undefined;
}

export async function getBroadcastStatus(
  ctx: AppContext,
  tournamentId: string,
  options: BroadcastOptions,
): Promise<BroadcastStatus> {
  const rows = await ctx.db
    .select({
      id: schema.matches.id,
      roundNumber: schema.rounds.number,
      home: schema.matches.homePlayerId,
      away: schema.matches.awayPlayerId,
    })
    .from(schema.matches)
    .innerJoin(schema.rounds, eq(schema.matches.roundId, schema.rounds.id))
    .where(and(eq(schema.rounds.tournamentId, tournamentId), eq(schema.matches.status, 'LIVE')));

  const names = new Map<string, string>();
  if (rows.length > 0) {
    const players = await ctx.db.query.players.findMany({
      where: eq(schema.players.tournamentId, tournamentId),
      columns: { id: true, displayName: true },
    });
    for (const player of players) names.set(player.id, player.displayName);
  }

  const matches: BroadcastMatch[] = rows.map((row) => ({
    id: row.id,
    roundNumber: row.roundNumber,
    home: names.get(row.home) ?? 'Participante',
    away: names.get(row.away) ?? 'Participante',
  }));

  const checkedAt = ctx.now().toISOString();

  /*
    Sin cliente de Kick configurado no se puede comprobar nada, y la respuesta
    lo dice en vez de fingir que el canal está apagado.
  */
  if (options.kick === undefined) {
    return {
      live: false,
      channel: {
        name: options.channelName,
        url: options.channelUrl,
        state: 'UNKNOWN',
        category: null,
        playingClashRoyale: false,
        title: null,
        startedAt: null,
        checkedAt,
      },
      matches,
      reason: 'NOT_CONFIGURED',
    };
  }

  const status = await options.kick.status();

  const channel = {
    name: options.channelName,
    url: options.channelUrl,
    state: status.state,
    category: status.category,
    playingClashRoyale: status.playingClashRoyale,
    title: status.title,
    startedAt: status.startedAt,
    checkedAt: status.checkedAt,
  };

  /*
    El orden de las comprobaciones es el orden en que se explican. Primero lo
    del canal —que es lo que el visitante puede ver por su cuenta— y después lo
    de la liga.
  */
  if (status.state === 'UNKNOWN') {
    return { live: false, channel, matches, reason: 'CHANNEL_UNKNOWN' };
  }
  if (status.state === 'OFFLINE') {
    return { live: false, channel, matches, reason: 'CHANNEL_OFFLINE' };
  }
  if (!status.playingClashRoyale) {
    return { live: false, channel, matches, reason: 'CHANNEL_OTHER_GAME' };
  }
  if (matches.length === 0) {
    return { live: false, channel, matches, reason: 'NO_MATCHES_LIVE' };
  }

  return { live: true, channel, matches, reason: 'LIVE' };
}
