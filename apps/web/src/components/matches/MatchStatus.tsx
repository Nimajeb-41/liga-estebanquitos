/**
 * Estado de un partido.
 *
 * Los seis estados del dominio, ni uno más. El icono acompaña al texto, nunca
 * lo sustituye: el color no es el único portador de la información.
 */

import type { MatchStatus } from '@liga/contracts';
import { Ban, CalendarClock, CheckCircle2, PauseCircle, Radio, Scale } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { matchStatusLabel } from '../../lib/presentation.ts';
import { Badge, type Tone } from '../ui/primitives.tsx';

const ICON: Readonly<Record<MatchStatus, LucideIcon>> = {
  SCHEDULED: CalendarClock,
  LIVE: Radio,
  COMPLETED: CheckCircle2,
  POSTPONED: PauseCircle,
  DISPUTED: Scale,
  CANCELLED: Ban,
};

const TONE: Readonly<Record<MatchStatus, Tone>> = {
  SCHEDULED: 'neutral',
  LIVE: 'magenta',
  COMPLETED: 'acid',
  POSTPONED: 'warning',
  DISPUTED: 'danger',
  CANCELLED: 'neutral',
};

export function MatchStatusBadge({
  status,
  className = '',
}: {
  status: MatchStatus;
  className?: string;
}) {
  return (
    <Badge tone={TONE[status]} icon={ICON[status]} className={className}>
      {matchStatusLabel(status)}
    </Badge>
  );
}

/**
 * Punto pulsante de directo.
 *
 * `prefers-reduced-motion` detiene la animación; el texto sigue estando.
 */
export function LiveDot({ label = 'En vivo' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-magenta uppercase">
      <span aria-hidden="true" className="pulse-live size-2 rounded-full bg-magenta" />
      {label}
    </span>
  );
}
