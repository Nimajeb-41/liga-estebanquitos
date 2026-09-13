/**
 * Tarjeta de participante.
 *
 * Combina la ficha del jugador con su fila de la clasificación, si ya la tiene.
 * Cuando no ha jugado nada, se dice: no se muestra un cero que parezca un
 * resultado.
 */

import type { ParticipantStatus, PublicPlayer, StandingsRow } from '@liga/contracts';
import { ChevronRight } from 'lucide-react';

import {
  EMPTY_SLOT_LABEL,
  participantStatusLabel,
  podiumTone,
  signed,
} from '../../lib/presentation.ts';
import { Badge, type Tone } from '../ui/primitives.tsx';
import { FormIndicator } from '../standings/FormIndicator.tsx';
import { EmptySlotAvatar, PlayerAvatar } from './PlayerAvatar.tsx';

const STATUS_TONE: Readonly<Record<ParticipantStatus, Tone>> = {
  REGISTERED: 'neutral',
  CONFIRMED: 'acid',
  WITHDRAWN: 'danger',
  REPLACED: 'warning',
};

export function PlayerCard({
  player,
  row = null,
}: {
  player: PublicPlayer;
  row?: StandingsRow | null;
}) {
  return (
    <a
      href={`/jugadores/${player.slug}`}
      className="panel flex items-center gap-4 p-4 transition-colors hover:border-cyan/40"
    >
      <PlayerAvatar name={player.displayName} avatarUrl={player.avatarUrl} />

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-display font-semibold text-ink">{player.displayName}</span>
          <Badge tone={STATUS_TONE[player.status]}>{participantStatusLabel(player.status)}</Badge>
        </span>
        {row === null ? (
          <span className="mt-1 block text-xs text-faint">Sin partidos jugados todavía</span>
        ) : (
          <span className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span className="font-mono">{row.played} PJ</span>
            <span className="font-mono">{signed(row.crownDiff)} DC</span>
            <FormIndicator form={row.form} playerName={player.displayName} />
          </span>
        )}
      </span>

      {row === null ? null : (
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-right">
            <span className="block font-display text-xl font-bold text-ink">{row.points}</span>
            <span className="block text-[10px] tracking-[0.14em] text-faint uppercase">pts</span>
          </span>
          <span
            className={`inline-flex size-7 items-center justify-center rounded-md border font-display text-sm font-bold ${podiumTone(row.position)}`}
          >
            {row.position}
          </span>
        </span>
      )}
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-faint" />
    </a>
  );
}

/**
 * Plaza libre.
 *
 * Se ve como un hueco, con la etiqueta que define el dominio. No es un jugador
 * fantasma ni un nombre inventado.
 *
 * La propiedad no se llama `slot` porque en Astro ese atributo esta reservado
 * para los slots con nombre: se lo quedaria el compilador.
 */
export function EmptySlotCard({ slotNumber }: { slotNumber: number }) {
  return (
    <div className="flex items-center gap-4 rounded-panel border border-dashed border-line p-4">
      <EmptySlotAvatar />
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-sm text-faint">{EMPTY_SLOT_LABEL}</span>
        <span className="mt-1 block text-xs text-faint">Plaza {slotNumber} sin confirmar</span>
      </span>
    </div>
  );
}
