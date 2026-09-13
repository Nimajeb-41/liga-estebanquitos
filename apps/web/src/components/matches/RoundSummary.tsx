/**
 * Resumen de una jornada.
 *
 * Cuenta los partidos por estado para poder decir de un vistazo si la jornada
 * está completa, en juego o pendiente. Es un recuento de lo que devolvió la
 * API, no una regla: el estado de cada partido lo decide el backend.
 */

import type { Match, MatchStatus } from '@liga/contracts';

import { Badge } from '../ui/primitives.tsx';

export interface RoundTally {
  readonly total: number;
  readonly completed: number;
  readonly live: number;
  readonly postponed: number;
  readonly disputed: number;
  readonly scheduled: number;
  readonly cancelled: number;
}

export function tally(matches: readonly Match[]): RoundTally {
  const count = (status: MatchStatus): number =>
    matches.filter((match) => match.status === status).length;

  return {
    total: matches.length,
    completed: count('COMPLETED'),
    live: count('LIVE'),
    postponed: count('POSTPONED'),
    disputed: count('DISPUTED'),
    scheduled: count('SCHEDULED'),
    cancelled: count('CANCELLED'),
  };
}

/**
 * Etiqueta de estado de la jornada.
 *
 * Una jornada solo está terminada si todos sus partidos están finalizados. Un
 * aplazado la deja abierta: es justo lo que significa aplazar.
 */
export function RoundStatusBadge({ matches }: { matches: readonly Match[] }) {
  const counts = tally(matches);

  if (counts.total === 0) return <Badge tone="neutral">Sin partidos</Badge>;
  if (counts.live > 0) return <Badge tone="magenta">En juego</Badge>;
  if (counts.disputed > 0) return <Badge tone="danger">Con resultado en disputa</Badge>;
  if (counts.completed === counts.total) return <Badge tone="acid">Completa</Badge>;
  if (counts.postponed > 0) return <Badge tone="warning">Con partidos aplazados</Badge>;
  if (counts.completed > 0) {
    return (
      <Badge tone="cyan">
        {counts.completed} de {counts.total} jugados
      </Badge>
    );
  }
  return <Badge tone="neutral">Pendiente</Badge>;
}
