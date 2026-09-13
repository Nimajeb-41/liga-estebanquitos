/**
 * Seed de desarrollo.
 *
 * Crea el torneo, su reglamento, un administrador y los participantes ya
 * confirmados. Es idempotente: se puede ejecutar las veces que haga falta.
 *
 *   npm run db:seed                 # torneo + admin + los 6 confirmados
 *   npm run db:seed -- --with-test-players
 *
 * Los cuatro participantes de relleno se llaman TEST_PLAYER_01..04 a proposito:
 * nadie puede confundirlos con inscritos reales. El flag esta bloqueado en
 * produccion.
 */

import { schema } from '@liga/database';
import { createDatabase, type LigaDatabase } from '@liga/database/client';
import { createLocalDatabase, isLocalDatabaseUrl } from '@liga/database/local';
import { DEFAULT_SETTINGS } from '@liga/domain';
import { eq } from 'drizzle-orm';

import { hashPassword } from '../auth/passwords.ts';
import { loadConfig } from '../config.ts';

/** Los seis participantes confirmados a dia de hoy. Los otros cuatro son TBD. */
export const CONFIRMED_PLAYERS = [
  'Nimaben',
  'Lyuk',
  'Dullys',
  'Esteban',
  'Eze23ml',
  'LeonSB',
] as const;

export const TEST_PLAYERS = [
  'TEST_PLAYER_01',
  'TEST_PLAYER_02',
  'TEST_PLAYER_03',
  'TEST_PLAYER_04',
] as const;

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface SeedOptions {
  readonly tournamentSlug: string;
  readonly adminEmail: string;
  readonly adminPassword: string;
  readonly withTestPlayers?: boolean;
}

export interface SeedResult {
  readonly tournamentId: string;
  readonly adminId: string;
  readonly confirmed: number;
}

export async function seed(db: LigaDatabase, options: SeedOptions): Promise<SeedResult> {
  const existing = await db.query.tournaments.findFirst({
    where: eq(schema.tournaments.slug, options.tournamentSlug),
  });

  let tournamentId: string;
  if (existing === undefined) {
    const [created] = await db
      .insert(schema.tournaments)
      .values({
        slug: options.tournamentSlug,
        name: 'Liga Estabanquitos 2026-1',
        season: '2026-1',
        status: 'REGISTRATION',
        rosterSize: DEFAULT_SETTINGS.rosterSize,
        legs: DEFAULT_SETTINGS.legs,
      })
      .returning({ id: schema.tournaments.id });
    tournamentId = (created as { id: string }).id;

    await db.insert(schema.tournamentSettings).values({
      tournamentId,
      pointsWin: DEFAULT_SETTINGS.scoring.win,
      pointsWinMaxCrowns: DEFAULT_SETTINGS.scoring.winWithMaxCrowns,
      pointsLoss: DEFAULT_SETTINGS.scoring.loss,
      pointsDraw: DEFAULT_SETTINGS.scoring.draw,
      pointsWalkoverWin: DEFAULT_SETTINGS.scoring.walkoverWin,
      walkoverCrownsWinner: DEFAULT_SETTINGS.scoring.walkoverCrowns?.[0] ?? null,
      walkoverCrownsLoser: DEFAULT_SETTINGS.scoring.walkoverCrowns?.[1] ?? null,
      maxCrownsPerMatch: DEFAULT_SETTINGS.crowns.maxPerMatch,
      sanctionDefaultPoints: DEFAULT_SETTINGS.sanctions.defaultPoints,
      sanctionMinPoints: DEFAULT_SETTINGS.sanctions.minPoints,
      disputeWindowHours: DEFAULT_SETTINGS.disputes.windowHours,
      noShowToleranceMinutes: DEFAULT_SETTINGS.noShow.toleranceMinutes,
      tiebreakers: [...DEFAULT_SETTINGS.tiebreakers],
      rulesVersion: DEFAULT_SETTINGS.rulesVersion,
    });
  } else {
    tournamentId = existing.id;
  }

  const email = options.adminEmail.trim().toLowerCase();
  const existingAdmin = await db.query.adminUsers.findFirst({
    where: eq(schema.adminUsers.email, email),
  });
  let adminId: string;
  if (existingAdmin === undefined) {
    const [created] = await db
      .insert(schema.adminUsers)
      .values({
        email,
        displayName: 'Administrador',
        passwordHash: await hashPassword(options.adminPassword),
        role: 'OWNER',
      })
      .returning({ id: schema.adminUsers.id });
    adminId = (created as { id: string }).id;
  } else {
    adminId = existingAdmin.id;
  }

  const names = [...CONFIRMED_PLAYERS, ...(options.withTestPlayers === true ? TEST_PLAYERS : [])];

  let slot = 0;
  for (const name of names) {
    slot += 1;
    const slug = slugify(name);
    const found = await db.query.players.findFirst({
      where: eq(schema.players.slug, slug),
    });
    if (found !== undefined) continue;

    await db.insert(schema.players).values({
      tournamentId,
      displayName: name,
      slug,
      status: 'CONFIRMED',
      slot,
      confirmedAt: new Date(),
    });
  }

  const confirmed = await db.query.players.findMany({
    where: eq(schema.players.tournamentId, tournamentId),
  });

  return {
    tournamentId,
    adminId,
    confirmed: confirmed.filter((player) => player.status === 'CONFIRMED').length,
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.databaseUrl === null) {
    console.error('Falta DATABASE_URL.');
    process.exit(78);
  }

  const withTestPlayers = process.argv.includes('--with-test-players');
  if (withTestPlayers && config.nodeEnv === 'production') {
    console.error('--with-test-players esta bloqueado en produccion.');
    process.exit(1);
  }

  const adminEmail = process.env['ADMIN_EMAIL'] ?? 'admin@liga-estabanquitos.local';
  const adminPassword = process.env['ADMIN_PASSWORD'] ?? '';
  if (adminPassword.length < 12) {
    console.error(
      'Define ADMIN_PASSWORD con al menos 12 caracteres antes de sembrar la base de datos.',
    );
    process.exit(78);
  }

  // Misma base que usa el servidor: servidor nativo o carpeta local.
  const local = isLocalDatabaseUrl(config.databaseUrl)
    ? await createLocalDatabase(config.databaseUrl)
    : null;
  const db = local?.db ?? createDatabase({ connectionString: config.databaseUrl });
  const result = await seed(db, {
    tournamentSlug: config.tournamentSlug,
    adminEmail,
    adminPassword,
    withTestPlayers,
  });

  console.log(
    `Seed aplicado: torneo ${result.tournamentId}, ${result.confirmed} participantes confirmados, admin ${adminEmail}.`,
  );
  if (local !== null) {
    console.log(`Base local en ${local.dataDir}`);
    await local.close();
  }
  process.exit(0);
}

if (process.argv[1] !== undefined && import.meta.filename === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
