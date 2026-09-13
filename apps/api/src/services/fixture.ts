/**
 * Servicio de fixture.
 *
 * Reutiliza el generador de la Fase 0 tal cual: aqui no se reimplementa el
 * algoritmo, solo se decide cuando puede ejecutarse, se persiste el resultado
 * en una unica transaccion y se deja constancia de como se genero.
 */

import { schema } from '@liga/database';
import {
  assertCan,
  assertRosterReady,
  assertValidFixture,
  confirmedParticipants,
  createSeed,
  DomainError,
  generateFixture,
} from '@liga/domain';
import type { Fixture } from '@liga/contracts';
import { eq } from 'drizzle-orm';

import { writeAudit } from '../data/audit.ts';
import type { AdminIdentity, AppContext } from '../data/context.ts';
import { listMatches, listRounds } from '../data/matches.ts';
import { serializeMatch, serializeRound } from './serializers.ts';
import { loadRosterAsDomain } from '../data/players.ts';
import { requireTournament } from '../data/tournament.ts';

export interface GenerateFixtureOptions {
  readonly seed?: string | undefined;
  /** Regenerar exige confirmacion explicita: borra el calendario anterior. */
  readonly replaceExisting?: boolean | undefined;
}

export async function generateOfficialFixture(
  ctx: AppContext,
  admin: AdminIdentity,
  options: GenerateFixtureOptions = {},
) {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  assertCan(tournament.status, 'GENERATE_FIXTURE');

  const { roster } = await loadRosterAsDomain(ctx.db, tournament.id);
  assertRosterReady(roster, settings);

  const existing = await listRounds(ctx.db, tournament.id);
  if (existing.length > 0 && options.replaceExisting !== true) {
    throw new DomainError(
      'FIXTURE_ALREADY_EXISTS',
      'Ya existe un calendario oficial. Regenerarlo borra el anterior y exige confirmacion explicita.',
      { rounds: existing.length },
    );
  }

  const playerIds = confirmedParticipants(roster).map((participant) => participant.id);
  const seed = options.seed ?? createSeed(ctx.now());
  const fixture = generateFixture(playerIds, { seed, legs: settings.legs });
  assertValidFixture(fixture, playerIds);

  return ctx.db.transaction(async (tx) => {
    if (existing.length > 0) {
      // Las jornadas arrastran en cascada partidos, resultados e historial.
      await tx.delete(schema.rounds).where(eq(schema.rounds.tournamentId, tournament.id));
    }

    for (const round of fixture.rounds) {
      const [inserted] = await tx
        .insert(schema.rounds)
        .values({
          tournamentId: tournament.id,
          number: round.number,
          leg: round.leg,
          label: `Fecha ${round.number}`,
        })
        .returning({ id: schema.rounds.id });
      const roundId = (inserted as { id: string }).id;

      for (const match of round.matches) {
        await tx.insert(schema.matches).values({
          tournamentId: tournament.id,
          roundId,
          orderInRound: match.order,
          homePlayerId: match.homeId,
          awayPlayerId: match.awayId,
        });
      }
    }

    await tx.insert(schema.fixtureGenerations).values({
      tournamentId: tournament.id,
      algorithm: fixture.algorithm,
      seed: fixture.seed,
      legs: fixture.legs,
      playerOrder: fixture.playerIds,
      generatedByAdminId: admin.id,
    });

    const now = ctx.now();
    await tx
      .update(schema.tournaments)
      .set({
        status: 'SCHEDULED',
        fixtureSeed: fixture.seed,
        fixtureGeneratedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.tournaments.id, tournament.id));

    await writeAudit(tx, {
      tournamentId: tournament.id,
      actorAdminId: admin.id,
      requestId: admin.requestId,
      action: 'FIXTURE_GENERATED',
      entityType: 'tournament',
      entityId: tournament.id,
      payload: {
        seed: fixture.seed,
        algorithm: fixture.algorithm,
        rounds: fixture.rounds.length,
        matches: fixture.rounds.reduce((total, round) => total + round.matches.length, 0),
        playerOrder: fixture.playerIds,
        replacedExisting: existing.length > 0,
      },
    });

    return {
      seed: fixture.seed,
      rounds: fixture.rounds.length,
      matches: fixture.rounds.reduce((total, round) => total + round.matches.length, 0),
    };
  });
}

export async function getFixture(ctx: AppContext): Promise<Fixture> {
  const { tournament, settings } = await requireTournament(ctx.db, ctx.config.tournamentSlug);
  const rounds = await listRounds(ctx.db, tournament.id);
  const matches = await listMatches(ctx.db, tournament.id);

  return {
    generated: rounds.length > 0,
    seed: tournament.fixtureSeed,
    generatedAt:
      tournament.fixtureGeneratedAt === null ? null : tournament.fixtureGeneratedAt.toISOString(),
    rounds: rounds.map((round) => ({
      ...serializeRound(round),
      matches: matches
        .filter((row) => row.match.roundId === round.id)
        .map((row) => serializeMatch(row, settings)),
    })),
  };
}
