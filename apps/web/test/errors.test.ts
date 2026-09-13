/**
 * Los errores de negocio tienen que poder leerse.
 *
 * `PENDING_RULE` no significa nada para quien mira la web; el mensaje sí. El
 * código técnico solo aparece en desarrollo.
 */

import { describe, expect, it } from 'vitest';

import { ApiError, ApiUnreachableError } from '../src/lib/api/client.ts';
import { friendlyError } from '../src/lib/api/messages.ts';

const error = (status: number, code: string, message = 'crudo') =>
  new ApiError(status, code, message, null, 'req-1');

describe('friendlyError', () => {
  it('traduce PENDING_RULE a algo que se entiende', () => {
    const friendly = friendlyError(error(422, 'PENDING_RULE'));

    expect(friendly.message).toMatch(/pendiente de definición/i);
    expect(friendly.message).not.toContain('PENDING_RULE');
    // El código sigue disponible para enseñarlo solo en desarrollo.
    expect(friendly.code).toBe('PENDING_RULE');
    expect(friendly.requestId).toBe('req-1');
  });

  it('explica por qué se rechaza un empate', () => {
    expect(friendlyError(error(422, 'DRAW_NOT_ALLOWED')).message).toMatch(/no admite empates/i);
  });

  it('cubre los estados HTTP que no traen código conocido', () => {
    expect(friendlyError(error(401, 'ALGO_RARO')).message).toMatch(/iniciar sesión/i);
    expect(friendlyError(error(403, 'ALGO_RARO')).message).toMatch(/permiso/i);
    expect(friendlyError(error(404, 'ALGO_RARO')).message).toMatch(/no encontramos/i);
    expect(friendlyError(error(409, 'ALGO_RARO')).message).toMatch(/no permite esta operación/i);
    expect(friendlyError(error(429, 'ALGO_RARO')).message).toMatch(/demasiadas peticiones/i);
    expect(friendlyError(error(500, 'ALGO_RARO')).message).toMatch(/error en el servidor/i);
  });

  it('cae en el mensaje del servidor cuando no conoce ni el código ni el estado', () => {
    expect(friendlyError(error(418, 'RARO', 'soy una tetera')).message).toBe('soy una tetera');
  });

  it('distingue que la API no responde de que la API rechaza', () => {
    const friendly = friendlyError(new ApiUnreachableError(new Error('ECONNREFUSED')));

    expect(friendly.message).toMatch(/no se pudo contactar/i);
    expect(friendly.code).toBe('API_UNREACHABLE');
    expect(friendly.status).toBeNull();
  });

  it('no se rompe con algo que no es un error de la API', () => {
    const friendly = friendlyError('vaya');

    expect(friendly.message).toMatch(/error inesperado/i);
    expect(friendly.code).toBeNull();
  });
});
