/**
 * Panel del operador de transmisión.
 *
 * Su trabajo es una sola cosa: dar una URL lista para pegar en una fuente de
 * navegador de OBS. Todo lo demás —elegir partido, ajustar tamaño, elegir
 * variante— existe para que esa URL salga bien a la primera, porque el
 * operador la va a configurar cinco minutos antes de empezar y no va a leer
 * documentación.
 *
 * No cambia nada de la competición: es un generador de enlaces con vista
 * previa. Los enlaces de transmisión de cada partido se editan en su ficha
 * administrativa, que es donde queda la auditoría.
 */

import type { Match } from '@liga/contracts';
import { Check, Copy, ExternalLink, MonitorPlay } from 'lucide-react';
import { useMemo, useState } from 'react';

import { formatDateTime, matchStatusLabel } from '../../lib/presentation.ts';
import { Button } from '../ui/primitives.tsx';

const field =
  'min-h-11 w-full rounded-lg border border-line bg-elevated px-3 text-sm text-ink focus:border-cyan focus:outline-none';
const labelClass = 'mb-1.5 block text-xs text-faint';

/** Resolución típica de una escena a 1080p, para que la vista previa no engañe. */
const PREVIEW_WIDTH = 1280;
const PREVIEW_HEIGHT = 360;

export function StreamControl({ matches, origin }: { matches: readonly Match[]; origin: string }) {
  const [matchId, setMatchId] = useState(matches[0]?.id ?? '');
  const [variant, setVariant] = useState<'full' | 'compact'>('full');
  const [scale, setScale] = useState('1');
  const [minimal, setMinimal] = useState(false);
  const [copied, setCopied] = useState(false);

  const selected = matches.find((match) => match.id === matchId) ?? null;

  const path = useMemo(() => {
    if (matchId === '') return '';
    const query = new URLSearchParams();
    if (variant === 'compact') query.set('variant', 'compact');
    if (scale !== '1') query.set('scale', scale);
    if (minimal) query.set('minimal', '1');
    const suffix = query.toString();
    return `/overlay/match/${matchId}${suffix === '' ? '' : `?${suffix}`}`;
  }, [matchId, variant, scale, minimal]);

  const url = path === '' ? '' : `${origin}${path}`;

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles el campo sigue siendo seleccionable a mano.
      setCopied(false);
    }
  };

  if (matches.length === 0) {
    return (
      <p className="panel p-5 text-sm text-muted">
        No hay ningún partido en el calendario todavía. El overlay necesita un partido concreto:
        genera el calendario y vuelve.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <h2 className="font-display text-base font-semibold">1 · Elige el partido</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="stream-partido" className={labelClass}>
              Partido
            </label>
            <select
              id="stream-partido"
              value={matchId}
              onChange={(event) => setMatchId(event.target.value)}
              className={field}
            >
              {matches.map((match) => (
                <option key={match.id} value={match.id}>
                  J{String(match.roundNumber).padStart(2, '0')} · {match.home.displayName} vs{' '}
                  {match.away.displayName} · {matchStatusLabel(match.status)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="stream-variante" className={labelClass}>
              Colocación
            </label>
            <select
              id="stream-variante"
              value={variant}
              onChange={(event) => setVariant(event.target.value as 'full' | 'compact')}
              className={field}
            >
              <option value="full">Tercio inferior, centrado</option>
              <option value="compact">Esquina superior izquierda</option>
            </select>
          </div>

          <div>
            <label htmlFor="stream-escala" className={labelClass}>
              Tamaño
            </label>
            <select
              id="stream-escala"
              value={scale}
              onChange={(event) => setScale(event.target.value)}
              className={field}
            >
              <option value="0.75">75 %</option>
              <option value="1">100 %</option>
              <option value="1.25">125 %</option>
              <option value="1.5">150 %</option>
              <option value="2">200 %</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={minimal}
                onChange={(event) => setMinimal(event.target.checked)}
                className="size-4 accent-cyan"
              />
              Solo nombres y marcador (sin jornada ni estado)
            </label>
          </div>
        </div>

        {selected === null ? null : (
          <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-faint">Estado</dt>
              <dd className="mt-0.5">{matchStatusLabel(selected.status)}</dd>
            </div>
            <div>
              <dt className="text-faint">Fecha prevista</dt>
              <dd className="mt-0.5">{formatDateTime(selected.scheduledAt)}</dd>
            </div>
            <div>
              <dt className="text-faint">Marcador</dt>
              <dd className="mt-0.5 font-mono">
                {selected.result === null
                  ? 'Sin registrar'
                  : `${selected.result.homeCrowns}–${selected.result.awayCrowns}`}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="font-display text-base font-semibold">2 · Copia la URL en OBS</h2>
        <p className="mt-1 text-sm text-muted">
          En OBS: <strong>Fuentes → + → Navegador</strong>, pega esta URL y marca «Fondo
          transparente». Ancho {PREVIEW_WIDTH}, alto {PREVIEW_HEIGHT} es un punto de partida
          razonable para 1080p.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="stream-url" className={labelClass}>
              URL del overlay
            </label>
            <input
              id="stream-url"
              type="text"
              readOnly
              value={url}
              onFocus={(event) => event.target.select()}
              className={`${field} font-mono text-xs`}
            />
          </div>
          <Button
            type="button"
            icon={copied ? Check : Copy}
            onClick={() => void copy()}
            variant="secondary"
          >
            {copied ? 'Copiada' : 'Copiar'}
          </Button>
          <Button
            type="button"
            icon={ExternalLink}
            variant="ghost"
            onClick={() => window.open(path, '_blank', 'noopener')}
          >
            Abrir aparte
          </Button>
        </div>

        <p className="mt-3 text-xs text-faint">
          El overlay se actualiza solo cada diez segundos. No hace falta recargar la fuente cuando
          se registre el resultado.
        </p>
      </section>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <MonitorPlay aria-hidden="true" className="size-4 text-cyan" />3 · Vista previa
        </h2>
        <p className="mt-1 text-sm text-muted">
          Sobre un tablero de transparencia, que es lo que hay debajo en OBS. Lo que se ve aquí es
          exactamente lo que va a componerse sobre el vídeo.
        </p>

        <div className="relative mt-4 overflow-x-auto">
          <div
            className="checkerboard rounded-panel border border-line"
            style={{ width: PREVIEW_WIDTH, maxWidth: '100%' }}
          >
            {path === '' ? null : (
              <iframe
                key={path}
                src={path}
                title="Vista previa del overlay"
                width={PREVIEW_WIDTH}
                height={PREVIEW_HEIGHT}
                className="block w-full"
                style={{ border: 0, background: 'transparent', height: PREVIEW_HEIGHT }}
              />
            )}
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="font-display text-base font-semibold">Qué enseña y qué no</h2>
        <ul className="mt-2 space-y-2 text-sm text-muted">
          <li>
            Mientras no haya resultado registrado, el overlay pone <strong>VS</strong>, no un 0–0.
            La plataforma no recibe las coronas batalla a batalla, y un cero se leería como un
            marcador real.
          </li>
          <li>
            El estado que muestra es el mismo del sitio público: un aplazado dice «Aplazado» y uno
            en revisión dice «En revisión», también en pantalla.
          </li>
          <li>
            El overlay no lleva nada administrativo: ni notas, ni reportes, ni evidencia. Quien
            tenga el enlace ve lo mismo que en la ficha pública del partido.
          </li>
        </ul>
      </section>
    </div>
  );
}
