/**
 * Historial de partidos de un participante.
 *
 * Muestra **todo** su calendario, jugado o no: lo que viene también es
 * información. Lo que no se hace es disfrazar de resultado lo que no lo es —un
 * aplazado no aparece como 0-0, y un partido en disputa no aparece como
 * derrota—, porque esa es la forma más fácil de que una tabla mienta.
 */

import type { PlayerMatchRow } from '@liga/contracts';
import { useState } from 'react';

import { formatDate, matchStatusLabel, signed } from '../../lib/presentation.ts';
import { EmptyState } from '../ui/primitives.tsx';

const OUTCOME = {
  W: { label: 'Victoria', short: 'V', tone: 'border-acid/50 bg-acid/10 text-acid' },
  L: { label: 'Derrota', short: 'D', tone: 'border-danger/50 bg-danger/10 text-danger' },
  D: { label: 'Empate', short: 'E', tone: 'border-line text-muted' },
} as const;

type Filter = 'ALL' | 'PLAYED' | 'PENDING';

export function PlayerHistory({
  history,
  playerName,
}: {
  history: readonly PlayerMatchRow[];
  playerName: string;
}) {
  const [filter, setFilter] = useState<Filter>('ALL');

  if (history.length === 0) {
    return <EmptyState title="Sin partidos en el calendario" />;
  }

  const played = history.filter((row) => row.outcome !== null);
  const pending = history.filter((row) => row.outcome === null);

  const visible = filter === 'PLAYED' ? played : filter === 'PENDING' ? pending : [...history];

  const filters: readonly { value: Filter; label: string; count: number }[] = [
    { value: 'ALL', label: 'Todos', count: history.length },
    { value: 'PLAYED', label: 'Jugados', count: played.length },
    { value: 'PENDING', label: 'Por jugar o sin contar', count: pending.length },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {filters.map((entry) => (
          <button
            key={entry.value}
            type="button"
            onClick={() => setFilter(entry.value)}
            aria-pressed={filter === entry.value}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
              filter === entry.value
                ? 'border-cyan/50 bg-cyan/10 text-cyan'
                : 'border-line text-muted hover:border-line-strong hover:text-ink'
            }`}
          >
            {entry.label}
            <span className="font-mono text-[10px] text-faint">{entry.count}</span>
          </button>
        ))}
      </div>

      <div className="relative overflow-x-auto rounded-panel border border-line">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <caption className="sr-only">
            Historial de partidos de {playerName}. Los partidos que todavía no cuentan aparecen sin
            marcador.
          </caption>
          <thead>
            <tr className="border-b border-line bg-elevated text-[11px] tracking-[0.1em] text-faint uppercase">
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Jornada
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Rival
              </th>
              <th scope="col" className="px-2 py-2.5 text-center font-medium">
                <abbr title="Local o visitante" className="no-underline">
                  L/V
                </abbr>
              </th>
              <th scope="col" className="px-2 py-2.5 text-center font-medium">
                Coronas
              </th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">
                <abbr title="Puntos obtenidos" className="no-underline">
                  PTS
                </abbr>
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const outcome = row.outcome === null ? null : OUTCOME[row.outcome];
              return (
                <tr key={row.matchId} className="border-b border-line/60 hover:bg-elevated/60">
                  <th scope="row" className="px-3 py-2.5 text-left font-mono text-xs font-normal">
                    <a
                      href={`/partidos/${row.matchId}`}
                      className="text-muted transition-colors hover:text-cyan"
                    >
                      {String(row.roundNumber).padStart(2, '0')}
                    </a>
                    <span className="block text-[10px] text-faint">
                      {formatDate(row.scheduledAt)}
                    </span>
                  </th>

                  <td className="px-3 py-2.5">
                    <a
                      href={`/jugadores/${row.opponentSlug}`}
                      className="font-medium text-ink transition-colors hover:text-cyan"
                    >
                      {row.opponentName}
                    </a>
                  </td>

                  <td className="px-2 py-2.5 text-center">
                    <span className="font-mono text-[11px] text-faint">
                      {row.isHome ? 'L' : 'V'}
                      <span className="sr-only">{row.isHome ? 'Local' : 'Visitante'}</span>
                    </span>
                  </td>

                  <td className="px-2 py-2.5 text-center font-mono">
                    {/* Un guion, no un 0-0: el partido no cuenta todavía. */}
                    {row.crownsFor === null ? (
                      <span className="text-faint">—</span>
                    ) : (
                      <span>
                        {row.crownsFor}–{row.crownsAgainst}
                      </span>
                    )}
                  </td>

                  <td className="px-2 py-2.5 text-right font-mono">
                    {row.points === null ? (
                      <span className="text-faint">—</span>
                    ) : (
                      <span className="font-bold">{signed(row.points)}</span>
                    )}
                  </td>

                  <td className="px-3 py-2.5">
                    {outcome === null ? (
                      <span className="text-xs text-muted">{matchStatusLabel(row.status)}</span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${outcome.tone}`}
                      >
                        {outcome.short}
                        <span className="sr-only">{outcome.label}</span>
                        <span className="font-normal tracking-normal opacity-70">
                          {matchStatusLabel(row.status)}
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pending.length > 0 && filter !== 'PLAYED' ? (
        <p className="text-xs text-muted">
          Los partidos sin marcador no se han jugado todavía, o están aplazados o en disputa. En
          ninguno de esos casos cuentan como derrota ni suman puntos.
        </p>
      ) : null}
    </div>
  );
}
