/**
 * Autenticacion y autorizacion de las rutas administrativas.
 *
 * Toda operacion que cambia la competicion pasa por aqui. Las consultas
 * publicas no requieren sesion, pero son de solo lectura.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AdminIdentity, AppContext } from '../data/context.ts';
import { forbidden, unauthorized } from '../errors.ts';
import { resolveSession, SESSION_COOKIE } from './sessions.ts';

declare module 'fastify' {
  interface FastifyRequest {
    admin?: AdminIdentity;
  }
}

/** Roles que pueden ejecutar operaciones de escritura. */
const WRITE_ROLES: readonly AdminIdentity['role'][] = ['OWNER', 'ADMIN', 'REFEREE'];

export function requireAdmin(ctx: AppContext) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const token = request.cookies[SESSION_COOKIE];
    if (token === undefined || token.length === 0) {
      throw unauthorized();
    }

    const admin = await resolveSession(ctx.db, token, ctx.now());
    if (admin === null) {
      throw unauthorized('La sesion ha caducado o no es valida.');
    }
    if (!WRITE_ROLES.includes(admin.role)) {
      throw forbidden(`El rol ${admin.role} es de solo lectura.`);
    }

    request.admin = admin;
  };
}

/**
 * Devuelve la identidad ya resuelta por `requireAdmin`.
 *
 * Le añade el identificador de la peticion para que la auditoria pueda cruzar
 * una operacion con sus lineas de registro. Se hace aqui —y no en el guardia—
 * porque es lo que garantiza que **toda** operacion administrativa lo lleve:
 * no hay forma de llegar a un servicio sin pasar por esta funcion.
 */
export function currentAdmin(request: FastifyRequest): AdminIdentity {
  const admin = request.admin;
  if (admin === undefined) throw unauthorized();
  return { ...admin, requestId: String(request.id) };
}

/** Sesion opcional: sirve para que el panel sepa si mostrar el menu de admin. */
export function optionalAdmin(ctx: AppContext) {
  return async (request: FastifyRequest): Promise<void> => {
    const token = request.cookies[SESSION_COOKIE];
    if (token === undefined || token.length === 0) return;
    const admin = await resolveSession(ctx.db, token, ctx.now());
    if (admin !== null) request.admin = admin;
  };
}
