/**
 * Historial de un partido.
 *
 * Aplazamientos, reprogramaciones y correcciones, en orden. Es la parte que
 * hace que la plataforma pueda explicar por qué un partido está donde está.
 *
 * De un aplazamiento se publica qué pasó, cuándo y el motivo clasificado. El
 * texto libre que lo acompaña se queda en administración: suele hablar de las
 * circunstancias personales de alguien.
 */

import type { MatchDetail } from '@liga/contracts';
import { CalendarClock, FileClock, PauseCircle } from 'lucide-react';

import { formatDateTime, POSTPONEMENT_REASON_LABELS } from '../../lib/presentation.ts';
import { EmptyState } from '../ui/primitives.tsx';

export function MatchTimeline({ history }: { history: MatchDetail['history'] }) {
  const entries = [
    ...history.postponements.map((entry) => ({
      kind: entry.event,
      at: entry.occurredAt,
      title: entry.event === 'POSTPONED' ? 'Partido aplazado' : 'Nueva fecha acordada',
      detail:
        entry.event === 'POSTPONED'
          ? `Motivo: ${POSTPONEMENT_REASON_LABELS[entry.reason]}. Estaba previsto para ${formatDateTime(entry.previousScheduledAt)}.`
          : `Se juega el ${formatDateTime(entry.newScheduledAt)}. La jornada sigue siendo la ${entry.roundNumber}.`,
    })),
    ...history.corrections.map((correction) => ({
      kind: 'CORRECTION' as const,
      at: correction.changedAt,
      title: `Corrección administrativa n.º ${correction.revision}`,
      detail:
        'El resultado se revisó y quedó registrado el cambio. Si el motivo se hace público, y cómo, es una regla todavía pendiente (P-10).',
    })),
  ].sort((left, right) => left.at.localeCompare(right.at));

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Sin incidencias"
        description="Este partido no se ha aplazado ni ha necesitado correcciones."
        icon={FileClock}
      />
    );
  }

  return (
    <ol className="relative space-y-4 border-l border-line pl-6">
      {entries.map((entry, index) => {
        const Icon =
          entry.kind === 'POSTPONED'
            ? PauseCircle
            : entry.kind === 'RESCHEDULED'
              ? CalendarClock
              : FileClock;
        const tone =
          entry.kind === 'POSTPONED'
            ? 'text-warning'
            : entry.kind === 'CORRECTION'
              ? 'text-purple'
              : 'text-cyan';
        return (
          <li key={`${entry.kind}-${entry.at}-${index}`} className="relative">
            <span
              aria-hidden="true"
              className={`absolute top-0.5 -left-[31px] flex size-[18px] items-center justify-center rounded-full border border-line bg-panel ${tone}`}
            >
              <Icon className="size-3" />
            </span>
            <p className="text-sm font-medium text-ink">{entry.title}</p>
            <p className="mt-0.5 text-sm text-muted">{entry.detail}</p>
            <p className="mt-1 font-mono text-[11px] text-faint">{formatDateTime(entry.at)}</p>
          </li>
        );
      })}
    </ol>
  );
}
