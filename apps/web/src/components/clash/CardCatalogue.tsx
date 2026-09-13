/**
 * Catálogo de cartas observadas, con filtros.
 *
 * Cada cifra dice **de cuántos mazos** sale. Un «100 %» sobre dos mazos y otro
 * sobre doscientos se leen igual si no se dice la muestra, y son cosas muy
 * distintas.
 *
 * Los iconos vienen de `api-assets.clashroyale.com`, que es donde la propia API
 * los publica. No se descarga ni se rehospeda ninguno.
 */

import type { CardUsage } from '@liga/contracts';
import { Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';

import { percent } from '../../lib/presentation.ts';
import { EmptyState } from '../ui/primitives.tsx';

/** Rarezas observadas en el catálogo real, en orden de escasez. */
const RARITIES = ['common', 'rare', 'epic', 'legendary', 'champion'] as const;

const RARITY_LABELS: Readonly<Record<string, string>> = {
  common: 'Común',
  rare: 'Especial',
  epic: 'Épica',
  legendary: 'Legendaria',
  champion: 'Campeona',
};

/** Color por rareza. Acompaña al texto; nunca es el único portador. */
const RARITY_TONE: Readonly<Record<string, string>> = {
  common: 'border-line text-muted',
  rare: 'border-cyan/40 text-cyan',
  epic: 'border-purple/50 text-purple',
  legendary: 'border-warning/50 text-warning',
  champion: 'border-magenta/50 text-magenta',
};

type Sort = 'appearances' | 'name' | 'elixir';

export function CardCatalogue({
  cards,
  sampleSize,
}: {
  cards: readonly CardUsage[];
  sampleSize: number;
}) {
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState<string>('ALL');
  const [elixir, setElixir] = useState<string>('ALL');
  const [onlyEvolved, setOnlyEvolved] = useState(false);
  const [sort, setSort] = useState<Sort>('appearances');

  const elixirCosts = useMemo(
    () =>
      [
        ...new Set(
          cards.map((card) => card.elixirCost).filter((cost): cost is number => cost !== null),
        ),
      ].sort((a, b) => a - b),
    [cards],
  );

  const term = query.trim().toLowerCase();
  const visible = cards
    .filter((card) => term === '' || card.name.toLowerCase().includes(term))
    .filter((card) => rarity === 'ALL' || card.rarity === rarity)
    .filter((card) => elixir === 'ALL' || card.elixirCost === Number(elixir))
    .filter((card) => !onlyEvolved || card.evolutions > 0)
    .sort((left, right) => {
      if (sort === 'name') return left.name.localeCompare(right.name);
      if (sort === 'elixir') return (left.elixirCost ?? 99) - (right.elixirCost ?? 99);
      return right.appearances - left.appearances || left.name.localeCompare(right.name);
    });

  const filterClass = (active: boolean) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
      active
        ? 'border-cyan/50 bg-cyan/10 text-cyan'
        : 'border-line text-muted hover:border-line-strong hover:text-ink'
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <label htmlFor="buscar-carta" className="sr-only">
            Buscar una carta por su nombre
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint"
          />
          <input
            id="buscar-carta"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar carta"
            className="min-h-9 w-48 rounded-md border border-line bg-elevated pr-3 pl-8 text-xs text-ink placeholder:text-faint focus:border-cyan focus:outline-none"
          />
        </div>

        <label htmlFor="filtro-rareza" className="sr-only">
          Filtrar por rareza
        </label>
        <select
          id="filtro-rareza"
          value={rarity}
          onChange={(event) => setRarity(event.target.value)}
          className="min-h-9 rounded-md border border-line bg-elevated px-2 text-xs text-ink"
        >
          <option value="ALL">Todas las rarezas</option>
          {RARITIES.filter((entry) => cards.some((card) => card.rarity === entry)).map((entry) => (
            <option key={entry} value={entry}>
              {RARITY_LABELS[entry] ?? entry}
            </option>
          ))}
        </select>

        <label htmlFor="filtro-elixir" className="sr-only">
          Filtrar por coste de elixir
        </label>
        <select
          id="filtro-elixir"
          value={elixir}
          onChange={(event) => setElixir(event.target.value)}
          className="min-h-9 rounded-md border border-line bg-elevated px-2 text-xs text-ink"
        >
          <option value="ALL">Cualquier coste</option>
          {elixirCosts.map((cost) => (
            <option key={cost} value={cost}>
              {cost} de elixir
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setOnlyEvolved(!onlyEvolved)}
          aria-pressed={onlyEvolved}
          className={filterClass(onlyEvolved)}
        >
          <Sparkles aria-hidden="true" className="size-3.5" />
          Vistas evolucionadas
        </button>

        <label htmlFor="orden-cartas" className="sr-only">
          Ordenar
        </label>
        <select
          id="orden-cartas"
          value={sort}
          onChange={(event) => setSort(event.target.value as Sort)}
          className="min-h-9 rounded-md border border-line bg-elevated px-2 text-xs text-ink"
        >
          <option value="appearances">Más vistas primero</option>
          <option value="name">Por nombre</option>
          <option value="elixir">Por coste</option>
        </select>

        <span role="status" className="text-xs text-muted">
          {visible.length} {visible.length === 1 ? 'carta' : 'cartas'}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Ninguna carta con esos filtros" />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((card) => (
            <li
              key={card.cardId}
              className="panel flex flex-col items-center gap-2 p-3 text-center"
            >
              {card.iconUrl === null ? (
                <span className="flex h-16 w-14 items-center justify-center rounded bg-void font-mono text-[10px] text-faint">
                  {card.name.slice(0, 4).toUpperCase()}
                </span>
              ) : (
                <img
                  src={card.iconUrl}
                  alt=""
                  loading="lazy"
                  width={56}
                  height={68}
                  className="h-16 w-14 object-contain"
                />
              )}

              <p className="text-xs font-medium text-ink">{card.name}</p>

              <p className="flex flex-wrap items-center justify-center gap-1.5 text-[10px]">
                {card.rarity === null ? null : (
                  <span
                    className={`rounded-full border px-1.5 py-0.5 ${RARITY_TONE[card.rarity] ?? 'border-line text-muted'}`}
                  >
                    {RARITY_LABELS[card.rarity] ?? card.rarity}
                  </span>
                )}
                {card.elixirCost === null ? null : (
                  <span className="font-mono text-purple">{card.elixirCost} elixir</span>
                )}
              </p>

              <p className="mt-1 w-full border-t border-line pt-2 text-[11px] text-muted">
                <span className="font-mono text-ink">{card.appearances}</span> de {sampleSize}{' '}
                {sampleSize === 1 ? 'mazo' : 'mazos'}
                {sampleSize > 0 ? (
                  <span className="text-faint"> ({percent(card.appearances / sampleSize)}%)</span>
                ) : null}
              </p>

              {card.evolutions > 0 ? (
                <p className="flex items-center gap-1 text-[10px] text-purple">
                  <Sparkles aria-hidden="true" className="size-2.5" />
                  evolucionada {card.evolutions} {card.evolutions === 1 ? 'vez' : 'veces'}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
