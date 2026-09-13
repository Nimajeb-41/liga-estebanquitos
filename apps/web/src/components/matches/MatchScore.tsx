/**
 * Marcador de coronas.
 *
 * Dibuja las coronas conseguidas sobre las posibles. La cifra va siempre en
 * texto al lado: quien no distinga los iconos lee el número.
 *
 * Nunca inventa coronas. Si el partido no tiene resultado, no hay marcador.
 */

import type { MatchResultView } from '@liga/contracts';
import { Crown } from 'lucide-react';

/** Coronas máximas del formato. Lo fija el reglamento (P-03 lo confirmará). */
const DEFAULT_MAX_CROWNS = 3;

export function CrownRow({
  crowns,
  max = DEFAULT_MAX_CROWNS,
  won,
}: {
  crowns: number;
  max?: number;
  won: boolean;
}) {
  const total = Math.max(max, crowns);
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <Crown
          key={index}
          className={`size-3.5 ${
            index < crowns
              ? won
                ? 'fill-acid/25 text-acid'
                : 'fill-muted/20 text-muted'
              : 'text-line-strong'
          }`}
        />
      ))}
    </span>
  );
}

/**
 * Marcador grande, para la cabecera del Match Center.
 */
export function MatchScore({
  result,
  homeName,
  awayName,
  size = 'md',
}: {
  result: MatchResultView;
  homeName: string;
  awayName: string;
  size?: 'md' | 'lg';
}) {
  const homeWon = result.outcome === 'HOME_WIN';
  const awayWon = result.outcome === 'AWAY_WIN';
  const digits = size === 'lg' ? 'text-6xl sm:text-7xl' : 'text-3xl';

  /*
    Una incomparecencia no tiene marcador.

    Pintar «0 VS 0» seria peor que no pintar nada: se lee como un empate a cero
    que se jugo, y este partido no se jugo. Lo que hay que decir es quien gano y
    por que, y eso es exactamente lo que se dice.
  */
  if (result.victoryType === 'WALKOVER') {
    const winnerName = homeWon ? homeName : awayName;
    const absentName = homeWon ? awayName : homeName;

    return (
      <p
        className="flex flex-col items-center gap-1 text-center"
        aria-label={`Incomparecencia: gana ${winnerName}, ${absentName} no se presentó`}
      >
        <span
          className={`font-display font-bold tracking-[0.16em] text-warning ${
            size === 'lg' ? 'text-3xl sm:text-4xl' : 'text-lg'
          }`}
          aria-hidden="true"
        >
          WALKOVER
        </span>
        <span className="text-xs text-muted" aria-hidden="true">
          Gana {winnerName} · {absentName} no se presentó
        </span>
      </p>
    );
  }

  return (
    <p
      className="flex items-center justify-center gap-4 font-display font-bold sm:gap-6"
      aria-label={`${homeName} ${result.homeCrowns}, ${awayName} ${result.awayCrowns}`}
    >
      <span className={`${digits} ${homeWon ? 'text-acid' : 'text-muted'}`} aria-hidden="true">
        {result.homeCrowns}
      </span>
      <span className="text-sm font-medium tracking-[0.2em] text-faint" aria-hidden="true">
        VS
      </span>
      <span className={`${digits} ${awayWon ? 'text-acid' : 'text-muted'}`} aria-hidden="true">
        {result.awayCrowns}
      </span>
    </p>
  );
}
