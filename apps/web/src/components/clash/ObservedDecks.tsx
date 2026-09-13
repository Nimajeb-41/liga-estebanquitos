/**
 * Mazos observados de un participante.
 *
 * Evidencia, no registro oficial. Son los mazos que Clash Royale devolvió en
 * las batallas que un administrador confirmó como partidos de la liga; no hay
 * ninguna garantía de que sean todos los que jugó, y el propio historial de la
 * API es una ventana estrecha.
 *
 * Por eso cada bloque dice de qué batalla sale y sobre cuántas se calcula el
 * resumen. Y por eso el rival aparece nombrado solo si juega la liga: el tag de
 * quien no juega se enmascara antes de salir del servidor.
 */

import type { ObservedDeck } from '@liga/contracts';
import { Droplet, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';

import { formatDateTime } from '../../lib/presentation.ts';
import { EmptyState } from '../ui/primitives.tsx';

/** Cartas que más se repitieron entre los mazos observados. */
function frequentCards(decks: readonly ObservedDeck[]) {
  const counts = new Map<number, { name: string; iconUrl: string | null; times: number }>();
  for (const deck of decks) {
    for (const card of deck.cards) {
      const entry = counts.get(card.cardId);
      if (entry === undefined) {
        counts.set(card.cardId, { name: card.name, iconUrl: card.iconUrl, times: 1 });
      } else {
        entry.times += 1;
      }
    }
  }
  return [...counts.entries()]
    .map(([cardId, entry]) => ({ cardId, ...entry }))
    .sort((left, right) => right.times - left.times || left.name.localeCompare(right.name));
}

export function ObservedDecks({
  decks,
  sampleSize,
  playerName,
}: {
  decks: readonly ObservedDeck[];
  sampleSize: number;
  playerName: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(decks[0]?.battleId ?? null);

  const frequent = useMemo(() => frequentCards(decks), [decks]);

  /**
   * Media de elixir sobre los mazos donde se pudo calcular. Si el catálogo no
   * conocía el coste de las ocho cartas de un mazo, ese mazo no entra: una
   * media con huecos no es una media.
   */
  const elixirSample = decks.filter((deck) => deck.averageElixir !== null);
  const averageElixir =
    elixirSample.length === 0
      ? null
      : Math.round(
          (elixirSample.reduce((sum, deck) => sum + (deck.averageElixir ?? 0), 0) /
            elixirSample.length) *
            10,
        ) / 10;

  const evolutions = decks.reduce(
    (sum, deck) => sum + deck.cards.filter((card) => (card.evolutionLevel ?? 0) > 0).length,
    0,
  );

  if (decks.length === 0) {
    return (
      <EmptyState
        title="Sin mazos observados"
        description={`Todavía no hay ninguna batalla de ${playerName} confirmada como partido de la liga, así que no hay ningún mazo que enseñar. No significa que no haya jugado: significa que no se ha observado.`}
      />
    );
  }

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-panel border border-line bg-elevated px-3 py-2.5">
          <dt className="text-[10px] tracking-[0.12em] text-faint uppercase">Mazos observados</dt>
          <dd className="mt-0.5 font-display text-xl font-semibold">{sampleSize}</dd>
        </div>
        <div className="rounded-panel border border-line bg-elevated px-3 py-2.5">
          <dt className="text-[10px] tracking-[0.12em] text-faint uppercase">Elixir medio</dt>
          <dd className="mt-0.5 font-display text-xl font-semibold text-purple">
            {averageElixir === null ? <span className="text-faint">—</span> : averageElixir}
          </dd>
          {averageElixir !== null && elixirSample.length < decks.length ? (
            <dd className="mt-0.5 text-[11px] text-muted">
              sobre {elixirSample.length} de {decks.length}
            </dd>
          ) : null}
        </div>
        <div className="rounded-panel border border-line bg-elevated px-3 py-2.5">
          <dt className="text-[10px] tracking-[0.12em] text-faint uppercase">
            Cartas evolucionadas
          </dt>
          <dd className="mt-0.5 font-display text-xl font-semibold">{evolutions}</dd>
        </div>
        <div className="rounded-panel border border-line bg-elevated px-3 py-2.5">
          <dt className="text-[10px] tracking-[0.12em] text-faint uppercase">Cartas distintas</dt>
          <dd className="mt-0.5 font-display text-xl font-semibold">{frequent.length}</dd>
        </div>
      </dl>

      {frequent.length === 0 ? null : (
        <div>
          <h3 className="text-[11px] font-medium tracking-[0.12em] text-faint uppercase">
            Cartas más repetidas
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {frequent.slice(0, 10).map((card) => (
              <li
                key={card.cardId}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-elevated py-1 pr-3 pl-1.5 text-xs"
              >
                {card.iconUrl === null ? null : (
                  <img src={card.iconUrl} alt="" loading="lazy" className="size-6 object-contain" />
                )}
                <span>{card.name}</span>
                <span className="font-mono text-[10px] text-faint">
                  {card.times}/{decks.length}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-2">
        {decks.map((deck) => {
          const open = expanded === deck.battleId;
          return (
            <li key={deck.battleId} className="rounded-panel border border-line">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : deck.battleId)}
                aria-expanded={open}
                className="flex min-h-11 w-full flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {deck.opponent === null ? (
                      'Rival no registrado'
                    ) : deck.opponent.isParticipant ? (
                      <>contra {deck.opponent.displayName}</>
                    ) : (
                      <>
                        contra <span className="font-mono text-muted">{deck.opponent.tag}</span>
                      </>
                    )}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] text-faint">
                    {formatDateTime(deck.battleTime)} · {deck.battleType}
                  </span>
                </span>

                <span className="flex items-center gap-3 text-xs">
                  {deck.averageElixir === null ? null : (
                    <span className="inline-flex items-center gap-1 text-purple">
                      <Droplet aria-hidden="true" className="size-3" />
                      {deck.averageElixir}
                    </span>
                  )}
                  <span className="text-faint">{open ? 'Ocultar' : 'Ver mazo'}</span>
                </span>
              </button>

              {open ? (
                <ul className="grid grid-cols-4 gap-2 border-t border-line px-4 py-3 sm:grid-cols-8">
                  {deck.cards.map((card, index) => (
                    <li key={`${deck.battleId}-${card.cardId}-${index}`} className="text-center">
                      {card.iconUrl === null ? (
                        <span className="flex h-14 items-center justify-center rounded bg-void font-mono text-[9px] text-faint">
                          {card.name.slice(0, 4).toUpperCase()}
                        </span>
                      ) : (
                        <img
                          src={card.iconUrl}
                          alt={card.name}
                          loading="lazy"
                          className="mx-auto h-14 object-contain"
                        />
                      )}
                      <span className="mt-1 block text-[10px] leading-tight text-muted">
                        {card.name}
                      </span>
                      <span className="block font-mono text-[10px] text-faint">
                        {card.level === null ? '—' : `nv ${card.level}`}
                        {(card.evolutionLevel ?? 0) > 0 ? (
                          <Sparkles
                            aria-label="Evolucionada"
                            className="ml-0.5 inline size-2.5 text-purple"
                          />
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
