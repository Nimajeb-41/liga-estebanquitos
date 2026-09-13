/**
 * Centro de accion.
 *
 * `metrics` responde «¿cuantos?»; esto responde «¿cuales, y que hago con
 * ellos?». La diferencia importa: un administrador que ve «3 en disputa» tiene
 * que ir a buscarlos; uno que ve los tres, con su enlace, resuelve.
 *
 * Reglas de la casa que se respetan aqui:
 *
 * - Nada de umbrales inventados. «Fecha pasada» es un hecho comprobable contra
 *   el reloj; «va retrasado» seria una opinion.
 * - El orden es por antiguedad, no por gravedad. Decidir que una disputa pesa
 *   mas que un aplazado es una decision de reglamento que nadie ha tomado.
 * - Esto no ejecuta nada. Enumera y enlaza; la accion sigue estando donde
 *   estaba, con sus confirmaciones.
 */

import { schema } from '@liga/database';
import { and, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';

import type { AppContext } from '../data/context.ts';

/** Que clase de decision espera. El codigo es estable; el texto, de la UI. */
export type AttentionKind =
  | 'DISPUTED'
  | 'POSTPONED_WITHOUT_DATE'
  | 'OVERDUE'
  | 'LIVE'
  | 'UNSCHEDULED'
  | 'CANDIDATE_PENDING'
  | 'BATTLE_NEEDS_REVIEW';

export interface AttentionItem {
  readonly kind: AttentionKind;
  readonly matchId: string | null;
  readonly roundNumber: number | null;
  readonly label: string;
  /** Desde cuando espera. `null` cuando no hay una fecha honesta que dar. */
  readonly since: string | null;
  /** A donde va quien quiera resolverlo. */
  readonly href: string;
}

export interface AttentionReport {
  readonly generatedAt: string;
  readonly total: number;
  readonly byKind: Readonly<Record<AttentionKind, number>>;
  readonly items: readonly AttentionItem[];
}

const EMPTY: Record<AttentionKind, number> = {
  DISPUTED: 0,
  POSTPONED_WITHOUT_DATE: 0,
  OVERDUE: 0,
  LIVE: 0,
  UNSCHEDULED: 0,
  CANDIDATE_PENDING: 0,
  BATTLE_NEEDS_REVIEW: 0,
};

export async function collectAttention(
  ctx: AppContext,
  tournamentId: string,
): Promise<AttentionReport> {
  const now = ctx.now();

  const rows = await ctx.db
    .select({
      id: schema.matches.id,
      status: schema.matches.status,
      scheduledAt: schema.matches.scheduledAt,
      updatedAt: schema.matches.updatedAt,
      roundNumber: schema.rounds.number,
      home: schema.matches.homePlayerId,
      away: schema.matches.awayPlayerId,
    })
    .from(schema.matches)
    .innerJoin(schema.rounds, eq(schema.matches.roundId, schema.rounds.id))
    .where(
      and(
        eq(schema.rounds.tournamentId, tournamentId),
        or(
          eq(schema.matches.status, 'DISPUTED'),
          eq(schema.matches.status, 'LIVE'),
          eq(schema.matches.status, 'POSTPONED'),
          and(
            eq(schema.matches.status, 'SCHEDULED'),
            or(
              isNull(schema.matches.scheduledAt),
              and(isNotNull(schema.matches.scheduledAt), lt(schema.matches.scheduledAt, now)),
            ),
          ),
        ),
      ),
    );

  const names = new Map<string, string>();
  const players = await ctx.db.query.players.findMany({
    where: eq(schema.players.tournamentId, tournamentId),
    columns: { id: true, displayName: true },
  });
  for (const player of players) names.set(player.id, player.displayName);
  const versus = (home: string, away: string): string =>
    `${names.get(home) ?? 'Participante'} vs ${names.get(away) ?? 'Participante'}`;

  const items: AttentionItem[] = [];

  for (const row of rows) {
    const label = versus(row.home, row.away);
    const href = `/admin/matches/${row.id}`;
    const base = { matchId: row.id, roundNumber: row.roundNumber, label, href } as const;

    if (row.status === 'DISPUTED') {
      items.push({ ...base, kind: 'DISPUTED', since: row.updatedAt.toISOString() });
    } else if (row.status === 'LIVE') {
      items.push({ ...base, kind: 'LIVE', since: row.updatedAt.toISOString() });
    } else if (row.status === 'POSTPONED') {
      // Un aplazado con fecha nueva no espera nada: espera a que llegue el dia.
      if (row.scheduledAt === null) {
        items.push({
          ...base,
          kind: 'POSTPONED_WITHOUT_DATE',
          since: row.updatedAt.toISOString(),
        });
      }
    } else if (row.scheduledAt === null) {
      items.push({ ...base, kind: 'UNSCHEDULED', since: null });
    } else {
      items.push({ ...base, kind: 'OVERDUE', since: row.scheduledAt.toISOString() });
    }
  }

  /*
    Los candidatos apuntan a un partido cualquiera, no solo a los atascados:
    una batalla puede proponerse para uno ya terminado. Se piden sus partidos
    aparte en vez de reutilizar los de arriba, que son otra lista.
  */
  const candidates = await ctx.db.query.battleCandidates.findMany({
    where: and(
      eq(schema.battleCandidates.tournamentId, tournamentId),
      eq(schema.battleCandidates.status, 'PENDING'),
    ),
    columns: { id: true, matchId: true, detectedAt: true },
  });

  const candidateMatches =
    candidates.length === 0
      ? []
      : await ctx.db.query.matches.findMany({
          where: inArray(
            schema.matches.id,
            candidates.map((candidate) => candidate.matchId),
          ),
          columns: { id: true, homePlayerId: true, awayPlayerId: true },
        });
  const matchLabels = new Map<string, string>();
  for (const match of candidateMatches) {
    matchLabels.set(match.id, versus(match.homePlayerId, match.awayPlayerId));
  }

  for (const candidate of candidates) {
    const label = matchLabels.get(candidate.matchId);
    items.push({
      kind: 'CANDIDATE_PENDING',
      matchId: candidate.matchId,
      roundNumber: null,
      label: label === undefined ? 'Candidato de Battlelog' : `${label} · candidato`,
      since: candidate.detectedAt.toISOString(),
      href: '/admin/clash-royale',
    });
  }

  const flagged = await ctx.db.query.externalBattles.findMany({
    where: and(
      eq(schema.externalBattles.tournamentId, tournamentId),
      eq(schema.externalBattles.needsReview, true),
    ),
    columns: { id: true, battleTime: true },
  });
  for (const battle of flagged) {
    items.push({
      kind: 'BATTLE_NEEDS_REVIEW',
      matchId: null,
      roundNumber: null,
      label: 'Batalla importada con algo que no cuadra',
      since: battle.battleTime.toISOString(),
      href: '/admin/clash-royale',
    });
  }

  /*
    Lo que lleva mas tiempo esperando, primero. Lo que no tiene fecha va al
    final: no es que sea reciente, es que no hay nada honesto que ordenar.
  */
  items.sort((left, right) => {
    if (left.since === null) return right.since === null ? 0 : 1;
    if (right.since === null) return -1;
    return left.since.localeCompare(right.since);
  });

  const byKind = { ...EMPTY };
  for (const item of items) byKind[item.kind] += 1;

  return { generatedAt: now.toISOString(), total: items.length, byKind, items };
}
