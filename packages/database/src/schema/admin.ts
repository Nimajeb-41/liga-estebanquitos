/** Administracion y trazabilidad. */

import {
  bigserial,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { adminRoleEnum } from './enums.ts';

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  /** Hash Argon2id. Nunca se guarda la contrasena en claro. */
  passwordHash: text('password_hash').notNull(),
  role: adminRoleEnum('role').notNull().default('ADMIN'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Sesiones administrativas.
 *
 * El navegador solo recibe un token opaco en una cookie httpOnly; aqui se
 * guarda su hash SHA-256, nunca el token. Si esta tabla se filtrase, no
 * serviria para suplantar a nadie.
 */
export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
  },
  (table) => [index('admin_sessions_admin_idx').on(table.adminId, table.expiresAt)],
);

/**
 * Registro de toda accion administrativa con efecto sobre la competicion.
 * Es la respuesta a "quien cambio esto y cuando".
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tournamentId: uuid('tournament_id'),
    actorAdminId: uuid('actor_admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    /** Verbo de la accion, p. ej. "MATCH_RESULT_CORRECTED". */
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    payload: jsonb('payload'),
    /**
     * La peticion HTTP que provoco esta entrada.
     *
     * Permite cruzar una operacion con sus lineas de registro cuando algo sale
     * raro. Vacio si la operacion no vino de una peticion —un script, la
     * siembra inicial—: no se inventa uno para rellenar.
     */
    requestId: text('request_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_tournament_idx').on(table.tournamentId, table.createdAt),
    index('audit_log_entity_idx').on(table.entityType, table.entityId),
    index('audit_log_actor_idx').on(table.actorAdminId, table.createdAt),
    index('audit_log_action_idx').on(table.action, table.createdAt),
    index('audit_log_request_idx').on(table.requestId),
  ],
);
