/**
 * Marcador en directo.
 *
 * Importante: hoy la plataforma no recibe coronas batalla a batalla. Lo único
 * que llega en tiempo real es el estado del partido y, cuando alguien lo
 * registra, el resultado. Así que este componente no finge un marcador: dice
 * que está esperando datos, y en cuanto existen los muestra.
 *
 * Sondea al propio servidor de Astro, no a la API. El intervalo es
 * configurable, se pausa con la pestaña oculta y se detiene cuando el partido
 * deja de estar en juego: nunca se queda pidiendo datos para siempre.
 */

import type { Match, MatchResultView, MatchStatus } from '@liga/contracts';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { relativeFromNow } from '../../lib/presentation.ts';
import { MatchScore } from './MatchScore.tsx';
import { LiveDot, MatchStatusBadge } from './MatchStatus.tsx';

interface Snapshot {
  readonly status: MatchStatus;
  readonly result: MatchResultView | null;
  readonly fetchedAt: string;
}

/** Intervalo por defecto. Suficiente para un partido y suave con el servidor. */
const DEFAULT_SECONDS = 20;
const MIN_SECONDS = 5;

function pollSeconds(): number {
  const raw = import.meta.env.PUBLIC_LIVE_POLL_SECONDS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SECONDS;
  return Math.max(MIN_SECONDS, Math.round(parsed));
}

export function LiveMatch({ match }: { match: Match }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    status: match.status,
    result: match.result,
    fetchedAt: new Date().toISOString(),
  });
  const [offline, setOffline] = useState(false);
  const [tick, setTick] = useState(0);
  const failures = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/partidos/${match.id}/live.json`, {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(String(response.status));
      const payload = (await response.json()) as Snapshot;
      setSnapshot(payload);
      setOffline(false);
      failures.current = 0;
    } catch {
      // Tres fallos seguidos antes de avisar: un corte de un segundo no tiene
      // por qué asustar a nadie.
      failures.current += 1;
      if (failures.current >= 3) setOffline(true);
    }
  }, [match.id]);

  useEffect(() => {
    if (snapshot.status !== 'LIVE') return;

    const interval = pollSeconds() * 1000;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = (): void => {
      if (timer !== null) return;
      timer = setInterval(() => void refresh(), interval);
    };
    const stop = (): void => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = (): void => {
      if (document.hidden) {
        stop();
      } else {
        void refresh();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh, snapshot.status]);

  // Reloj propio para que «actualizado hace…» avance sin volver a pedir datos.
  useEffect(() => {
    if (snapshot.status !== 'LIVE') return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [snapshot.status]);

  const live = snapshot.status === 'LIVE';

  return (
    <div
      className={`panel relative overflow-hidden p-6 text-center ${live ? 'edge-live' : ''}`}
      aria-live="polite"
      aria-atomic="true"
      data-tick={tick}
    >
      <p className="flex items-center justify-center gap-3">
        {live ? <LiveDot /> : <MatchStatusBadge status={snapshot.status} />}
      </p>

      {snapshot.result === null ? (
        <div className="py-6">
          <p className="font-display text-2xl font-semibold text-muted">
            {live ? 'Esperando datos en vivo.' : 'Sin resultado todavía.'}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-faint">
            {live
              ? 'El partido está en juego. La plataforma todavía no recibe las coronas batalla a batalla: el marcador aparecerá en cuanto se registre el resultado.'
              : 'Cuando el resultado se registre y se valide, aparecerá aquí.'}
          </p>
        </div>
      ) : (
        <div className="py-4">
          <MatchScore
            result={snapshot.result}
            homeName={match.home.displayName}
            awayName={match.away.displayName}
            size="lg"
          />
          <p className="mt-3 flex items-center justify-center gap-6 text-sm text-muted">
            <span className="truncate">{match.home.displayName}</span>
            <span className="truncate">{match.away.displayName}</span>
          </p>
        </div>
      )}

      <p className="mt-2 flex items-center justify-center gap-2 font-mono text-[11px] tracking-wide text-faint uppercase">
        {offline ? (
          <>
            <WifiOff aria-hidden="true" className="size-3.5 text-warning" />
            <span className="text-warning">Sin conexión con el servidor</span>
          </>
        ) : (
          <>
            <RefreshCw aria-hidden="true" className="size-3.5" />
            Actualizado {relativeFromNow(new Date(snapshot.fetchedAt))}
          </>
        )}
      </p>
    </div>
  );
}
