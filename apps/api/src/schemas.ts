/**
 * Validacion de entrada.
 *
 * Nada que venga del cliente se usa sin pasar por aqui. Los esquemas son la
 * frontera: a partir de este punto el resto del codigo trabaja con datos ya
 * comprobados, y las reglas de competicion las valida despues el dominio.
 */

import { z } from 'zod';

import { badRequest } from './errors.ts';

export const uuidSchema = z.uuid({ message: 'Identificador invalido.' });

export const idParams = z.object({ id: uuidSchema });

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Fecha invalida.' });

const displayName = z
  .string()
  .trim()
  .min(2, 'El nombre necesita al menos 2 caracteres.')
  .max(40, 'El nombre no puede pasar de 40 caracteres.');

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const loginBody = z.object({
  email: z.email({ message: 'Correo invalido.' }),
  password: z.string().min(1, 'Falta la contrasena.').max(200),
});

export const createPlayerBody = z.object({
  displayName,
  clashTag: optionalText(20),
  notes: optionalText(500),
});

export const updatePlayerBody = z
  .object({
    displayName: displayName.optional(),
    clashTag: optionalText(20),
    notes: optionalText(500),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'No hay nada que actualizar.',
  });

export const confirmPlayerBody = z.object({
  slot: z.number().int().min(1).max(64).optional(),
});

export const replacePlayerBody = z.object({
  displayName,
  clashTag: optionalText(20),
  notes: optionalText(500),
});

export const tournamentStatusBody = z.object({
  status: z.enum(['DRAFT', 'REGISTRATION', 'READY', 'SCHEDULED', 'LIVE', 'FINISHED', 'CANCELLED']),
});

/** Identidad y fechas previstas de la temporada. */
export const seasonIdentityBody = z
  .object({
    name: z.string().trim().min(3).max(80).optional(),
    season: z.string().trim().min(3).max(20).optional(),
    plannedStartAt: isoDate.nullable().optional(),
    plannedEndAt: isoDate.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay nada que actualizar.' });

/**
 * Cambios del reglamento.
 *
 * Exige motivo por escrito: cambiar la puntuacion **reescribe la tabla hacia
 * atras**, incluidas las jornadas ya jugadas. Dentro de seis meses eso tiene
 * que tener explicacion.
 */
export const settingsBody = z.object({
  rosterSize: z.number().int().min(4).max(64).optional(),
  legs: z.number().int().min(1).max(2).optional(),
  scoring: z
    .object({
      win: z.number().int().min(0).max(20).optional(),
      winWithMaxCrowns: z.number().int().min(0).max(20).optional(),
      loss: z.number().int().min(0).max(20).optional(),
      draw: z.number().int().min(0).max(20).nullable().optional(),
      walkoverWin: z.number().int().min(0).max(20).nullable().optional(),
      walkoverCrowns: z
        .tuple([z.number().int().min(0), z.number().int().min(0)])
        .nullable()
        .optional(),
    })
    .optional(),
  crowns: z.object({ maxPerMatch: z.number().int().min(1).max(20) }).optional(),
  sanctions: z
    .object({
      defaultPoints: z.number().int().min(-20).max(0).optional(),
      minPoints: z.number().int().min(-100).max(0).optional(),
    })
    .optional(),
  disputes: z.object({ windowHours: z.number().int().min(0).max(720) }).optional(),
  noShow: z.object({ toleranceMinutes: z.number().int().min(0).max(240) }).optional(),
  tiebreakers: z.array(z.string().trim().min(1).max(40)).min(1).max(10).optional(),
  reason: z.string().trim().min(3, 'Un cambio de reglamento necesita un motivo.').max(500),
});

/**
 * Cerrar la temporada.
 *
 * Exige motivo por escrito. `acknowledgePending` no es una casilla de «si,
 * si, adelante»: es la diferencia entre cerrar una temporada terminada y
 * cerrar una a medias, y las dos cosas quedan escritas distinto en auditoria.
 */
export const finishSeasonBody = z.object({
  reason: z.string().trim().min(3, 'Cerrar la temporada necesita un motivo.').max(500),
  acknowledgePending: z.boolean().optional(),
});

export const generateFixtureBody = z.object({
  seed: z.string().trim().min(1).max(120).optional(),
  replaceExisting: z.boolean().optional(),
});

export const postponeBody = z.object({
  reason: z.enum([
    'PERSONAL',
    'TECHNICAL',
    'CONNECTION',
    'SCHEDULE',
    'UNAVAILABLE',
    'ADMIN_DECISION',
    'OTHER',
  ]),
  notes: z.string().trim().min(3, 'Explica el motivo del aplazamiento.').max(500),
  proposedAt: isoDate.nullable().optional(),
});

export const rescheduleBody = z.object({
  newScheduledAt: isoDate,
  notes: z.string().trim().min(3, 'Explica por que se juega en esta nueva fecha.').max(500),
  reason: z
    .enum([
      'PERSONAL',
      'TECHNICAL',
      'CONNECTION',
      'SCHEDULE',
      'UNAVAILABLE',
      'ADMIN_DECISION',
      'OTHER',
    ])
    .optional(),
});

export const scheduleBody = z.object({
  scheduledAt: isoDate,
});

/**
 * Programar una jornada entera.
 *
 * `overwrite` es opcional y por defecto `false`: una fecha ya acordada no se
 * pisa porque alguien programe en bloque. Si de verdad se quiere, hay que
 * decirlo.
 */
export const roundNumberParams = z.object({
  number: z.coerce.number().int().min(1).max(200),
});

export const scheduleRoundBody = z.object({
  startAt: isoDate,
  intervalMinutes: z.coerce.number().int().min(0).max(1440).default(30),
  overwrite: z.boolean().default(false),
});

/**
 * Programar la temporada entera.
 *
 * Los valores por defecto son los de esta liga: tres jornadas cada sabado, un
 * partido cada media hora y quince minutos de descanso entre jornadas.
 */
export const scheduleSeasonBody = z.object({
  startAt: isoDate,
  roundsPerSession: z.coerce.number().int().min(1).max(18).default(3),
  daysBetweenSessions: z.coerce.number().int().min(1).max(60).default(7),
  intervalMinutes: z.coerce.number().int().min(0).max(1440).default(30),
  roundGapMinutes: z.coerce.number().int().min(0).max(1440).default(15),
  overwrite: z.boolean().default(false),
});

export const liveBody = z.object({
  streamUrl: z.url({ message: 'La URL de la transmision no es valida.' }).nullable().optional(),
});

/**
 * Cancelar un partido exige un motivo por escrito.
 *
 * Es la unica operacion sin vuelta atras del calendario: de CANCELLED no se
 * sale. Quien la ejecute tiene que dejar dicho por que, porque dentro de seis
 * meses nadie se va a acordar y el hueco en la tabla seguira ahi.
 */
export const cancelMatchBody = z.object({
  reason: z.string().trim().min(3, 'Cancelar un partido necesita un motivo.').max(500),
});

/**
 * Enlaces de transmision.
 *
 * Solo `http`/`https`: un `javascript:` aqui acabaria pegado en un `href` de la
 * ficha publica. `z.url()` por si solo acepta cualquier esquema.
 */
const streamLink = z
  .url({ message: 'La URL no es valida.' })
  .refine(
    (value) => value.startsWith('http://') || value.startsWith('https://'),
    'Solo se admiten enlaces http o https.',
  )
  .nullable();

export const streamBody = z.object({
  streamUrl: streamLink,
  vodUrl: streamLink,
  /** Nombre de la plataforma, para etiquetar el enlace. */
  platform: z.string().trim().max(40).nullable(),
});

const crowns = z.number().int().min(0).max(20);

export const resultBody = z.object({
  homeCrowns: crowns,
  awayCrowns: crowns,
  resolution: z.enum(['PLAYED', 'WALKOVER', 'ADMIN_DECISION']).optional(),
  evidenceUrl: z.url().nullable().optional(),
  notes: optionalText(500),
});

export const correctResultBody = z.object({
  homeCrowns: crowns,
  awayCrowns: crowns,
  reason: z.string().trim().min(3, 'Toda correccion necesita un motivo.').max(500),
});

/**
 * Declarar una incomparecencia.
 *
 * No lleva marcador a proposito: no hubo batalla. Lleva quien falto, porque
 * con 0-0 el marcador no dice quien gana, y un motivo por escrito.
 */
export const walkoverBody = z.object({
  absentPlayerId: uuidSchema,
  reason: z.string().trim().min(3, 'Una incomparecencia necesita un motivo.').max(500),
});

export const reportResultBody = z.object({
  playerId: uuidSchema,
  homeCrowns: crowns,
  awayCrowns: crowns,
  evidenceUrl: z.url().nullable().optional(),
});

/**
 * Filtros del registro de auditoria.
 *
 * Todo opcional: sin filtros devuelve lo ultimo que paso, que es lo que se
 * quiere ver al entrar.
 */
export const auditQuery = z.object({
  action: z.string().trim().min(1).max(64).optional(),
  actorAdminId: uuidSchema.optional(),
  entityType: z.string().trim().min(1).max(64).optional(),
  entityId: z.string().trim().min(1).max(128).optional(),
  requestId: z.string().trim().min(1).max(128).optional(),
  since: isoDate.optional(),
  until: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  /** Devuelve tambien de que se puede filtrar, segun lo registrado. */
  facets: z.coerce.boolean().optional(),
});

export const createSanctionBody = z.object({
  playerId: uuidSchema,
  type: z.enum(['BM', 'NO_SHOW', 'RULE_BREACH', 'OTHER']),
  reason: z.string().trim().min(3, 'Describe la conducta sancionada.').max(500),
  points: z.number().int().min(-20).max(0).optional(),
  matchId: uuidSchema.nullable().optional(),
  evidenceUrl: z.url().nullable().optional(),
  notes: optionalText(500),
});

export const revokeSanctionBody = z.object({
  reason: z.string().trim().min(3, 'Explica por que se anula la sancion.').max(500),
});

export const standingsQuery = z.object({
  upToRound: z.coerce.number().int().min(1).max(64).optional(),
});

/** Valida y convierte cualquier error de esquema en un 400 uniforme. */
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest('VALIDATION_ERROR', 'Los datos enviados no son validos.', {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

/* -------------------------------------------------------------------------- */
/* Integracion con Clash Royale (Fase 3)                                       */
/* -------------------------------------------------------------------------- */

/**
 * Etiqueta de jugador.
 *
 * Se valida aqui ademas de en el cliente porque esta es la frontera: la
 * etiqueta llega de un formulario y acaba en la ruta de una URL externa.
 */
export const clashTagBody = z.object({
  clashTag: z
    .string()
    .trim()
    .min(4, 'Una etiqueta necesita al menos tres caracteres tras el #.')
    .max(16, 'Una etiqueta no pasa de quince caracteres tras el #.')
    .regex(/^#?[0-9A-Za-z]{3,15}$/, 'Una etiqueta solo lleva letras y numeros.'),
});

/** Nota opcional al resolver un candidato. Queda en la auditoria. */
export const candidateResolutionBody = z.object({
  note: z.string().trim().min(1).max(500).nullable().optional(),
});

export const candidateQuery = z.object({
  status: z.enum(['PENDING', 'NEEDS_REVIEW', 'CONFIRMED', 'REJECTED']).optional(),
});

/**
 * Identificador de participante en una ruta publica.
 *
 * Acepta el UUID o el slug: las URL publicas usan el slug (`/jugadores/lyuk`)
 * y las internas el identificador.
 */
/** Cara a cara: dos participantes, cada uno por id o por slug. */
export const headToHeadParams = z.object({
  a: z.string().trim().min(1).max(80),
  b: z.string().trim().min(1).max(80),
});

export const playerParams = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z0-9_-]+$/, 'Identificador invalido.'),
});
