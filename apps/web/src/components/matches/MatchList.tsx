/**
 * Listado de partidos con filtros.
 *
 * Filtrar es una operación de vista: se queda con un subconjunto de lo que
 * devolvió la API y no cambia ningún dato. El orden por jornada y turno es el
 * del calendario.
 */

import type { Match, MatchStatus } from '@liga/contracts';
import { useMemo, useState } from 'react';

import { matchStatusLabel, roundLabel } from '../../lib/presentation.ts';
import { EmptyState } from '../ui/primitives.tsx';
import { MatchCard } from './MatchCard.tsx';

type Filter = 'ALL' | MatchStatus;

const FILTERS: readonly Filter[] = [
  'ALL',
  'LIVE',
  'SCHEDULED',
  'COMPLETED',
  'POSTPONED',
  'DISPUTED',
];

function label(filter: Filter): string {
  return filter === 'ALL' ? 'Todos' : matchStatusLabel(filter);
}

export function MatchList({ matches }: { matches: readonly Match[] }) {
  const [status, setStatus] = useState<Filter>('ALL');
  const [round, setRound] = useState<number | 'ALL'>('ALL');

  const rounds = useMemo(
    () => [...new Set(matches.map((match) => match.roundNumber))].sort((a, b) => a - b),
    [matches],
  );

  const counts = useMemo(() => {
    const map = new Map<Filter, number>([['ALL', matches.length]]);
    for (const match of matches) {
      map.set(match.status, (map.get(match.status) ?? 0) + 1);
    }
    return map;
  }, [matches]);

  const visible = matches
    .filter((match) => status === 'ALL' || match.status === status)
    .filter((match) => round === 'ALL' || match.roundNumber === round)
    .sort((left, right) => left.roundNumber - right.roundNumber || left.order - right.order);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium tracking-[0.12em] text-faint uppercase">
          Estado
        </span>
        {FILTERS.filter((filter) => filter === 'ALL' || (counts.get(filter) ?? 0) > 0).map(
          (filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatus(filter)}
              aria-pressed={status === filter}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
                status === filter
                  ? 'border-cyan/50 bg-cyan/10 text-cyan'
                  : 'border-line text-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              {label(filter)}
              <span className="font-mono text-[10px] text-faint">{counts.get(filter) ?? 0}</span>
            </button>
          ),
        )}
      </div>

      {rounds.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium tracking-[0.12em] text-faint uppercase">
            Jornada
          </span>
          <button
            type="button"
            onClick={() => setRound('ALL')}
            aria-pressed={round === 'ALL'}
            className={`inline-flex min-h-9 items-center rounded-md border px-3 text-xs font-medium transition-colors ${
              round === 'ALL'
                ? 'border-cyan/50 bg-cyan/10 text-cyan'
                : 'border-line text-muted hover:border-line-strong hover:text-ink'
            }`}
          >
            Todas
          </button>
          {rounds.map((number) => (
            <button
              key={number}
              type="button"
              onClick={() => setRound(number)}
              aria-pressed={round === number}
              aria-label={roundLabel(number)}
              className={`inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border px-2 font-mono text-xs transition-colors ${
                round === number
                  ? 'border-cyan/50 bg-cyan/10 text-cyan'
                  : 'border-line text-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              {String(number).padStart(2, '0')}
            </button>
          ))}
        </div>
      ) : null}

      <p role="status" className="text-xs text-muted">
        {visible.length} {visible.length === 1 ? 'partido' : 'partidos'}
      </p>

      {visible.length === 0 ? (
        <EmptyState
          title="Ningún partido con esos filtros"
          description="Prueba con otro estado o con otra jornada."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      )}
    </div>
  );
}
