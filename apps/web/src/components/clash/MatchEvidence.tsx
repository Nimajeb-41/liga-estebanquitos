/**
 * Evidencia de Clash Royale en la ficha de un partido.
 *
 * Va **debajo** del resultado oficial y separada de el sin ambiguedad posible.
 * La distincion no es estetica: el marcador oficial lo determina el reglamento
 * de la liga, y esto es lo que se observo en el juego. Normalmente coinciden
 * —de ahi salio el resultado—, pero la autoridad es de la liga.
 */

import { Gamepad2, Info } from 'lucide-react';

import type { MatchEvidence as Evidence } from '@liga/contracts';

import { formatDateTime } from '../../lib/presentation.ts';
import { SourceBadge } from '../statistics/SourceBadge.tsx';
import { DeckDisplay } from './DeckDisplay.tsx';

function Side({ name, side }: { name: string; side: Evidence['home'] }) {
  if (side === null) {
    return (
      <div className="rounded-panel border border-dashed border-line p-4">
        <p className="text-sm font-medium">{name}</p>
        <p className="mt-1 text-xs text-faint">
          Esta cuenta no está vinculada a este participante.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-panel border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="mt-0.5 font-mono text-[11px] text-faint">
            {side.clashTag}
            {side.clashName === null ? '' : ` · ${side.clashName}`}
          </p>
        </div>
        <p className="font-display text-2xl font-bold text-cyan">{side.crowns}</p>
      </div>
      <div className="mt-4">
        <DeckDisplay cards={side.deck} label="Mazo usado" />
      </div>
    </div>
  );
}

export function MatchEvidencePanel({
  evidence,
  homeName,
  awayName,
}: {
  evidence: Evidence;
  homeName: string;
  awayName: string;
}) {
  return (
    <section aria-labelledby="evidencia-clash" className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="evidencia-clash"
          className="flex items-center gap-2 font-display text-base font-semibold"
        >
          <Gamepad2 aria-hidden="true" className="size-4 text-cyan" />
          Datos de Clash Royale
        </h2>
        <SourceBadge source="OBSERVED" sampleSize={1} />
      </div>

      <p className="mt-2 flex items-start gap-2 text-sm text-muted">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-faint" />
        <span>
          Es lo que se observó en el juego, no el resultado oficial. El marcador que cuenta para la
          clasificación es el de arriba, y lo determina el reglamento de la liga.
        </span>
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-line py-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-faint">Batalla</dt>
          <dd className="mt-0.5 font-mono">{formatDateTime(evidence.battleTime)}</dd>
        </div>
        <div>
          <dt className="text-faint">Tipo</dt>
          <dd className="mt-0.5 font-mono">{evidence.battleType}</dd>
        </div>
        <div>
          <dt className="text-faint">Modo</dt>
          <dd className="mt-0.5 font-mono">{evidence.gameModeName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-faint">Arena</dt>
          <dd className="mt-0.5 font-mono">{evidence.arenaName ?? '—'}</dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Side name={homeName} side={evidence.home} />
        <Side name={awayName} side={evidence.away} />
      </div>

      <p className="mt-4 text-xs text-faint">
        Un administrador confirmó que esta batalla corresponde a este partido. Qué reglas rigen los
        mazos —si se pueden cambiar, si hay que declararlos— es una decisión de reglamento todavía
        abierta (P-04).
      </p>
    </section>
  );
}
