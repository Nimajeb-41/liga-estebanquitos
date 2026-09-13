/**
 * Overlay de transmisión.
 *
 * Está pensado para vivir dentro de una fuente de navegador de OBS, no para
 * que lo lea nadie en una pestaña. Eso cambia todas las decisiones:
 *
 * - **Fondo transparente.** OBS compone sobre el vídeo; cualquier color de
 *   fondo taparía el juego.
 * - **Tipografía enorme y con sombra.** Se ve a 1080p sobre imágenes claras y
 *   oscuras indistintamente, que es lo que hay debajo.
 * - **Sin interacción.** Nadie puede hacer clic en una fuente de OBS.
 * - **Se actualiza solo.** El operador coloca la URL una vez y se olvida.
 *
 * Lo que **no** hace, y es lo importante: inventar un marcador. La plataforma
 * no recibe coronas batalla a batalla —eso sigue sin existir en la API de
 * Clash Royale—, así que mientras no haya resultado registrado el overlay
 * enseña el enfrentamiento, no un 0–0 que la gente leería como real.
 */

import type { Match, MatchResultView, MatchStatus } from '@liga/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Snapshot {
  readonly status: MatchStatus;
  readonly result: MatchResultView | null;
}

/** Intervalo del sondeo. Un directo tolera de sobra estos segundos. */
const POLL_SECONDS = 10;

const STATE_LABEL: Readonly<Record<MatchStatus, string>> = {
  SCHEDULED: 'Próximamente',
  LIVE: 'En directo',
  COMPLETED: 'Final',
  POSTPONED: 'Aplazado',
  DISPUTED: 'En revisión',
  CANCELLED: 'Cancelado',
};

export interface OverlayOptions {
  /** `compact` cabe en una esquina; `full` ocupa el tercio inferior. */
  readonly variant: 'full' | 'compact';
  /** Multiplicador de tamaño, para ajustar a la escena sin tocar OBS. */
  readonly scale: number;
  /** Oculta la jornada y el estado: solo nombres y marcador. */
  readonly minimal: boolean;
}

export function Overlay({ match, options }: { match: Match; options: OverlayOptions }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    status: match.status,
    result: match.result,
  });
  const root = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/partidos/${match.id}/live.json`, {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) return;
      const payload = (await response.json()) as Snapshot;
      setSnapshot({ status: payload.status, result: payload.result });
    } catch {
      // Un corte de red no puede tumbar el overlay en mitad de un directo: se
      // queda con lo último que sabía y vuelve a intentarlo al siguiente ciclo.
    }
  }, [match.id]);

  useEffect(() => {
    const timer = setInterval(() => void refresh(), POLL_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  /**
   * Entrada con GSAP, cargado solo en el navegador.
   *
   * Es la única animación: entra una vez y se queda quieto. Nada que se mueva
   * mientras alguien intenta leer un marcador en una transmisión.
   *
   * El overlay parte de **visible**, y es GSAP quien lo pone a cero para
   * animarlo. Al revés —arrancar invisible y confiar en que algo lo revele—
   * cualquier fallo deja la fuente de OBS en blanco durante todo el directo.
   * Aquí, si GSAP no llega, simplemente no hay animación.
   *
   * Y por eso la opacidad no puede vivir en el `style` de React: cada
   * repintado del sondeo volvería a aplicarla y pisaría lo que GSAP animó.
   */
  useEffect(() => {
    const element = root.current;
    if (element === null) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let cancelled = false;
    void import('gsap').then(({ gsap }) => {
      if (cancelled || root.current === null) return;
      gsap.fromTo(
        root.current,
        { opacity: 0, y: 28 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: 'power3.out',
          // Sin rastro inline al terminar: lo que quede manda sobre el CSS.
          clearProps: 'opacity,transform,translate,rotate,scale',
        },
      );
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const result = snapshot.result;
  const live = snapshot.status === 'LIVE';
  const compact = options.variant === 'compact';

  return (
    <div
      ref={root}
      style={{ fontSize: `${options.scale}rem` }}
      className={`overlay-root ${compact ? 'overlay-compact' : 'overlay-full'}`}
      data-status={snapshot.status}
    >
      {options.minimal ? null : (
        <p className="overlay-meta">
          <span>
            Jornada {String(match.roundNumber).padStart(2, '0')} · Partido{' '}
            {String(match.order).padStart(2, '0')}
          </span>
          <span className={`overlay-state ${live ? 'is-live' : ''}`}>
            {live ? <span aria-hidden="true" className="overlay-dot" /> : null}
            {result?.victoryType === 'WALKOVER' ? 'Walkover' : STATE_LABEL[snapshot.status]}
          </span>
        </p>
      )}

      <div className="overlay-scoreline">
        <span className="overlay-name overlay-name-home">{match.home.displayName}</span>

        <span className="overlay-score">
          {result === null ? (
            /* Un guion, nunca un 0–0: no hay marcador que enseñar todavía. */
            <span className="overlay-vs">VS</span>
          ) : result.victoryType === 'WALKOVER' ? (
            /*
              Incomparecencia: no hubo batalla. En pantalla, a este tamaño,
              un 0–0 se leería como un empate disputado.
            */
            <span className="overlay-walkover">W. O.</span>
          ) : (
            <>
              <span className="overlay-crowns">{result.homeCrowns}</span>
              <span className="overlay-sep">–</span>
              <span className="overlay-crowns">{result.awayCrowns}</span>
            </>
          )}
        </span>

        <span className="overlay-name overlay-name-away">{match.away.displayName}</span>
      </div>
    </div>
  );
}
