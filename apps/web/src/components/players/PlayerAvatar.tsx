/**
 * Avatar de un participante.
 *
 * Mientras no haya imagen real se usa un monograma con un acento estable
 * derivado del nombre. No es un avatar inventado: es un hueco identificable.
 */

import { avatarTone, initials } from '../../lib/presentation.ts';

const RING: Readonly<Record<string, string>> = {
  cyan: 'border-cyan/45 text-cyan',
  magenta: 'border-magenta/45 text-magenta',
  purple: 'border-purple/45 text-purple',
  acid: 'border-acid/45 text-acid',
};

const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-16 text-lg',
} as const;

export function PlayerAvatar({
  name,
  avatarUrl = null,
  size = 'md',
}: {
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZES;
}) {
  if (avatarUrl !== null && avatarUrl.length > 0) {
    return (
      <img
        src={avatarUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={`${SIZES[size]} rounded-full border border-line object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${SIZES[size]} ${RING[avatarTone(name)] ?? RING['cyan']} inline-flex items-center justify-center rounded-full border bg-elevated font-display font-semibold`}
    >
      {initials(name)}
    </span>
  );
}

/** Plaza sin ocupar. Se ve como un hueco, no como un jugador fantasma. */
export function EmptySlotAvatar({ size = 'md' }: { size?: keyof typeof SIZES }) {
  return (
    <span
      aria-hidden="true"
      className={`${SIZES[size]} inline-flex items-center justify-center rounded-full border border-dashed border-line-strong bg-transparent font-mono text-faint`}
    >
      ?
    </span>
  );
}
