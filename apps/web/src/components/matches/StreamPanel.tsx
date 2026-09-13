/**
 * Transmisión de un partido.
 *
 * No todos los partidos se transmiten. Si no hay URL, no se dibuja un botón
 * roto: no se dibuja nada. Y la URL que llega del backend se comprueba antes de
 * convertirla en enlace: solo http y https, y con `rel` defensivo.
 */

import type { Match } from '@liga/contracts';
import { ExternalLink, Radio, Video } from 'lucide-react';

/** Solo se enlaza lo que es una URL http(s) bien formada. */
export function safeExternalUrl(value: string | null): string | null {
  if (value === null || value.length === 0) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function StreamPanel({ match }: { match: Match }) {
  const live = safeExternalUrl(match.stream.url);
  const vod = safeExternalUrl(match.stream.vodUrl);

  if (live === null && vod === null) return null;

  const platform = match.stream.platform ?? 'la plataforma indicada';

  return (
    <div className="panel p-5">
      <h2 className="font-display text-base font-semibold">Transmisión</h2>
      <p className="mt-1 text-sm text-muted">
        Este partido tiene contenido disponible en {platform}. El enlace lleva fuera de este sitio.
      </p>
      <p className="mt-4 flex flex-wrap gap-3">
        {live === null ? null : (
          <a
            href={live}
            target="_blank"
            rel="noopener noreferrer external"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-magenta/50 bg-magenta/10 px-4 text-sm font-semibold text-magenta transition-colors hover:bg-magenta/20"
          >
            <Radio aria-hidden="true" className="size-4" />
            Ver en directo
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        )}
        {vod === null ? null : (
          <a
            href={vod}
            target="_blank"
            rel="noopener noreferrer external"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-elevated px-4 text-sm font-semibold text-ink transition-colors hover:border-cyan/50"
          >
            <Video aria-hidden="true" className="size-4" />
            Ver la repetición
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        )}
      </p>
    </div>
  );
}
