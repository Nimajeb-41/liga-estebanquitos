/**
 * Autenticacion administrativa.
 *
 * Login con limite de intentos, respuesta generica ante credenciales erroneas
 * (no se distingue "no existe" de "contrasena incorrecta") y cookie de sesion
 * httpOnly + SameSite=Lax.
 */

import { schema } from '@liga/database';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { verifyPassword } from '../auth/passwords.ts';
import { createSession, revokeSession, SESSION_COOKIE } from '../auth/sessions.ts';
import { currentAdmin, requireAdmin } from '../auth/guard.ts';
import { writeAudit } from '../data/audit.ts';
import type { AppContext } from '../data/context.ts';
import { unauthorized } from '../errors.ts';
import { loginBody, parse } from '../schemas.ts';

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post(
    '/api/v1/auth/login',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '5 minutes' },
      },
    },
    async (request, reply) => {
      const body = parse(loginBody, request.body);
      const email = body.email.trim().toLowerCase();

      const admin = await ctx.db.query.adminUsers.findFirst({
        where: eq(schema.adminUsers.email, email),
      });

      const digest = admin?.passwordHash ?? '$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaa$aaaa';
      const valid = await verifyPassword(digest, body.password);

      if (admin === undefined || !admin.isActive || !valid) {
        throw unauthorized('Correo o contrasena incorrectos.');
      }

      const now = ctx.now();
      const session = await createSession(
        ctx.db,
        admin.id,
        ctx.config.session.ttlHours,
        now,
        request.headers['user-agent'] ?? null,
      );

      await ctx.db
        .update(schema.adminUsers)
        .set({ lastLoginAt: now })
        .where(eq(schema.adminUsers.id, admin.id));

      await writeAudit(ctx.db, {
        tournamentId: null,
        actorAdminId: admin.id,
        requestId: String(request.id),
        action: 'ADMIN_LOGIN',
        entityType: 'admin_user',
        entityId: admin.id,
      });

      reply.setCookie(SESSION_COOKIE, session.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: ctx.config.session.secureCookie,
        path: '/',
        expires: session.expiresAt,
      });

      return {
        admin: { id: admin.id, displayName: admin.displayName, role: admin.role },
        expiresAt: session.expiresAt,
      };
    },
  );

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token !== undefined && token.length > 0) {
      await revokeSession(ctx.db, token, ctx.now());
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/v1/auth/me', { preHandler: requireAdmin(ctx) }, async (request) => {
    const admin = currentAdmin(request);
    return { id: admin.id, displayName: admin.displayName, email: admin.email, role: admin.role };
  });
}
