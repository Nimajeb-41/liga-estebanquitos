/**
 * Tarjeta de partido.
 *
 * Es el componente que más se repite en el sitio, así que aquí se concentran
 * las reglas de presentación que no pueden fallar:
 *
 * - un partido aplazado no se muestra como derrota ni como jugado;
 * - un resultado en disputa no se presenta como definitivo;
 * - las coronas y los puntos vienen del backend, nunca se calculan aquí;
 * - si el reglamento todavía no define los puntos, se dice, no se inventa.
 */

import type { Match } from '@liga/contracts';
import {
  CalendarClock,
  ChevronRight,
  ExternalLink,
  PauseCircle,
  Radio,
  Scale,
  UserX,
} from 'lucide-react';

import {
  countsForStandings,
  formatDateTime,
  roundLabel,
  signed,
  VICTORY_TYPE_LABELS,
} from '../../lib/presentation.ts';
import { CrownRow } from './MatchScore.tsx';
import { LiveDot, MatchStatusBadge } from './MatchStatus.tsx';

function SideRow({
  name,
  crowns,
  won,
  points,
  show,
}: {
  name: string;
  crowns: number | null;
  won: boolean;
  points: number | null;
  /** `false` cuando el partido no tiene resultado que enseñar. */
  show: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className={`truncate text-sm font-medium ${won ? 'text-ink' : 'text-muted'}`}>
        {name}
      </span>
      {show && crowns !== null ? (
        <span className="flex shrink-0 items-center gap-2.5">
          <CrownRow crowns={crowns} won={won} />
          <span
            className={`w-4 text-right font-display text-lg font-bold ${
              won ? 'text-acid' : 'text-muted'
            }`}
          >
            {crowns}
          </span>
          <span className="w-8 text-right font-mono text-xs text-faint">
            {points === null ? '—' : signed(points)}
          </span>
        </span>
      ) : (
        <span aria-hidden="true" className="font-mono text-sm text-faint">
          –
        </span>
      )}
    </div>
  );
}

export function MatchCard({
  match,
  className = '',
  watchUrl = null,
}: {
  match: Match;
  className?: string;
  /*
    A dónde se ve este partido **ahora mismo**, o `null`.

    No se deduce de `status === 'LIVE'`: que administración haya marcado el
    partido en juego no significa que haya nadie emitiéndolo. Quien pinta la
    tarjeta sabe si el canal está en directo con Clash Royale; la tarjeta no.
  */
  watchUrl?: string | null;
}) {
  const live = match.status === 'LIVE';
  const postponed = match.status === 'POSTPONED';
  const disputed = match.status === 'DISPUTED';
  // Un aplazado o un cancelado no enseñan marcador aunque hubiera algo guardado:
  // el estado manda sobre el dato.
  const showResult = match.result !== null && !postponed && match.status !== 'CANCELLED';
  /*
    Una incomparecencia no tiene marcador: no se jugo. Enseñar 0-0 con sus
    coronas vacias se leeria como un empate a cero disputado, que es
    exactamente lo contrario de lo que paso.
  */
  const walkover = showResult && match.result?.victoryType === 'WALKOVER';

  return (
    <article
      className={`panel flex flex-col gap-3 p-4 transition-colors hover:border-line-strong ${
        live ? 'edge-live' : ''
      } ${className}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs tracking-wide text-faint">
          {roundLabel(match.roundNumber)}
        </span>
        {live ? <LiveDot /> : <MatchStatusBadge status={match.status} />}
      </header>

      <div className="divide-y divide-line/70">
        <SideRow
          name={match.home.displayName}
          crowns={match.result?.homeCrowns ?? null}
          won={match.result?.outcome === 'HOME_WIN'}
          points={match.result?.points?.home ?? null}
          show={showResult && !walkover}
        />
        <SideRow
          name={match.away.displayName}
          crowns={match.result?.awayCrowns ?? null}
          won={match.result?.outcome === 'AWAY_WIN'}
          points={match.result?.points?.away ?? null}
          show={showResult && !walkover}
        />
      </div>

      {live && watchUrl !== null ? (
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-sfx="live"
          className="flex items-center justify-center gap-2 rounded-md bg-magenta px-3 py-2 text-xs font-bold text-void transition-transform duration-200 hover:scale-[1.02]"
        >
          <Radio aria-hidden="true" className="size-3.5" />
          Ver en directo
          <ExternalLink aria-hidden="true" className="size-3 opacity-70" />
        </a>
      ) : null}

      {walkover && match.result !== null ? (
        <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
          <UserX aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span>
            <strong>Walkover</strong>: gana{' '}
            {match.result.outcome === 'HOME_WIN' ? match.home.displayName : match.away.displayName}{' '}
            por incomparecencia. Sin coronas ni marcador.
          </span>
        </p>
      ) : null}

      {postponed ? (
        <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
          <PauseCircle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span>
            Aplazado{match.postponementCount > 1 ? ` ${match.postponementCount} veces` : ''}. No
            puntúa ni cuenta como jugado. Fecha original:{' '}
            {formatDateTime(match.originalScheduledAt)}.
          </span>
        </p>
      ) : null}

      {disputed ? (
        <p className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          <Scale aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span>Resultado en disputa: no cuenta en la clasificación hasta que se resuelva.</span>
        </p>
      ) : null}

      {showResult && match.result !== null && match.result.points === null ? (
        <p className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
          Puntuación pendiente de definición ·{' '}
          {VICTORY_TYPE_LABELS[match.result.victoryType].toLowerCase()}.
        </p>
      ) : null}

      <footer className="flex items-center justify-between gap-3 border-t border-line pt-3 text-xs">
        <span className="flex items-center gap-1.5 text-muted">
          <CalendarClock aria-hidden="true" className="size-3.5" />
          {formatDateTime(match.scheduledAt)}
        </span>
        <a
          href={`/partidos/${match.id}`}
          className="inline-flex items-center gap-1 font-medium text-cyan transition-colors hover:text-ink"
        >
          {countsForStandings(match.status) ? 'Ver resultado' : 'Ver partido'}
          <ChevronRight aria-hidden="true" className="size-3.5" />
          <span className="sr-only">
            {match.home.displayName} contra {match.away.displayName}
          </span>
        </a>
      </footer>
    </article>
  );
}
