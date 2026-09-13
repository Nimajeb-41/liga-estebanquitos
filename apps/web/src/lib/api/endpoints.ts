/**
 * Endpoints tipados.
 *
 * Cada función valida la respuesta contra `@liga/contracts` antes de
 * devolverla: si el backend cambia una forma sin actualizar el contrato, la
 * página falla aquí, con un mensaje claro, en vez de romperse a mitad de
 * renderizado.
 *
 * Solo se usa desde el servidor (páginas Astro y endpoints propios).
 */

import {
  adminMatchDetailSchema,
  adminPlayersResponseSchema,
  adminSanctionSchema,
  attentionReportSchema,
  broadcastStatusSchema,
  auditEntrySchema,
  auditPageSchema,
  closureReportSchema,
  configurableSettingsSchema,
  seasonSnapshotSummarySchema,
  operationalMetricsSchema,
  fixtureSchema,
  matchDetailSchema,
  matchLiveStateSchema,
  matchSchema,
  playersResponseSchema,
  battleCandidateSchema,
  clashLinkSchema,
  matchEvidenceSchema,
  observedCardStatisticsSchema,
  observedPlayerDecksSchema,
  playerStatisticsSchema,
  publicPlayerSchema,
  seasonStatisticsSchema,
  publicSanctionSchema,
  roundSchema,
  roundWithMatchesSchema,
  rulesSchema,
  standingsSchema,
  standingsHistorySchema,
  headToHeadSchema,
  seasonRecordsSchema,
  statsSchema,
  tournamentOverviewSchema,
  type AdminMatchDetail,
  type AdminPlayersResponse,
  type AdminSanction,
  type AttentionReport,
  type BroadcastStatus,
  type AuditEntry,
  type AuditPage,
  type ClosureReport,
  type ConfigurableSettings,
  type SeasonSnapshotSummary,
  type OperationalMetrics,
  type Fixture,
  type Match,
  type MatchDetail,
  type MatchLiveState,
  type PlayersResponse,
  type BattleCandidate,
  type ClashLink,
  type MatchEvidence,
  type ObservedCardStatistics,
  type ObservedPlayerDecks,
  type PlayerStatistics,
  type PublicPlayer,
  type SeasonStatistics,
  type PublicSanction,
  type Round,
  type RoundWithMatches,
  type Rules,
  type Standings,
  type StandingsHistory,
  type HeadToHead,
  type SeasonRecords,
  type Stats,
  type TournamentOverview,
} from '@liga/contracts';
import { z } from 'zod';

import { ContractError, request, type RequestOptions } from './client.ts';

export { ContractError };

async function get<T>(path: string, schema: z.ZodType<T>, options?: RequestOptions): Promise<T> {
  const payload = await request<unknown>(path, options);
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ContractError(
      path,
      result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n'),
    );
  }
  return result.data;
}

export type SessionOptions = { readonly cookie?: string | undefined };

/* ------------------------------- Público -------------------------------- */

export const getTournament = (options?: SessionOptions): Promise<TournamentOverview> =>
  get('/api/v1/tournament', tournamentOverviewSchema, options);

export const getRules = (options?: SessionOptions): Promise<Rules> =>
  get('/api/v1/rules', rulesSchema, options);

export const getPlayers = (options?: SessionOptions): Promise<PlayersResponse> =>
  get('/api/v1/players', playersResponseSchema, options);

/** Acepta el identificador o el slug: las URL publicas usan el slug. */
export const getPlayer = (id: string, options?: SessionOptions): Promise<PublicPlayer> =>
  get(`/api/v1/players/${encodeURIComponent(id)}`, publicPlayerSchema, options);

/* ------------------------------ Estadisticas ------------------------------ */

/**
 * Estadisticas de la temporada.
 *
 * Todas oficiales. Lo observado en Clash Royale se pide aparte, a proposito:
 * asi no hay forma de mezclarlas por descuido.
 */
export const getSeasonStatistics = (options?: SessionOptions): Promise<SeasonStatistics> =>
  get('/api/v1/statistics', seasonStatisticsSchema, options);

export const getPlayerStatistics = (
  id: string,
  options?: SessionOptions,
): Promise<PlayerStatistics> =>
  get(`/api/v1/players/${encodeURIComponent(id)}/statistics`, playerStatisticsSchema, options);

/** Uso de cartas **en las batallas observadas**, no en todas las que jugaron. */
export const getObservedCards = (options?: SessionOptions): Promise<ObservedCardStatistics> =>
  get('/api/v1/cards', observedCardStatisticsSchema, options);

export const getObservedDecks = (
  id: string,
  options?: SessionOptions,
): Promise<ObservedPlayerDecks> =>
  get(`/api/v1/players/${encodeURIComponent(id)}/decks`, observedPlayerDecksSchema, options);

/* ---------------------- Integracion con Clash Royale ---------------------- */

/**
 * Evidencia externa de un partido.
 *
 * Devuelve `null` mientras no haya un candidato confirmado. Una sospecha sin
 * resolver no llega al publico: se leeria como resultado.
 */
export const getMatchEvidence = (
  id: string,
  options?: SessionOptions,
): Promise<MatchEvidence | null> =>
  get(
    `/api/v1/matches/${encodeURIComponent(id)}/evidence`,
    matchEvidenceSchema.nullable(),
    options,
  );

/** Cola de candidatos. Exige sesion administrativa. */
export const getCandidates = (
  options: SessionOptions & { status?: string } = {},
): Promise<BattleCandidate[]> => {
  const query = options.status === undefined ? '' : `?status=${options.status}`;
  return get(
    `/api/v1/admin/clash-royale/candidates${query}`,
    z.array(battleCandidateSchema),
    options,
  );
};

/** Vinculaciones de los participantes con sus cuentas de Clash Royale. */
export const getClashLinks = (options?: SessionOptions): Promise<ClashLink[]> =>
  get('/api/v1/admin/clash-royale/links', z.array(clashLinkSchema), options);

export const getFixture = (options?: SessionOptions): Promise<Fixture> =>
  get('/api/v1/fixture', fixtureSchema, options);

export const getRounds = (options?: SessionOptions): Promise<Round[]> =>
  get('/api/v1/rounds', z.array(roundSchema), options);

export const getRound = (
  round: string | number,
  options?: SessionOptions,
): Promise<RoundWithMatches> => get(`/api/v1/rounds/${round}`, roundWithMatchesSchema, options);

export const getMatches = (options?: SessionOptions): Promise<Match[]> =>
  get('/api/v1/matches', z.array(matchSchema), options);

export const getMatch = (id: string, options?: SessionOptions): Promise<MatchDetail> =>
  get(`/api/v1/matches/${id}`, matchDetailSchema, options);

/** Estado minimo para sondear, con la revision que evita repintar de balde. */
export const getMatchLiveState = (id: string, options?: SessionOptions): Promise<MatchLiveState> =>
  get(`/api/v1/matches/${id}/live`, matchLiveStateSchema, options);

export const getStandings = (
  options?: SessionOptions & { upToRound?: number },
): Promise<Standings> => {
  const query = options?.upToRound === undefined ? '' : `?upToRound=${options.upToRound}`;
  return get(`/api/v1/standings${query}`, standingsSchema, options);
};

/** La tabla despues de cada jornada. Se recalcula; no es una foto de archivo. */
export const getStandingsHistory = (options?: SessionOptions): Promise<StandingsHistory> =>
  get('/api/v1/standings/history', standingsHistorySchema, options);

export const getSeasonRecords = (options?: SessionOptions): Promise<SeasonRecords> =>
  get('/api/v1/records', seasonRecordsSchema, options);

export const getHeadToHead = (
  a: string,
  b: string,
  options?: SessionOptions,
): Promise<HeadToHead> =>
  get(
    `/api/v1/head-to-head/${encodeURIComponent(a)}/${encodeURIComponent(b)}`,
    headToHeadSchema,
    options,
  );

/** Si hay directo de verdad: canal emitiendo Clash Royale y partidos en juego. */
export const getBroadcast = (options?: SessionOptions): Promise<BroadcastStatus> =>
  get('/api/v1/broadcast', broadcastStatusSchema, options);

export const getStats = (options?: SessionOptions): Promise<Stats> =>
  get('/api/v1/stats', statsSchema, options);

export const getSanctions = (options?: SessionOptions): Promise<PublicSanction[]> =>
  get('/api/v1/sanctions', z.array(publicSanctionSchema), options);

/* ---------------------------- Administración ---------------------------- */

export const getAdminPlayers = (options: SessionOptions): Promise<AdminPlayersResponse> =>
  get('/api/v1/admin/players', adminPlayersResponseSchema, options);

/** Ficha completa de un partido: notas, reportes y motivos de correccion. */
export const getAdminMatch = (id: string, options: SessionOptions): Promise<AdminMatchDetail> =>
  get(`/api/v1/admin/matches/${id}`, adminMatchDetailSchema, options);

export const getAdminSanctions = (options: SessionOptions): Promise<AdminSanction[]> =>
  get('/api/v1/admin/sanctions', z.array(adminSanctionSchema), options);

export const getAuditLog = (options: SessionOptions): Promise<AuditEntry[]> =>
  get('/api/v1/admin/audit', z.array(auditEntrySchema), options);

/**
 * Auditoría filtrada, con las opciones de filtro que existen de verdad.
 *
 * Los filtros viajan a la API y se aplican en la base de datos. Traerse el
 * registro entero para filtrarlo en el navegador enviaría de paso los motivos
 * de cada corrección y las notas internas de cada aplazamiento.
 */
export const getAuditPage = (
  filters: Readonly<Record<string, string>>,
  options: SessionOptions,
): Promise<AuditPage> => {
  const query = new URLSearchParams({ ...filters, facets: 'true' });
  return get(`/api/v1/admin/audit?${query.toString()}`, auditPageSchema, options);
};

/* ------------------------- Temporada (Fase 5) -------------------------- */

/** Que se puede cambiar del reglamento ahora, y con que consecuencia. */
export const getConfigurableSettings = (options: SessionOptions): Promise<ConfigurableSettings> =>
  get('/api/v1/admin/tournament/settings', configurableSettingsSchema, options);

/** Que impide cerrar la temporada. Se consulta sin cerrar nada. */
export const getClosureReport = (options: SessionOptions): Promise<ClosureReport> =>
  get('/api/v1/admin/tournament/closure', closureReportSchema, options);

export const getSeasonSnapshots = (options: SessionOptions): Promise<SeasonSnapshotSummary[]> =>
  get('/api/v1/admin/tournament/snapshots', z.array(seasonSnapshotSummarySchema), options);

export const getAttention = (options: SessionOptions): Promise<AttentionReport> =>
  get('/api/v1/admin/attention', attentionReportSchema, options);

export const getMetrics = (options: SessionOptions): Promise<OperationalMetrics> =>
  get('/api/v1/admin/metrics', operationalMetricsSchema, options);

export const getCurrentAdmin = (
  options: SessionOptions,
): Promise<{ id: string; displayName: string; email: string; role: string }> =>
  get(
    '/api/v1/auth/me',
    z.object({ id: z.string(), displayName: z.string(), email: z.string(), role: z.string() }),
    options,
  );

/** Reenvía una acción administrativa a la API con la sesión del navegador. */
export const adminAction = <T = unknown>(
  path: string,
  body: unknown,
  options: SessionOptions & { method?: 'POST' | 'PATCH' | 'DELETE' },
): Promise<T> =>
  request<T>(path, {
    method: options.method ?? 'POST',
    body,
    cookie: options.cookie,
  });
