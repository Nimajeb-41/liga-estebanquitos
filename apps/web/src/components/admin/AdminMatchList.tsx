/**
 * Listado administrativo de partidos.
 *
 * Denso a propósito: durante una jornada lo que hace falta es llegar rápido al
 * partido correcto, no admirar el diseño. Filtra por estado y por jornada.
 */

import type { Match, MatchStatus } from '@liga/contracts';
import { useMemo, useState } from 'react';

import { formatDateTime, matchStatusLabel, roundLabel } from '../../lib/presentation.ts';
import { MatchStatusBadge } from '../matches/MatchStatus.tsx';
import { EmptyState } from '../ui/primitives.tsx';

type Filter = 'ALL' | 'PENDING' | MatchStatus;

const FILTERS: readonly Filter[] = [
  'ALL',
  'PENDING',
  'LIVE',
  'DISPUTED',
  'POSTPONED',
  'SCHEDULED',
  'COMPLETED',
];

function label(filter: Filter): string {
  if (filter === 'ALL') return 'Todos';
  if (filter === 'PENDING') return 'Requieren atención';
  return matchStatusLabel(filter);
}

/** Los que piden una decisión: en juego, en disputa o aplazados. */
function needsAttention(match: Match): boolean {
  return match.status === 'LIVE' || match.status === 'DISPUTED' || match.status === 'POSTPONED';
}

export function AdminMatchList({ matches }: { matches: readonly Match[] }) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [round, setRound] = useState<number | 'ALL'>('ALL');
  const [query, setQuery] = useState('');

  const rounds = useMemo(
    () => [...new Set(matches.map((match) => match.roundNumber))].sort((a, b) => a - b),
    [matches],
  );

  const counts = useMemo(() => {
    const map = new Map<Filter, number>([
      ['ALL', matches.length],
      ['PENDING', matches.filter(needsAttention).length],
    ]);
    for (const match of matches) map.set(match.status, (map.get(match.status) ?? 0) + 1);
    return map;
  }, [matches]);

  const term = query.trim().toLowerCase();
  const visible = matches
    .filter((match) =>
      filter === 'ALL'
        ? true
        : filter === 'PENDING'
          ? needsAttention(match)
          : match.status === filter,
    )
    .filter((match) => round === 'ALL' || match.roundNumber === round)
    .filter(
      (match) =>
        term === '' ||
        match.home.displayName.toLowerCase().includes(term) ||
        match.away.displayName.toLowerCase().includes(term),
    )
    .sort((left, right) => left.roundNumber - right.roundNumber || left.order - right.order);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.filter(
          (entry) => entry === 'ALL' || entry === 'PENDING' || (counts.get(entry) ?? 0) > 0,
        ).map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setFilter(entry)}
            aria-pressed={filter === entry}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
              filter === entry
                ? 'border-cyan/50 bg-cyan/10 text-cyan'
                : 'border-line text-muted hover:border-line-strong hover:text-ink'
            }`}
          >
            {label(entry)}
            <span className="font-mono text-[10px] text-faint">{counts.get(entry) ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="buscar-jugador" className="sr-only">
          Buscar por jugador
        </label>
        <input
          id="buscar-jugador"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por jugador"
          className="min-h-9 w-52 rounded-md border border-line bg-elevated px-3 text-xs text-ink placeholder:text-faint focus:border-cyan focus:outline-none"
        />
        <label htmlFor="filtro-jornada" className="sr-only">
          Jornada
        </label>
        <select
          id="filtro-jornada"
          value={round === 'ALL' ? '' : String(round)}
          onChange={(event) =>
            setRound(event.target.value === '' ? 'ALL' : Number(event.target.value))
          }
          className="min-h-9 rounded-md border border-line bg-elevated px-2 text-xs text-ink"
        >
          <option value="">Todas las jornadas</option>
          {rounds.map((number) => (
            <option key={number} value={number}>
              {roundLabel(number)}
            </option>
          ))}
        </select>
        <span role="status" className="text-xs text-muted">
          {visible.length} {visible.length === 1 ? 'partido' : 'partidos'}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Ningún partido con esos filtros" />
      ) : (
        <div className="relative overflow-x-auto rounded-panel border border-line">
          <table className="w-full min-w-[42rem] border-collapse text-sm">
            <caption className="sr-only">Partidos del torneo, para administración</caption>
            <thead>
              <tr className="border-b border-line bg-elevated text-[11px] tracking-[0.1em] text-faint uppercase">
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Jornada
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Partido
                </th>
                <th scope="col" className="px-3 py-2.5 text-center font-medium">
                  Marcador
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Fecha
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((match) => (
                <tr key={match.id} className="border-b border-line/60 hover:bg-elevated/60">
                  <th
                    scope="row"
                    className="px-3 py-2.5 text-left font-mono text-xs font-normal text-faint"
                  >
                    {String(match.roundNumber).padStart(2, '0')}
                  </th>
                  <td className="px-3 py-2.5">
                    <a
                      href={`/admin/matches/${match.id}`}
                      className="font-medium text-ink transition-colors hover:text-cyan"
                    >
                      {match.home.displayName} <span className="text-faint">vs</span>{' '}
                      {match.away.displayName}
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono">
                    {match.result === null || match.status === 'POSTPONED'
                      ? '—'
                      : `${match.result.homeCrowns}–${match.result.awayCrowns}`}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-faint">
                    {formatDateTime(match.scheduledAt)}
                    {match.postponementCount > 0 ? (
                      <span className="ml-1.5 text-warning">·{match.postponementCount} aplaz.</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <MatchStatusBadge status={match.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
