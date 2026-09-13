/**
 * Contrato de la API.
 *
 * Un unico sitio define la forma de cada respuesta: el backend la cumple (hay
 * tests que lo verifican contra estos esquemas) y el frontend deriva sus tipos
 * de aqui. Asi no hay dos definiciones del mismo objeto envejeciendo por
 * separado.
 *
 * Las fechas viajan como cadenas ISO: es JSON, no hay `Date`.
 */

import { z } from 'zod';

const isoDate = z.string();
const nullableDate = isoDate.nullable();

/* -------------------------------------------------------------------------- */
/* Vocabulario                                                                 */
/* -------------------------------------------------------------------------- */

export const tournamentStatusSchema = z.enum([
  'DRAFT',
  'REGISTRATION',
  'READY',
  'SCHEDULED',
  'LIVE',
  'FINISHED',
  'CANCELLED',
]);

export const matchStatusSchema = z.enum([
  'SCHEDULED',
  'LIVE',
  'COMPLETED',
  'POSTPONED',
  'CANCELLED',
  'DISPUTED',
]);

export const participantStatusSchema = z.enum(['REGISTERED', 'CONFIRMED', 'WITHDRAWN', 'REPLACED']);

export const matchResolutionSchema = z.enum(['PLAYED', 'WALKOVER', 'ADMIN_DECISION']);
export const matchOutcomeSchema = z.enum(['HOME_WIN', 'AWAY_WIN', 'DRAW']);
export const victoryTypeSchema = z.enum([
  'NORMAL',
  'MAX_CROWNS',
  'WALKOVER',
  'ADMIN_DECISION',
  'NONE',
]);
export const sanctionTypeSchema = z.enum(['BM', 'NO_SHOW', 'RULE_BREACH', 'OTHER']);
export const sanctionStatusSchema = z.enum(['ACTIVE', 'REVOKED']);
export const formResultSchema = z.enum(['W', 'L', 'D']);
export const postponementEventSchema = z.enum(['POSTPONED', 'RESCHEDULED']);
export const postponementReasonSchema = z.enum([
  'PERSONAL',
  'TECHNICAL',
  'CONNECTION',
  'SCHEDULE',
  'UNAVAILABLE',
  'ADMIN_DECISION',
  'OTHER',
]);

/* -------------------------------------------------------------------------- */
/* Torneo                                                                      */
/* -------------------------------------------------------------------------- */

export const formatSummarySchema = z.object({
  players: z.number(),
  legs: z.number(),
  rounds: z.number(),
  matchesPerRound: z.number(),
  totalMatches: z.number(),
  matchesPerPlayer: z.number(),
});

export const rosterSummarySchema = z.object({
  confirmed: z.number(),
  pending: z.number(),
  registered: z.number(),
  rosterSize: z.number(),
  complete: z.boolean(),
});

export const tournamentOverviewSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  season: z.string(),
  status: tournamentStatusSchema,
  capabilities: z.array(z.string()),
  /**
   * Estados a los que puede pasar ahora mismo. Lo decide el dominio: la
   * interfaz ofrece exactamente estos y ninguno mas.
   */
  allowedTransitions: z.array(tournamentStatusSchema),
  format: formatSummarySchema,
  roster: rosterSummarySchema,
  fixture: z.object({
    generated: z.boolean(),
    seed: z.string().nullable(),
    generatedAt: nullableDate,
    matches: z.number(),
  }),
  progress: z.object({
    completed: z.number(),
    scheduled: z.number(),
    live: z.number(),
    postponed: z.number(),
    disputed: z.number(),
    cancelled: z.number(),
    total: z.number(),
    /** 0..1. Partidos completados sobre el total del calendario. */
    ratio: z.number(),
    currentRound: z.number().nullable(),
  }),
  rulesVersion: z.string(),
  /** Cuando se **preve** empezar y terminar. Planes, no hechos. */
  plannedStartAt: nullableDate,
  plannedEndAt: nullableDate,
  startedAt: nullableDate,
  finishedAt: nullableDate,
});

export const rulesSchema = z.object({
  rulesVersion: z.string(),
  format: formatSummarySchema,
  scoring: z.object({
    win: z.number(),
    winWithMaxCrowns: z.number(),
    loss: z.number(),
    draw: z.number().nullable(),
    walkoverWin: z.number().nullable(),
    walkoverCrowns: z.tuple([z.number(), z.number()]).nullable(),
  }),
  crowns: z.object({ maxPerMatch: z.number() }),
  sanctions: z.object({ defaultPoints: z.number(), minPoints: z.number() }),
  disputes: z.object({ windowHours: z.number() }),
  noShow: z.object({ toleranceMinutes: z.number(), automatic: z.boolean() }),
  tiebreakers: z.array(z.string()),
  tournamentStatuses: z.array(tournamentStatusSchema),
  matchStatuses: z.array(matchStatusSchema),
  standingsColumns: z.array(z.object({ key: z.string(), short: z.string(), long: z.string() })),
  pending: z.object({
    draws: z.boolean(),
    walkovers: z.boolean(),
    reference: z.string(),
  }),
  /**
   * Que parametros del reglamento puede ajustar la administracion.
   *
   * Se publica para que el reglamento no parezca grabado en piedra cuando no
   * lo esta: un lector tiene derecho a saber que la puntuacion es una
   * decision de esta temporada y no una ley del juego.
   */
  configurable: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      group: z.enum(['FORMAT', 'SCORING', 'OPERATIONAL']),
    }),
  ),
});

/* -------------------------------------------------------------------------- */
/* Participantes                                                               */
/* -------------------------------------------------------------------------- */

/** Proyeccion publica: sin notas internas. */
/**
 * Estado de la vinculacion con una cuenta de Clash Royale.
 *
 * `VERIFIED` existe en el tipo pero el sistema no lo asigna: comprobar la
 * propiedad de una cuenta exigiria `verifytoken`, que Supercell no documenta.
 * **Vincular no es verificar** y P-11 sigue abierta. Ver ADR 0015.
 */
export const clashLinkStatusSchema = z.enum(['UNVERIFIED', 'VERIFIED']);

export const publicPlayerSchema = z.object({
  id: z.string(),
  /** Nombre en la liga. Es el que manda en toda la interfaz. */
  displayName: z.string(),
  slug: z.string(),
  /**
   * Etiqueta de Clash Royale. **No es el nombre del jugador**: sirve para
   * cruzar datos externos, no para identificarlo ante nadie.
   */
  clashTag: z.string().nullable(),
  clashLinkStatus: clashLinkStatusSchema.nullable(),
  status: participantStatusSchema,
  slot: z.number().nullable(),
  avatarUrl: z.string().nullable(),
  replacedByPlayerId: z.string().nullable(),
  confirmedAt: nullableDate,
});

export const adminPlayerSchema = publicPlayerSchema.extend({
  notes: z.string().nullable(),
  createdAt: isoDate,
});

export const rosterSlotSchema = z.object({
  slot: z.number(),
  player: z.object({ id: z.string(), displayName: z.string() }).nullable(),
});

export const playersResponseSchema = z.object({
  summary: rosterSummarySchema,
  slots: z.array(rosterSlotSchema),
  players: z.array(publicPlayerSchema),
});

export const adminPlayersResponseSchema = z.object({
  summary: rosterSummarySchema,
  slots: z.array(rosterSlotSchema),
  players: z.array(adminPlayerSchema),
});

/* -------------------------------------------------------------------------- */
/* Partidos                                                                    */
/* -------------------------------------------------------------------------- */

export const matchSideSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  slug: z.string(),
});

/**
 * Resultado ya interpretado por el dominio.
 *
 * El frontend no calcula ganador ni puntos: los recibe.
 */
export const matchResultSchema = z.object({
  homeCrowns: z.number(),
  awayCrowns: z.number(),
  resolution: matchResolutionSchema,
  outcome: matchOutcomeSchema,
  victoryType: victoryTypeSchema,
  winnerId: z.string().nullable(),
  loserId: z.string().nullable(),
  /**
   * Puntos que reparte el resultado. `null` cuando el reglamento todavia no
   * define como se puntua (por ejemplo un walkover): la interfaz lo muestra
   * como pendiente en lugar de inventarlo.
   */
  points: z.object({ home: z.number(), away: z.number() }).nullable(),
  crownDiff: z.object({ home: z.number(), away: z.number() }),
  version: z.number(),
  verifiedAt: nullableDate,
});

export const streamSchema = z.object({
  url: z.string().nullable(),
  vodUrl: z.string().nullable(),
  platform: z.string().nullable(),
});

export const matchSchema = z.object({
  id: z.string(),
  order: z.number(),
  roundId: z.string(),
  roundNumber: z.number(),
  leg: z.number(),
  status: matchStatusSchema,
  scheduledAt: nullableDate,
  originalScheduledAt: nullableDate,
  postponementCount: z.number(),
  playedAt: nullableDate,
  stream: streamSchema,
  home: matchSideSchema,
  away: matchSideSchema,
  result: matchResultSchema.nullable(),
});

/**
 * Aplazamiento tal y como se publica: que paso, cuando y por que motivo
 * clasificado. El texto libre que lo acompana no sale de administracion.
 */
export const publicPostponementEntrySchema = z.object({
  event: postponementEventSchema,
  roundNumber: z.number(),
  previousScheduledAt: nullableDate,
  newScheduledAt: nullableDate,
  reason: postponementReasonSchema,
  occurredAt: isoDate,
});

export const postponementEntrySchema = publicPostponementEntrySchema.extend({
  notes: z.string(),
});

/**
 * Ficha publica de un partido.
 *
 * Deliberadamente recortada. Fuera quedan:
 *
 * - las notas del aplazamiento, escritas por administracion y a menudo sobre
 *   circunstancias personales de un participante;
 * - los reportes de los jugadores y sus URL de evidencia, de los que solo se
 *   publica cuantos hay;
 * - el texto que justifica una correccion. Que las correcciones se comuniquen
 *   publicamente, y como, es la regla P-10, todavia sin decidir: publicarlas
 *   ahora seria cerrarla por la puerta de atras.
 *
 * Lo que si es publico es que hubo una correccion y cuando, porque el marcador
 * cambio a la vista de todos y la tabla tiene que poder explicarse.
 */
export const matchDetailSchema = matchSchema.extend({
  history: z.object({
    postponements: z.array(publicPostponementEntrySchema),
    corrections: z.array(z.object({ revision: z.number(), changedAt: isoDate })),
    /** Cuantos reportes de jugador se recibieron. Quien reporto que, no. */
    reportCount: z.number(),
  }),
});

/** Ficha completa: solo detras de sesion administrativa. */
export const adminMatchDetailSchema = matchSchema.extend({
  /**
   * Que se puede hacer con este partido ahora mismo. Lo decide el dominio; el
   * panel ofrece exactamente esto y no deduce nada por su cuenta.
   */
  actions: z.object({
    allowedTransitions: z.array(matchStatusSchema),
    acceptsResult: z.boolean(),
    canCorrectResult: z.boolean(),
    canReschedule: z.boolean(),
    /** Cancelar no tiene vuelta atras: de CANCELLED no se sale. */
    canCancel: z.boolean(),
    canEditStream: z.boolean(),
    /**
     * Incomparecencia (R-09). `canDeclareFrom` dice desde que hora se puede,
     * que es lo util cuando todavia no se puede.
     */
    walkover: z.object({
      canDeclare: z.boolean(),
      canDeclareFrom: nullableDate,
      toleranceMinutes: z.number(),
    }),
  }),
  history: z.object({
    postponements: z.array(postponementEntrySchema),
    reports: z.array(
      z.object({
        playerId: z.string(),
        homeCrowns: z.number(),
        awayCrowns: z.number(),
        evidenceUrl: z.string().nullable(),
        reportedAt: isoDate,
      }),
    ),
    revisions: z.array(
      z.object({
        revision: z.number(),
        previousValue: z.unknown(),
        newValue: z.unknown(),
        reason: z.string(),
        changedAt: isoDate,
      }),
    ),
  }),
});

export const roundSchema = z.object({
  id: z.string(),
  number: z.number(),
  leg: z.number(),
  label: z.string().nullable(),
  scheduledAt: nullableDate,
});

export const roundWithMatchesSchema = roundSchema.extend({
  matches: z.array(matchSchema),
});

export const fixtureSchema = z.object({
  generated: z.boolean(),
  seed: z.string().nullable(),
  generatedAt: nullableDate,
  rounds: z.array(roundWithMatchesSchema),
});

/* -------------------------------------------------------------------------- */
/* Clasificacion                                                               */
/* -------------------------------------------------------------------------- */

export const standingsRowSchema = z.object({
  playerId: z.string(),
  displayName: z.string(),
  slug: z.string(),
  position: z.number(),
  unresolvedTie: z.boolean(),
  played: z.number(),
  wins: z.number(),
  losses: z.number(),
  draws: z.number(),
  maxCrownWins: z.number(),
  crownsFor: z.number(),
  crownsAgainst: z.number(),
  crownDiff: z.number(),
  matchPoints: z.number(),
  sanctionPoints: z.number(),
  sanctionCount: z.number(),
  points: z.number(),
  /** Ultimos resultados, del mas reciente al mas antiguo. */
  form: z.array(formResultSchema),
  currentStreak: z.object({ type: formResultSchema, length: z.number() }).nullable(),
  bestWinStreak: z.number(),
  /** Puestos ganados desde la jornada anterior. `null` = sin referencia. */
  positionChange: z.number().nullable(),
});

export const standingsSchema = z.object({
  rulesVersion: z.string(),
  tiebreakers: z.array(z.string()),
  columns: z.array(z.object({ key: z.string(), short: z.string(), long: z.string() })),
  /** Jornada hasta la que se calculo. `null` = todavia no se jugo nada. */
  upToRound: z.number().nullable(),
  rows: z.array(standingsRowSchema),
});

/* -------------------------------------------------------------------------- */
/* Sanciones                                                                   */
/* -------------------------------------------------------------------------- */

/** Proyeccion publica: sin evidencia ni observaciones internas. */
export const publicSanctionSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  playerName: z.string(),
  matchId: z.string().nullable(),
  roundNumber: z.number().nullable(),
  type: sanctionTypeSchema,
  points: z.number(),
  reason: z.string(),
  status: sanctionStatusSchema,
  issuedAt: isoDate,
  revokedAt: nullableDate,
});

export const adminSanctionSchema = publicSanctionSchema.extend({
  evidenceUrl: z.string().nullable(),
  notes: z.string().nullable(),
  revokedReason: z.string().nullable(),
});

/* -------------------------------------------------------------------------- */
/* Estadisticas                                                                */
/* -------------------------------------------------------------------------- */

export const statLeaderSchema = z.object({
  playerId: z.string(),
  displayName: z.string(),
  slug: z.string(),
  value: z.number(),
});

export const statsSchema = z.object({
  /** Cada metrica trae sus lideres empatados incluidos. */
  mostPoints: z.array(statLeaderSchema),
  mostWins: z.array(statLeaderSchema),
  bestCrownDiff: z.array(statLeaderSchema),
  mostCrowns: z.array(statLeaderSchema),
  mostMaxCrownWins: z.array(statLeaderSchema),
  bestWinStreak: z.array(statLeaderSchema),
  /** Metricas que dependen de una regla pendiente. */
  unavailable: z.array(z.object({ metric: z.string(), reason: z.string(), rule: z.string() })),
});

/* -------------------------------------------------------------------------- */
/* Auditoria y errores                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Que se puede cambiar del reglamento ahora mismo, y con que consecuencia.
 *
 * El panel lo consulta **antes** de ofrecer nada: cambiar la puntuacion a
 * mitad de temporada recalcula las jornadas ya jugadas, y eso hay que decirlo
 * antes, no despues.
 */
export const configurableParameterSchema = z.object({
  key: z.string(),
  label: z.string(),
  group: z.enum(['FORMAT', 'SCORING', 'OPERATIONAL']),
  editable: z.boolean(),
  lockedReason: z.string().nullable(),
  recalculatesStandings: z.boolean(),
});

export const configurableSettingsSchema = z.object({
  rulesVersion: z.string(),
  status: z.string(),
  parameters: z.array(configurableParameterSchema),
});

/** Que impide cerrar la temporada, con los partidos concretos. */
export const closureReportSchema = z.object({
  closeable: z.boolean(),
  blockers: z.array(
    z.object({ code: z.string(), count: z.number(), matchIds: z.array(z.string()) }),
  ),
  total: z.number(),
  completed: z.number(),
  cancelled: z.number(),
});

export const seasonSnapshotSummarySchema = z.object({
  id: z.string(),
  rulesVersion: z.string(),
  closedAt: isoDate,
  closedBy: z.string().nullable(),
  reason: z.string(),
  closedWithPending: z.boolean(),
  format: z.string(),
});

export const auditEntrySchema = z.object({
  id: z.number(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  payload: z.unknown(),
  createdAt: isoDate,
  /** `null` cuando la operacion la hizo el sistema y no una persona. */
  actor: z.string().nullable(),
  /** La peticion HTTP que la provoco. Cruza la entrada con sus registros. */
  requestId: z.string().nullable(),
});

/**
 * Lo que se puede filtrar, calculado sobre lo que hay registrado.
 *
 * No es la lista de constantes del codigo: es lo que de verdad ha ocurrido en
 * este torneo. Ofrecer veinte acciones que nunca pasaron solo entorpece.
 */
export const auditFacetsSchema = z.object({
  actions: z.array(z.object({ value: z.string(), total: z.number() })),
  actors: z.array(z.object({ id: z.string(), displayName: z.string() })),
  entityTypes: z.array(z.string()),
});

export const auditPageSchema = z.object({
  entries: z.array(auditEntrySchema),
  facets: auditFacetsSchema,
  /** Cuantas entradas caben como maximo en esta respuesta. */
  limit: z.number(),
});

/**
 * Metricas de operacion.
 *
 * Recuentos, no valoraciones: dicen cuantos partidos estan atascados, no si eso
 * es «mucho». El umbral lo pone quien lo lee.
 */
export const operationalMetricsSchema = z.object({
  generatedAt: isoDate,
  matches: z.object({
    total: z.number(),
    byStatus: z.record(z.string(), z.number()),
    /** Programados cuya fecha ya paso y siguen sin resultado. */
    overdue: z.number(),
    unscheduled: z.number(),
  }),
  attention: z.object({
    postponed: z.number(),
    disputed: z.number(),
    pendingCandidates: z.number(),
    battlesNeedingReview: z.number(),
  }),
  evidence: z.object({
    linkedPlayers: z.number(),
    syncedPlayers: z.number(),
    storedBattles: z.number(),
    confirmedCandidates: z.number(),
    lastSyncAt: nullableDate,
  }),
  audit: z.object({
    total: z.number(),
    last24h: z.number(),
    lastEntryAt: nullableDate,
  }),
});

/* -------------------------------------------------------------------------- */
/* Evolucion, cara a cara y records                                            */
/* -------------------------------------------------------------------------- */

/**
 * La tabla despues de cada jornada.
 *
 * Se recalcula con las reglas vigentes, no se lee de un archivo: por eso viaja
 * `rulesVersion`. Dos graficas con versiones distintas no son comparables.
 */
export const standingsHistorySchema = z.object({
  rulesVersion: z.string(),
  rounds: z.array(z.number()),
  players: z.array(
    z.object({
      playerId: z.string(),
      displayName: z.string(),
      slug: z.string(),
      points: z.array(
        z.object({
          round: z.number(),
          position: z.number(),
          points: z.number(),
          played: z.number(),
        }),
      ),
    }),
  ),
});

export const headToHeadSchema = z.object({
  players: z.array(z.object({ id: z.string(), displayName: z.string(), slug: z.string() })),
  played: z.number(),
  wins: z.tuple([z.number(), z.number()]),
  draws: z.number(),
  crowns: z.tuple([z.number(), z.number()]),
  leaderId: z.string().nullable(),
  matches: z.array(
    z.object({
      matchId: z.string(),
      roundNumber: z.number(),
      leg: z.number(),
      homeId: z.string(),
      homeCrowns: z.number(),
      awayCrowns: z.number(),
      winnerId: z.string().nullable(),
      walkover: z.boolean(),
    }),
  ),
});

/** `value: null` es «todavia no hay nada que contar», no cero. */
export const seasonRecordsSchema = z.object({
  rulesVersion: z.string(),
  records: z.array(
    z.object({
      code: z.string(),
      value: z.number().nullable(),
      matchId: z.string().nullable(),
      roundNumber: z.number().nullable(),
      players: z.array(z.object({ id: z.string(), displayName: z.string(), slug: z.string() })),
    }),
  ),
});

/**
 * Centro de accion.
 *
 * Lo que las metricas cuentan, enumerado. `kind` es un codigo estable; el texto
 * que ve el administrador lo pone el panel, porque cambiara mas veces que el
 * contrato.
 *
 * `since` es `null` a proposito cuando no hay una fecha honesta que dar: un
 * partido sin programar no lleva esperando desde ninguna hora concreta.
 */
export const attentionKindSchema = z.enum([
  'DISPUTED',
  'POSTPONED_WITHOUT_DATE',
  'OVERDUE',
  'LIVE',
  'UNSCHEDULED',
  'CANDIDATE_PENDING',
  'BATTLE_NEEDS_REVIEW',
]);

export const attentionItemSchema = z.object({
  kind: attentionKindSchema,
  matchId: z.string().nullable(),
  roundNumber: z.number().nullable(),
  label: z.string(),
  since: nullableDate,
  href: z.string(),
});

export const attentionReportSchema = z.object({
  generatedAt: isoDate,
  total: z.number(),
  byKind: z.record(attentionKindSchema, z.number()),
  items: z.array(attentionItemSchema),
});

/** Resultado de programar una jornada entera. */
export const roundScheduleResultSchema = z.object({
  roundNumber: z.number(),
  scheduled: z.number(),
  skipped: z.number(),
  matches: z.array(z.object({ id: z.string(), scheduledAt: isoDate })),
});

/**
 * Estado minimo de un partido para sondear.
 *
 * La revision sube cada vez que algo del partido cambia. Quien sondea compara
 * ese numero en vez de la ficha entera. Vive en memoria del servidor: un
 * reinicio la devuelve a cero, y el unico efecto es un refresco de mas.
 */
export const matchLiveStateSchema = z.object({
  id: z.string(),
  status: matchStatusSchema,
  result: matchResultSchema.nullable(),
  scheduledAt: nullableDate,
  playedAt: nullableDate,
  stream: streamSchema,
  revision: z.number(),
  fetchedAt: isoDate,
});

/**
 * Retransmision.
 *
 * `live` es lo unico que la interfaz necesita para decidir si enseña el aviso, y
 * solo es `true` cuando el canal emite Clash Royale **y** hay partidos de la liga
 * en juego. `reason` explica por que no, cuando no.
 *
 * `UNKNOWN` no es `OFFLINE`: si Kick no responde no se afirma que nadie esta
 * emitiendo, se dice que no se pudo comprobar.
 */
export const broadcastReasonSchema = z.enum([
  'LIVE',
  'CHANNEL_OFFLINE',
  'CHANNEL_OTHER_GAME',
  'NO_MATCHES_LIVE',
  'CHANNEL_UNKNOWN',
  'NOT_CONFIGURED',
]);

export const broadcastStatusSchema = z.object({
  live: z.boolean(),
  channel: z.object({
    name: z.string(),
    url: z.string(),
    state: z.enum(['LIVE', 'OFFLINE', 'UNKNOWN']),
    category: z.string().nullable(),
    playingClashRoyale: z.boolean(),
    title: z.string().nullable(),
    startedAt: nullableDate,
    checkedAt: isoDate,
  }),
  matches: z.array(
    z.object({
      id: z.string(),
      roundNumber: z.number(),
      home: z.string(),
      away: z.string(),
    }),
  ),
  reason: broadcastReasonSchema,
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  requestId: z.string(),
});

/* -------------------------------------------------------------------------- */
/* Tipos                                                                       */
/* -------------------------------------------------------------------------- */

export type TournamentStatus = z.infer<typeof tournamentStatusSchema>;
export type MatchStatus = z.infer<typeof matchStatusSchema>;
export type ParticipantStatus = z.infer<typeof participantStatusSchema>;
export type MatchResolution = z.infer<typeof matchResolutionSchema>;
export type MatchOutcome = z.infer<typeof matchOutcomeSchema>;
export type VictoryType = z.infer<typeof victoryTypeSchema>;
export type SanctionType = z.infer<typeof sanctionTypeSchema>;
export type SanctionStatus = z.infer<typeof sanctionStatusSchema>;
export type FormResult = z.infer<typeof formResultSchema>;
export type PostponementReason = z.infer<typeof postponementReasonSchema>;

export type FormatSummary = z.infer<typeof formatSummarySchema>;
export type TournamentOverview = z.infer<typeof tournamentOverviewSchema>;
export type Rules = z.infer<typeof rulesSchema>;
/* -------------------------------------------------------------------------- */
/* Evidencia externa (Fase 3)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Datos observados en Clash Royale.
 *
 * Nada de esto es un resultado oficial. Es evidencia: la liga sigue siendo la
 * fuente de verdad del torneo, y su motor la unica cosa que reparte puntos.
 */

export const externalCardSchema = z.object({
  cardId: z.number(),
  name: z.string(),
  level: z.number().nullable(),
  evolutionLevel: z.number().nullable(),
  starLevel: z.number().nullable().optional(),
  iconUrl: z.string().nullable().optional(),
});

export const externalBattleSideSchema = z.object({
  clashTag: z.string(),
  clashName: z.string().nullable(),
  crowns: z.number(),
  deck: z.array(externalCardSchema),
  supportCards: z.array(externalCardSchema).optional(),
});

/** Evidencia publicable de un partido: solo de un candidato confirmado. */
export const matchEvidenceSchema = z.object({
  battleId: z.string(),
  candidateStatus: z.literal('CONFIRMED'),
  confidence: z.number(),
  battleTime: isoDate,
  battleType: z.string(),
  gameModeName: z.string().nullable(),
  arenaName: z.string().nullable(),
  deckSelection: z.string().nullable(),
  home: externalBattleSideSchema.nullable(),
  away: externalBattleSideSchema.nullable(),
});

export const candidateStatusSchema = z.enum(['PENDING', 'NEEDS_REVIEW', 'CONFIRMED', 'REJECTED']);

/**
 * Un candidato, tal y como lo ve el panel.
 *
 * `confidence` ordena la cola de revision. **No autoriza nada**: un 100 exige
 * la misma confirmacion humana que un 40.
 */
export const battleCandidateSchema = z.object({
  id: z.string(),
  status: candidateStatusSchema,
  confidence: z.number(),
  /** Codigos de por que se propuso. */
  reasons: z.array(z.string()),
  /** Codigos de lo que no encaja. */
  ambiguities: z.array(z.string()),
  detectedAt: isoDate,
  resolvedAt: nullableDate,
  resolvedBy: z.string().nullable(),
  resolutionNote: z.string().nullable(),
  match: z.object({
    id: z.string(),
    roundNumber: z.number(),
    status: matchStatusSchema,
    scheduledAt: nullableDate,
    homeName: z.string(),
    awayName: z.string(),
  }),
  battle: z.object({
    id: z.string(),
    battleTime: isoDate,
    battleType: z.string(),
    gameModeName: z.string().nullable(),
    arenaName: z.string().nullable(),
    deckSelection: z.string().nullable(),
    needsReview: z.boolean(),
    home: externalBattleSideSchema.nullable(),
    away: externalBattleSideSchema.nullable(),
  }),
});

export const clashLinkSchema = z.object({
  playerId: z.string(),
  displayName: z.string(),
  clashTag: z.string().nullable(),
  clashName: z.string().nullable(),
  linkStatus: clashLinkStatusSchema.nullable(),
  linkedAt: nullableDate,
  syncedAt: nullableDate,
});

/** Resultado de traer el historial de un participante. */
export const syncReportSchema = z.object({
  playerId: z.string(),
  clashTag: z.string(),
  /** Cuantas entradas devolvio la API. No se asume ningun tope. */
  fetched: z.number(),
  imported: z.number(),
  duplicates: z.number(),
  conflicts: z.number(),
  skipped: z.record(z.string(), z.number()),
  candidatesCreated: z.number(),
  syncedAt: isoDate,
});

export const cardSyncReportSchema = z.object({
  cards: z.number(),
  supportCards: z.number(),
  total: z.number(),
  syncedAt: isoDate,
});

/* -------------------------------------------------------------------------- */
/* Estadisticas (Fase 4)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * De donde sale un numero.
 *
 * `OFFICIAL` se deriva del dominio y decide la clasificacion. `OBSERVED` viene
 * de Clash Royale: es evidencia parcial y **siempre** viaja con el tamaño de la
 * muestra. Los dos no se mezclan en ninguna respuesta.
 */
export const statisticSourceSchema = z.enum(['OFFICIAL', 'OBSERVED']);

/** Rendimiento en una condicion: como local o como visitante. */
export const officialSplitSchema = z.object({
  played: z.number(),
  wins: z.number(),
  losses: z.number(),
  crownsFor: z.number(),
  crownsAgainst: z.number(),
  points: z.number(),
  /** `null` cuando no jugo en esa condicion. Cero significaria otra cosa. */
  winRate: z.number().nullable(),
});

export const officialPlayerStatisticsSchema = z.object({
  source: z.literal('OFFICIAL'),
  playerId: z.string(),
  displayName: z.string(),
  slug: z.string(),

  played: z.number(),
  wins: z.number(),
  losses: z.number(),
  draws: z.number(),

  /** `null` sin partidos jugados: un 0 % diria «lo intento y fallo siempre». */
  winRate: z.number().nullable(),
  maxCrownWins: z.number(),
  maxCrownWinRate: z.number().nullable(),

  /*
    Incomparecencias. A favor = no apareció el rival; en contra = no apareció
    este participante. No son victorias ni derrotas normales, y sus coronas no
    entran en las medias: no hubo batalla que promediar.
  */
  walkoversFor: z.number(),
  walkoversAgainst: z.number(),

  crownsFor: z.number(),
  crownsAgainst: z.number(),
  crownDiff: z.number(),
  averageCrownsFor: z.number().nullable(),
  averageCrownsAgainst: z.number().nullable(),

  matchPoints: z.number(),
  sanctionPoints: z.number(),
  points: z.number(),

  currentStreak: z.object({ type: z.enum(['W', 'L', 'D']), length: z.number() }).nullable(),
  bestWinStreak: z.number(),
  worstLossStreak: z.number(),

  home: officialSplitSchema,
  away: officialSplitSchema,
});

export const statisticLeaderboardSchema = z.object({
  metric: z.string(),
  label: z.string(),
  value: z.number().nullable(),
  /** Todos los empatados en el primer puesto, nunca uno arbitrario. */
  leaders: z.array(z.object({ slug: z.string(), displayName: z.string() })),
  lowerIsBetter: z.boolean(),
});

/**
 * Actividad de la temporada.
 *
 * Aplazados y disputados van en su propia casilla: sumarlos a «completados»
 * seria la forma mas silenciosa de mentir.
 */
export const seasonActivitySchema = z.object({
  total: z.number(),
  completed: z.number(),
  scheduled: z.number(),
  live: z.number(),
  postponed: z.number(),
  disputed: z.number(),
  cancelled: z.number(),
  postponementEvents: z.number(),
});

export const seasonStatisticsSchema = z.object({
  source: z.literal('OFFICIAL'),
  players: z.array(officialPlayerStatisticsSchema),
  leaderboards: z.array(statisticLeaderboardSchema),
  activity: seasonActivitySchema,
});

/** Una entrada del historial. Sin resultado mientras el partido no cuente. */
export const playerMatchRowSchema = z.object({
  matchId: z.string(),
  roundNumber: z.number(),
  scheduledAt: nullableDate,
  opponentName: z.string(),
  opponentSlug: z.string(),
  isHome: z.boolean(),
  status: matchStatusSchema,
  crownsFor: z.number().nullable(),
  crownsAgainst: z.number().nullable(),
  points: z.number().nullable(),
  outcome: z.enum(['W', 'L', 'D']).nullable(),
});

export const playerStatisticsSchema = z.object({
  statistics: officialPlayerStatisticsSchema,
  history: z.array(playerMatchRowSchema),
});

/* --------------------------- Observadas ---------------------------------- */

/**
 * Envoltorio de todo dato observado.
 *
 * `sampleSize` no es opcional: sin el, «usa esta carta el 100 % de las veces»
 * puede significar cualquier cosa.
 */
const observedEnvelope = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    source: z.literal('OBSERVED'),
    provider: z.string(),
    sampleSize: z.number(),
    value,
  });

export const cardUsageSchema = z.object({
  cardId: z.number(),
  name: z.string(),
  rarity: z.string().nullable(),
  elixirCost: z.number().nullable(),
  iconUrl: z.string().nullable(),
  /** En cuantos mazos observados aparece. */
  appearances: z.number(),
  evolutions: z.number(),
  players: z.number(),
});

export const observedCardStatisticsSchema = observedEnvelope(
  z.object({
    cards: z.array(cardUsageSchema),
    sampleSize: z.number(),
    battles: z.number(),
  }),
);

/**
 * El rival de una batalla observada.
 *
 * Si juega la liga se le nombra: su tag ya es publico porque lo declaro al
 * inscribirse. Si no, se publica el tag enmascarado y nada mas —nadie le pidio
 * permiso para aparecer aqui—.
 */
export const observedOpponentSchema = z.object({
  isParticipant: z.boolean(),
  /** Solo si juega la liga. */
  displayName: z.string().nullable(),
  slug: z.string().nullable(),
  /** Completo si es participante; enmascarado en cualquier otro caso. */
  tag: z.string(),
});

export const observedDeckSchema = z.object({
  battleId: z.string(),
  battleTime: isoDate,
  battleType: z.string(),
  opponent: observedOpponentSchema.nullable(),
  cards: z.array(
    z.object({
      cardId: z.number(),
      name: z.string(),
      level: z.number().nullable(),
      evolutionLevel: z.number().nullable(),
      iconUrl: z.string().nullable(),
    }),
  ),
  /** `null` si el catalogo no conoce el coste de las ocho cartas. */
  averageElixir: z.number().nullable(),
});

export const observedPlayerDecksSchema = observedEnvelope(
  z.object({ decks: z.array(observedDeckSchema) }),
);

export type PublicPlayer = z.infer<typeof publicPlayerSchema>;
export type StatisticSource = z.infer<typeof statisticSourceSchema>;
export type OfficialSplit = z.infer<typeof officialSplitSchema>;
export type OfficialPlayerStatistics = z.infer<typeof officialPlayerStatisticsSchema>;
export type StatisticLeaderboard = z.infer<typeof statisticLeaderboardSchema>;
export type SeasonActivity = z.infer<typeof seasonActivitySchema>;
export type SeasonStatistics = z.infer<typeof seasonStatisticsSchema>;
export type PlayerMatchRow = z.infer<typeof playerMatchRowSchema>;
export type PlayerStatistics = z.infer<typeof playerStatisticsSchema>;
export type CardUsage = z.infer<typeof cardUsageSchema>;
export type ObservedCardStatistics = z.infer<typeof observedCardStatisticsSchema>;
export type ObservedOpponent = z.infer<typeof observedOpponentSchema>;
export type ObservedDeck = z.infer<typeof observedDeckSchema>;
export type ObservedPlayerDecks = z.infer<typeof observedPlayerDecksSchema>;

export type ClashLinkStatus = z.infer<typeof clashLinkStatusSchema>;
export type ExternalCard = z.infer<typeof externalCardSchema>;
export type ExternalBattleSide = z.infer<typeof externalBattleSideSchema>;
export type MatchEvidence = z.infer<typeof matchEvidenceSchema>;
export type CandidateStatus = z.infer<typeof candidateStatusSchema>;
export type BattleCandidate = z.infer<typeof battleCandidateSchema>;
export type ClashLink = z.infer<typeof clashLinkSchema>;
export type SyncReport = z.infer<typeof syncReportSchema>;
export type CardSyncReport = z.infer<typeof cardSyncReportSchema>;
export type AdminPlayer = z.infer<typeof adminPlayerSchema>;
export type PlayersResponse = z.infer<typeof playersResponseSchema>;
export type AdminPlayersResponse = z.infer<typeof adminPlayersResponseSchema>;
export type MatchSide = z.infer<typeof matchSideSchema>;
export type MatchResultView = z.infer<typeof matchResultSchema>;
export type Match = z.infer<typeof matchSchema>;
export type MatchDetail = z.infer<typeof matchDetailSchema>;
export type AdminMatchDetail = z.infer<typeof adminMatchDetailSchema>;
export type PostponementEntry = z.infer<typeof postponementEntrySchema>;
export type PublicPostponementEntry = z.infer<typeof publicPostponementEntrySchema>;
export type Round = z.infer<typeof roundSchema>;
export type RoundWithMatches = z.infer<typeof roundWithMatchesSchema>;
export type Fixture = z.infer<typeof fixtureSchema>;
export type StandingsRow = z.infer<typeof standingsRowSchema>;
export type Standings = z.infer<typeof standingsSchema>;
export type PublicSanction = z.infer<typeof publicSanctionSchema>;
export type AdminSanction = z.infer<typeof adminSanctionSchema>;
export type StatLeader = z.infer<typeof statLeaderSchema>;
export type Stats = z.infer<typeof statsSchema>;
export type ConfigurableParameter = z.infer<typeof configurableParameterSchema>;
export type ConfigurableSettings = z.infer<typeof configurableSettingsSchema>;
export type ClosureReport = z.infer<typeof closureReportSchema>;
export type SeasonSnapshotSummary = z.infer<typeof seasonSnapshotSummarySchema>;
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type AuditFacets = z.infer<typeof auditFacetsSchema>;
export type AuditPage = z.infer<typeof auditPageSchema>;
export type StandingsHistory = z.infer<typeof standingsHistorySchema>;
export type HeadToHead = z.infer<typeof headToHeadSchema>;
export type SeasonRecords = z.infer<typeof seasonRecordsSchema>;
export type MatchLiveState = z.infer<typeof matchLiveStateSchema>;
export type BroadcastReason = z.infer<typeof broadcastReasonSchema>;
export type BroadcastStatus = z.infer<typeof broadcastStatusSchema>;
export type OperationalMetrics = z.infer<typeof operationalMetricsSchema>;
export type AttentionKind = z.infer<typeof attentionKindSchema>;
export type AttentionItem = z.infer<typeof attentionItemSchema>;
export type AttentionReport = z.infer<typeof attentionReportSchema>;
export type RoundScheduleResult = z.infer<typeof roundScheduleResultSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

/* -------------------------------------------------------------------------- */
/* Sesion                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Nombre de la cookie de sesion administrativa.
 *
 * Vive en el contrato porque la conocen los dos extremos: la API la emite y el
 * servidor del frontend la reenvia. Una sola definicion evita que se
 * desincronicen.
 */
export const SESSION_COOKIE = 'liga_admin_session';

export const sessionUserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string(),
  role: z.string(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;
