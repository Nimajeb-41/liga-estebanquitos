/**
 * Tabla comparativa de rendimiento.
 *
 * Es una tabla de verdad, ordenable y navegable con lector de pantalla. Como la
 * clasificación, **no calcula nada**: ordena lo que ya viene calculado.
 *
 * En móvil no se recurre a un scroll horizontal y ya está: se muestran las
 * columnas que permiten reconocer a alguien —nombre, jugados, puntos— y el
 * resto se despliega al tocar la fila. Un scroll lateral en una tabla de diez
 * columnas es técnicamente correcto e inservible con el pulgar.
 */

import type { OfficialPlayerStatistics } from '@liga/contracts';
import { ChevronDown } from 'lucide-react';
import { Fragment, useState } from 'react';

import { percent, signed } from '../../lib/presentation.ts';
import { EmptyState } from '../ui/primitives.tsx';

type SortKey = 'points' | 'played' | 'wins' | 'winRate' | 'crownDiff' | 'maxCrownWins';

interface Column {
  readonly key: SortKey;
  readonly short: string;
  readonly label: string;
  /** Si se ve en móvil. Las demás viven en el desplegable. */
  readonly onMobile: boolean;
  readonly format: (row: OfficialPlayerStatistics) => string;
  readonly value: (row: OfficialPlayerStatistics) => number | null;
}

const COLUMNS: readonly Column[] = [
  {
    key: 'played',
    short: 'PJ',
    label: 'Partidos jugados',
    onMobile: true,
    format: (row) => String(row.played),
    value: (row) => row.played,
  },
  {
    key: 'wins',
    short: 'VG',
    label: 'Victorias',
    onMobile: false,
    format: (row) => String(row.wins),
    value: (row) => row.wins,
  },
  {
    key: 'winRate',
    short: '%V',
    label: 'Porcentaje de victorias',
    onMobile: false,
    // Sin partidos no hay porcentaje. Un 0 % diría otra cosa.
    format: (row) => (row.winRate === null ? '—' : `${percent(row.winRate)}%`),
    value: (row) => row.winRate,
  },
  {
    key: 'crownDiff',
    short: 'DC',
    label: 'Diferencia de coronas',
    onMobile: true,
    format: (row) => signed(row.crownDiff),
    value: (row) => row.crownDiff,
  },
  {
    key: 'maxCrownWins',
    short: '3C',
    label: 'Victorias por 3 coronas',
    onMobile: false,
    format: (row) => String(row.maxCrownWins),
    value: (row) => row.maxCrownWins,
  },
  {
    key: 'points',
    short: 'PTS',
    label: 'Puntos',
    onMobile: true,
    format: (row) => String(row.points),
    value: (row) => row.points,
  },
];

/** Un `null` siempre va al final, ordene como ordene. */
function compare(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function StreakBadge({ streak }: { streak: OfficialPlayerStatistics['currentStreak'] }) {
  if (streak === null) return <span className="text-faint">—</span>;

  const tone =
    streak.type === 'W' ? 'text-acid' : streak.type === 'L' ? 'text-danger' : 'text-muted';
  const word = streak.type === 'W' ? 'victorias' : streak.type === 'L' ? 'derrotas' : 'empates';

  return (
    <span className={`font-mono ${tone}`}>
      {streak.type}
      {streak.length}
      <span className="sr-only">
        {' '}
        · {streak.length} {word} seguidas
      </span>
    </span>
  );
}

export function StatisticsTable({ players }: { players: readonly OfficialPlayerStatistics[] }) {
  const [sort, setSort] = useState<SortKey>('points');
  const [open, setOpen] = useState<string | null>(null);

  if (players.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay estadísticas"
        description="Aparecerán en cuanto se juegue el primer partido."
      />
    );
  }

  const column = COLUMNS.find((entry) => entry.key === sort)!;
  const rows = [...players].sort(
    (left, right) =>
      compare(column.value(left), column.value(right)) ||
      left.displayName.localeCompare(right.displayName),
  );

  return (
    <div className="relative overflow-x-auto rounded-panel border border-line">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Rendimiento de los participantes de la Liga Estabanquitos 2026-1, ordenado por{' '}
          {column.label.toLowerCase()}. Todos los datos son oficiales.
        </caption>
        <thead>
          <tr className="border-b border-line bg-elevated text-[11px] tracking-[0.1em] text-faint uppercase">
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              Jugador
            </th>
            {COLUMNS.map((entry) => (
              <th
                key={entry.key}
                scope="col"
                aria-sort={sort === entry.key ? 'descending' : 'none'}
                className={`px-2 py-2.5 text-right font-medium ${entry.onMobile ? '' : 'hidden sm:table-cell'}`}
              >
                <button
                  type="button"
                  onClick={() => setSort(entry.key)}
                  className={`transition-colors hover:text-ink ${sort === entry.key ? 'text-cyan' : ''}`}
                  aria-label={`Ordenar por ${entry.label.toLowerCase()}`}
                >
                  <abbr title={entry.label} className="no-underline">
                    {entry.short}
                  </abbr>
                </button>
              </th>
            ))}
            <th scope="col" className="hidden px-2 py-2.5 text-right font-medium lg:table-cell">
              <abbr title="Racha actual" className="no-underline">
                Racha
              </abbr>
            </th>
            <th scope="col" className="w-8 px-1 py-2.5 sm:hidden">
              <span className="sr-only">Ver todo</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.playerId}>
              <tr className="border-b border-line/60 hover:bg-elevated/60">
                <th scope="row" className="px-3 py-2.5 text-left font-normal">
                  <a
                    href={`/jugadores/${row.slug}`}
                    className="font-medium text-ink transition-colors hover:text-cyan"
                  >
                    {row.displayName}
                  </a>
                </th>
                {COLUMNS.map((entry) => (
                  <td
                    key={entry.key}
                    className={`px-2 py-2.5 text-right font-mono ${entry.onMobile ? '' : 'hidden sm:table-cell'} ${entry.key === 'points' ? 'font-bold text-ink' : 'text-muted'}`}
                  >
                    {entry.format(row)}
                  </td>
                ))}
                <td className="hidden px-2 py-2.5 text-right lg:table-cell">
                  <StreakBadge streak={row.currentStreak} />
                </td>
                <td className="px-1 py-2.5 sm:hidden">
                  <button
                    type="button"
                    onClick={() => setOpen(open === row.playerId ? null : row.playerId)}
                    aria-expanded={open === row.playerId}
                    aria-label={`Ver todas las estadísticas de ${row.displayName}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted"
                  >
                    <ChevronDown
                      aria-hidden="true"
                      className={`size-4 transition-transform ${open === row.playerId ? 'rotate-180' : ''}`}
                    />
                  </button>
                </td>
              </tr>

              {open === row.playerId ? (
                <tr className="border-b border-line/60 bg-elevated/40 sm:hidden">
                  <td colSpan={COLUMNS.length + 3} className="px-3 py-3">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      {COLUMNS.filter((entry) => !entry.onMobile).map((entry) => (
                        <div key={entry.key} className="flex justify-between gap-2">
                          <dt className="text-faint">{entry.label}</dt>
                          <dd className="font-mono">{entry.format(row)}</dd>
                        </div>
                      ))}
                      <div className="flex justify-between gap-2">
                        <dt className="text-faint">Racha actual</dt>
                        <dd>
                          <StreakBadge streak={row.currentStreak} />
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-faint">Coronas a favor</dt>
                        <dd className="font-mono">{row.crownsFor}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-faint">Coronas en contra</dt>
                        <dd className="font-mono">{row.crownsAgainst}</dd>
                      </div>
                    </dl>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
