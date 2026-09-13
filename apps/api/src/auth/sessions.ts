/**
 * Sesiones administrativas.
 *
 * El navegador recibe un token aleatorio de 256 bits en una cookie httpOnly.
 * En la base de datos solo se guarda su hash SHA-256: si la tabla se filtrase,
 * no serviria para suplantar a nadie. La cookie es SameSite=Lax, lo que ya
 * bloquea el CSRF de formularios cruzados en navegadores actuales.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { schema } from '@liga/database';
import type { LigaDatabase } from '@liga/database/client';
import { and, eq, gt, isNull } from 'drizzle-orm';

import type { AdminIdentity } from '../data/context.ts';

// El nombre de la cookie lo fija el contrato: lo conocen la API y el servidor
// del frontend, que la reenvia.
export { SESSION_COOKIE } from '@liga/contracts';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface CreatedSession {
  readonly token: string;
  readonly expiresAt: Date;
}

export async function createSession(
  db: LigaDatabase,
  adminId: string,
  ttlHours: number,
  now: Date,
  userAgent: string | null,
): Promise<CreatedSession> {
  const token = createToken();
  const expiresAt = new Date(now.getTime() + ttlHours * 3_600_000);
  await db.insert(schema.adminSessions).values({
    adminId,
    tokenHash: hashToken(token),
    expiresAt,
    createdAt: now,
    lastUsedAt: now,
    userAgent,
  });
  return { token, expiresAt };
}

export async function resolveSession(
  db: LigaDatabase,
  token: string,
  now: Date,
): Promise<AdminIdentity | null> {
  const rows = await db
    .select({
      sessionId: schema.adminSessions.id,
      adminId: schema.adminUsers.id,
      email: schema.adminUsers.email,
      displayName: schema.adminUsers.displayName,
      role: schema.adminUsers.role,
      isActive: schema.adminUsers.isActive,
    })
    .from(schema.adminSessions)
    .innerJoin(schema.adminUsers, eq(schema.adminSessions.adminId, schema.adminUsers.id))
    .where(
      and(
        eq(schema.adminSessions.tokenHash, hashToken(token)),
        isNull(schema.adminSessions.revokedAt),
        gt(schema.adminSessions.expiresAt, now),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (row === undefined || !row.isActive) return null;

  await db
    .update(schema.adminSessions)
    .set({ lastUsedAt: now })
    .where(eq(schema.adminSessions.id, row.sessionId));

  return {
    id: row.adminId,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
  };
}

export async function revokeSession(db: LigaDatabase, token: string, now: Date): Promise<void> {
  await db
    .update(schema.adminSessions)
    .set({ revokedAt: now })
    .where(eq(schema.adminSessions.tokenHash, hashToken(token)));
}

/** Comparacion de tiempo constante para valores cortos (no para contrasenas). */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
