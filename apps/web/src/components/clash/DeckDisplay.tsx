/**
 * Mazo observado en una batalla.
 *
 * Muestra las ocho cartas con su nivel y su evolucion, y nada mas. En concreto:
 * **no dice si el mazo es legal, ni si se podia cambiar entre partidas**. Eso
 * lo decide P-04, que sigue abierta. Aqui solo se enseña lo que la API devolvio.
 */

import { Sparkles } from 'lucide-react';

import type { ExternalCard } from '@liga/contracts';

/** Colores de rareza. Solo decorativos: la rareza no cambia nada normativo. */
function levelTone(card: ExternalCard): string {
  return card.evolutionLevel !== null && card.evolutionLevel > 0
    ? 'border-purple/60 bg-purple/10'
    : 'border-line bg-elevated';
}

export function DeckDisplay({ cards, label }: { cards: readonly ExternalCard[]; label: string }) {
  if (cards.length === 0) {
    return <p className="text-xs text-faint">La API no devolvió el mazo de esta batalla.</p>;
  }

  return (
    <div>
      <h4 className="mb-2 text-[11px] font-medium tracking-[0.12em] text-faint uppercase">
        {label}
      </h4>
      <ul className="grid grid-cols-4 gap-1.5">
        {cards.map((card) => (
          <li
            key={card.cardId}
            className={`relative flex flex-col items-center gap-1 rounded-md border p-1.5 text-center ${levelTone(card)}`}
          >
            {card.iconUrl === null || card.iconUrl === undefined ? (
              <span className="flex size-10 items-center justify-center rounded bg-void font-mono text-[9px] text-faint">
                {card.name.slice(0, 3).toUpperCase()}
              </span>
            ) : (
              <img
                src={card.iconUrl}
                alt=""
                loading="lazy"
                width={40}
                height={48}
                className="h-12 w-10 object-contain"
              />
            )}
            <span className="line-clamp-2 text-[10px] leading-tight text-muted">{card.name}</span>
            <span className="flex items-center gap-0.5 font-mono text-[10px] text-faint">
              {card.level === null ? '—' : `n${card.level}`}
              {card.evolutionLevel !== null && card.evolutionLevel > 0 ? (
                <Sparkles aria-label="Carta evolucionada" className="size-2.5 text-purple" />
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
