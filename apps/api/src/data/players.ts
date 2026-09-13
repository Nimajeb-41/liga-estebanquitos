/**
 * Acceso a participantes.
 *
 * Patron: se carga la plantilla completa, se deja que `@liga/domain` calcule la
 * plantilla resultante y se persiste unicamente lo que cambio. Las reglas
 * (plazas, duplicados, cupo) nunca se reimplementan aqui.
 */

import { schema } from '@liga/database';
import type { LigaDb } from '@liga/database/client';
import type { Participant, Roster } from '@liga/domain';
import { eq } from 'drizzle-orm';

export type PlayerRow = typeof schema.players.$inferSelect;

export function toParticipant(row: PlayerRow): Participant {
  return {
    id: row.id,
    displayName: row.displayName,
    clashTag: row.clashTag,
    status: row.status,
    slot: row.slot,
    notes: row.notes,
    replacedByPlayerId: row.replacedByPlayerId,
  };
}

export async function loadRoster(db: LigaDb, tournamentId: string): Promise<PlayerRow[]> {
  return db.query.players.findMany({
    where: eq(schema.players.tournamentId, tournamentId),
    orderBy: (players, { asc }) => [asc(players.createdAt)],
  });
}

export async function loadRosterAsDomain(
  db: LigaDb,
  tournamentId: string,
): Promise<{ rows: PlayerRow[]; roster: Roster }> {
  const rows = await loadRoster(db, tournamentId);
  return { rows, roster: rows.map(toParticipant) };
}

export interface RosterDiff {
  readonly created: readonly Participant[];
  readonly updated: readonly Participant[];
  readonly removedIds: readonly string[];
}

/** Compara la plantilla antes y despues para saber que filas tocar. */
export function diffRoster(before: Roster, after: Roster): RosterDiff {
  const beforeById = new Map(before.map((participant) => [participant.id, participant]));
  const afterById = new Map(after.map((participant) => [participant.id, participant]));

  const created: Participant[] = [];
  const updated: Participant[] = [];

  for (const participant of after) {
    const previous = beforeById.get(participant.id);
    if (previous === undefined) {
      created.push(participant);
    } else if (
      previous.displayName !== participant.displayName ||
      previous.clashTag !== participant.clashTag ||
      previous.status !== participant.status ||
      previous.slot !== participant.slot ||
      previous.notes !== participant.notes ||
      previous.replacedByPlayerId !== participant.replacedByPlayerId
    ) {
      updated.push(participant);
    }
  }

  const removedIds = before
    .filter((participant) => !afterById.has(participant.id))
    .map((participant) => participant.id);

  return { created, updated, removedIds };
}

function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    // Quita los signos diacriticos (acentos, dieresis) ya separados por NFD.
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.length > 0 ? base : 'jugador';
}

/**
 * Aplica un diff de plantilla dentro de la transaccion recibida.
 *
 * El orden importa: primero se liberan las plazas (quien pasa a `slot = null`),
 * despues se borra, luego se inserta y por ultimo se aplica el resto de
 * cambios. Asi una sustitucion -el saliente suelta la plaza 3 y el entrante la
 * ocupa- no choca contra el indice unico de plaza.
 */
export async function persistRosterDiff(
  db: LigaDb,
  tournamentId: string,
  diff: RosterDiff,
  extras: Readonly<Record<string, { avatarUrl?: string | null; description?: string | null }>> = {},
): Promise<void> {
  const takenSlugs = new Set((await loadRoster(db, tournamentId)).map((row) => row.slug));

  const releasing = diff.updated.filter((participant) => participant.slot === null);
  const keeping = diff.updated.filter((participant) => participant.slot !== null);

  // Se libera la plaza pero todavia no se apunta al sustituto: su fila aun no
  // existe y la clave foranea fallaria.
  for (const participant of releasing) {
    await db
      .update(schema.players)
      .set({
        displayName: participant.displayName,
        clashTag: participant.clashTag,
        status: participant.status,
        slot: null,
        notes: participant.notes,
        updatedAt: new Date(),
      })
      .where(eq(schema.players.id, participant.id));
  }

  for (const id of diff.removedIds) {
    await db.delete(schema.players).where(eq(schema.players.id, id));
  }

  for (const participant of diff.created) {
    let slug = slugify(participant.displayName);
    let suffix = 2;
    while (takenSlugs.has(slug)) {
      slug = `${slugify(participant.displayName)}-${suffix}`;
      suffix += 1;
    }
    takenSlugs.add(slug);

    await db.insert(schema.players).values({
      id: participant.id,
      tournamentId,
      displayName: participant.displayName,
      slug,
      clashTag: participant.clashTag,
      status: participant.status,
      slot: participant.slot,
      notes: participant.notes,
      replacedByPlayerId: participant.replacedByPlayerId,
      confirmedAt: participant.status === 'CONFIRMED' ? new Date() : null,
      avatarUrl: extras[participant.id]?.avatarUrl ?? null,
    });
  }

  for (const participant of keeping) {
    await db
      .update(schema.players)
      .set({
        displayName: participant.displayName,
        clashTag: participant.clashTag,
        status: participant.status,
        slot: participant.slot,
        notes: participant.notes,
        replacedByPlayerId: participant.replacedByPlayerId,
        updatedAt: new Date(),
        ...(participant.status === 'CONFIRMED' ? { confirmedAt: new Date() } : {}),
      })
      .where(eq(schema.players.id, participant.id));
  }

  // Ahora que el sustituto ya existe, se enlaza al saliente con el.
  for (const participant of releasing) {
    if (participant.replacedByPlayerId === null) continue;
    await db
      .update(schema.players)
      .set({ replacedByPlayerId: participant.replacedByPlayerId })
      .where(eq(schema.players.id, participant.id));
  }
}

export async function updatePlayerProfile(
  db: LigaDb,
  playerId: string,
  fields: { avatarUrl?: string | null },
): Promise<void> {
  if (fields.avatarUrl === undefined) return;
  await db
    .update(schema.players)
    .set({ avatarUrl: fields.avatarUrl, updatedAt: new Date() })
    .where(eq(schema.players.id, playerId));
}
