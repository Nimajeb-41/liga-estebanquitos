/**
 * Tabla de clasificación.
 *
 * El orden es el que calculó el backend. Esta tabla no ordena ni recalcula
 * nada por su cuenta: si el usuario pide otro orden se le da, pero se le avisa
 * de que ya no está mirando la clasificación oficial.
 *
 * En móvil se muestran POS, jugador, PJ, DC y PTS; el resto se despliega fila a
 * fila, que es lo acordado en la dirección visual.
 */

import type { Standings, StandingsRow } from '@liga/contracts';
import { ChevronDown, Info } from 'lucide-react';
import { Fragment, useState } from 'react';

import { podiumTone, signed } from '../../lib/presentation.ts';
import { Badge, EmptyState } from '../ui/primitives.tsx';
import { FormIndicator, PositionChange } from './FormIndicator.tsx';

type SortKey = 'official' | 'played' | 'wins' | 'losses' | 'crownDiff' | 'points';

const NUMERIC_COLUMNS: readonly {
  key: Exclude<SortKey, 'official'>;
  short: string;
  long: string;
  /** Las que no son compactas se esconden en pantallas estrechas. */
  compact: boolean;
}[] = [
  { key: 'played', short: 'PJ', long: 'Partidos jugados', compact: true },
  { key: 'wins', short: 'VG', long: 'Victorias', compact: false },
  { key: 'losses', short: 'VP', long: 'Derrotas', compact: false },
  { key: 'crownDiff', short: 'DC', long: 'Diferencia de coronas', compact: true },
  { key: 'points', short: 'PTS', long: 'Puntos', compact: true },
];

function valueOf(row: StandingsRow, key: Exclude<SortKey, 'official'>): number {
  return row[key];
}

/** Distintivo del podio: un cuadro con el número y el color del metal. */
function PositionCell({ row }: { row: StandingsRow }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={`inline-flex size-7 items-center justify-center rounded-md border font-display text-sm font-bold ${podiumTone(row.position)}`}
      >
        {row.position}
      </span>
      {row.unresolvedTie ? (
        <abbr
          title="Empate sin resolver: los criterios de desempate no bastaron y comparten posición (P-09)."
          className="font-mono text-[10px] text-warning no-underline"
        >
          =
        </abbr>
      ) : null}
    </span>
  );
}

export function StandingsTable({
  standings,
  caption = 'Clasificación de la Liga Estabanquitos 2026-1',
  sortable = true,
}: {
  standings: Standings;
  caption?: string;
  sortable?: boolean;
}) {
  const [sort, setSort] = useState<SortKey>('official');
  const [expanded, setExpanded] = useState<string | null>(null);

  if (standings.rows.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay clasificación"
        description="La tabla aparece en cuanto se juegue el primer partido. No se muestra una tabla en cero porque no diría nada."
      />
    );
  }

  const rows =
    sort === 'official'
      ? standings.rows
      : [...standings.rows].sort((left, right) => valueOf(right, sort) - valueOf(left, sort));

  return (
    <div>
      {sort === 'official' ? null : (
        <p
          role="status"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning"
        >
          <Info aria-hidden="true" className="size-3.5 shrink-0" />
          Orden personalizado por {NUMERIC_COLUMNS.find((column) => column.key === sort)?.long}. No
          es la clasificación oficial.
          <button
            type="button"
            onClick={() => setSort('official')}
            className="ml-auto shrink-0 font-medium text-cyan underline-offset-2 hover:underline"
          >
            Volver al orden oficial
          </button>
        </p>
      )}

      <div className="relative overflow-x-auto rounded-panel border border-line">
        <table className="w-full min-w-[32rem] border-collapse text-sm">
          <caption className="sr-only">
            {caption}. Ordenada según los criterios del reglamento:{' '}
            {standings.tiebreakers.join(', ')}.
          </caption>
          <thead>
            <tr className="border-b border-line bg-elevated text-[11px] tracking-[0.1em] text-faint uppercase">
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                <abbr title="Posición" className="no-underline">
                  Pos
                </abbr>
              </th>
              <th scope="col" className="px-2 py-2.5 text-left font-medium">
                Jugador
              </th>
              {NUMERIC_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-2 py-2.5 text-right font-medium ${
                    column.compact ? '' : 'hidden sm:table-cell'
                  }`}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => setSort(sort === column.key ? 'official' : column.key)}
                      aria-label={`Ordenar por ${column.long}`}
                      className="uppercase transition-colors hover:text-cyan"
                    >
                      <abbr title={column.long} className="no-underline">
                        {column.short}
                      </abbr>
                    </button>
                  ) : (
                    <abbr title={column.long} className="no-underline">
                      {column.short}
                    </abbr>
                  )}
                </th>
              ))}
              <th scope="col" className="hidden px-3 py-2.5 text-left font-medium lg:table-cell">
                Forma
              </th>
              <th scope="col" className="w-10 px-2 py-2.5 sm:hidden">
                <span className="sr-only">Más datos</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const open = expanded === row.playerId;
              return (
                <Fragment key={row.playerId}>
                  <tr
                    className={`border-b border-line/60 transition-colors hover:bg-elevated/60 ${
                      row.position === 1 && sort === 'official' ? 'bg-gold/[0.04]' : ''
                    }`}
                  >
                    <th scope="row" className="px-3 py-2.5 text-left font-normal">
                      <PositionCell row={row} />
                    </th>
                    <td className="px-2 py-2.5">
                      <a
                        href={`/jugadores/${row.slug}`}
                        className="flex items-center gap-2 font-medium text-ink transition-colors hover:text-cyan"
                      >
                        <span className="truncate">{row.displayName}</span>
                        {sort === 'official' ? (
                          <PositionChange change={row.positionChange} />
                        ) : null}
                      </a>
                      {row.sanctionCount > 0 ? (
                        <span className="mt-0.5 block font-mono text-[10px] text-danger">
                          {row.sanctionPoints} pts · {row.sanctionCount}{' '}
                          {row.sanctionCount === 1 ? 'sanción' : 'sanciones'}
                        </span>
                      ) : null}
                    </td>
                    {NUMERIC_COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className={`px-2 py-2.5 text-right font-mono ${
                          column.compact ? '' : 'hidden sm:table-cell'
                        } ${
                          column.key === 'points'
                            ? 'font-display text-base font-bold text-ink'
                            : 'text-muted'
                        }`}
                      >
                        {column.key === 'crownDiff'
                          ? signed(row.crownDiff)
                          : valueOf(row, column.key)}
                      </td>
                    ))}
                    <td className="hidden px-3 py-2.5 lg:table-cell">
                      <FormIndicator form={row.form} playerName={row.displayName} />
                    </td>
                    <td className="px-2 py-2.5 sm:hidden">
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : row.playerId)}
                        aria-expanded={open}
                        aria-label={`Más datos de ${row.displayName}`}
                        className="inline-flex size-8 items-center justify-center rounded-md border border-line text-muted"
                      >
                        <ChevronDown
                          aria-hidden="true"
                          className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="border-b border-line/60 sm:hidden">
                      <td colSpan={6} className="bg-elevated/60 px-3 py-3">
                        <dl className="grid grid-cols-2 gap-y-2 text-xs">
                          <dt className="text-faint">Victorias</dt>
                          <dd className="text-right font-mono">{row.wins}</dd>
                          <dt className="text-faint">Derrotas</dt>
                          <dd className="text-right font-mono">{row.losses}</dd>
                          <dt className="text-faint">Coronas a favor</dt>
                          <dd className="text-right font-mono">{row.crownsFor}</dd>
                          <dt className="text-faint">Coronas en contra</dt>
                          <dd className="text-right font-mono">{row.crownsAgainst}</dd>
                          <dt className="text-faint">Victorias por 3 coronas</dt>
                          <dd className="text-right font-mono">{row.maxCrownWins}</dd>
                        </dl>
                        <p className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-xs text-faint">Forma</span>
                          <FormIndicator form={row.form} playerName={row.displayName} />
                        </p>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge tone="neutral">
          {standings.upToRound === null
            ? 'Sin jornadas jugadas'
            : `Hasta la jornada ${standings.upToRound}`}
        </Badge>
        <span>
          Desempates: {standings.tiebreakers.join(' → ')}. Reglamento {standings.rulesVersion}.
        </span>
      </p>
    </div>
  );
}
