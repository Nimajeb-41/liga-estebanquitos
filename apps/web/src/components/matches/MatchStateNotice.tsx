/**
 * Qué significa el estado de un partido, en palabras.
 *
 * La etiqueta de color dice *cuál* es el estado; esto dice *qué implica*, que
 * es lo que de verdad hace falta saber: si cuenta en la tabla, si el marcador
 * es definitivo y qué falta para que lo sea.
 *
 * Los seis estados tienen aviso. Los tres «tranquilos» —programado, finalizado,
 * cancelado— lo tienen precisamente porque el silencio se interpreta: un
 * partido cancelado sin explicación se lee como un error de la página.
 *
 * Se renderiza en el servidor: no hay interactividad, así que no se envía nada
 * de JavaScript al navegador.
 */

import type { MatchDetail, MatchStatus } from '@liga/contracts';
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  PauseCircle,
  Radio,
  Scale,
  UserX,
  type LucideIcon,
} from 'lucide-react';

import {
  countsForStandings,
  formatDateTime,
  POSTPONEMENT_REASON_LABELS,
  roundLabel,
} from '../../lib/presentation.ts';

interface Notice {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly tone: string;
  readonly role?: 'alert';
  readonly body: React.ReactNode;
}

function notice(match: MatchDetail): Notice {
  const status: MatchStatus = match.status;

  switch (status) {
    case 'SCHEDULED':
      return {
        icon: CalendarClock,
        tone: 'border-line bg-elevated text-muted',
        title: 'Todavía no se ha jugado',
        body: (
          <>
            Está previsto para {formatDateTime(match.scheduledAt)}. Hasta que se juegue y se
            registre el resultado no suma nada a ninguno de los dos.
          </>
        ),
      };

    case 'LIVE':
      return {
        icon: Radio,
        tone: 'border-magenta/50 bg-magenta/5 text-magenta',
        title: 'Partido en directo',
        body: (
          <>
            El marcador que se ve abajo es provisional y se actualiza solo. No cuenta en la
            clasificación hasta que el partido termine y administración lo registre.
          </>
        ),
      };

    case 'COMPLETED':
      /*
        Una incomparecencia acaba en COMPLETED como cualquier otro partido,
        pero no se llego a jugar. Decir «resultado registrado» a secas
        dejaria creer que hubo batalla.
      */
      if (match.result?.victoryType === 'WALKOVER') {
        const ganador =
          match.result.outcome === 'HOME_WIN' ? match.home.displayName : match.away.displayName;
        const ausente =
          match.result.outcome === 'HOME_WIN' ? match.away.displayName : match.home.displayName;
        return {
          icon: UserX,
          tone: 'border-warning/50 bg-warning/5 text-warning',
          title: 'Walkover · incomparecencia',
          body: (
            <>
              {ausente} no se presentó dentro de la tolerancia, así que gana {ganador}. Cuenta como
              partido jugado y reparte los puntos de una victoria normal, pero{' '}
              <strong>no hubo batalla</strong>: no hay marcador ni coronas para ninguno de los dos.
            </>
          ),
        };
      }
      return {
        icon: CheckCircle2,
        tone: 'border-acid/40 bg-acid/5 text-acid',
        title: 'Resultado registrado',
        body: (
          <>
            El marcador es definitivo y ya cuenta en la clasificación. Si alguna vez se corrigiera,
            quedaría constancia en el historial de más abajo.
          </>
        ),
      };

    case 'POSTPONED':
      return {
        icon: PauseCircle,
        tone: 'border-warning/50 bg-warning/5 text-warning',
        title: 'Partido aplazado',
        body: (
          <>
            No puntúa, no suma coronas y no cuenta como jugado. Conserva su{' '}
            {roundLabel(match.roundNumber).toLowerCase()} original y se juega cuando se acuerde una
            fecha nueva.
          </>
        ),
      };

    case 'DISPUTED':
      return {
        icon: Scale,
        role: 'alert',
        tone: 'border-danger/50 bg-danger/5 text-danger',
        title: 'Resultado en disputa',
        body: (
          <>
            Los dos jugadores reportaron marcadores distintos. Está pendiente de resolución
            administrativa y <strong>no cuenta en la clasificación</strong> hasta que se resuelva.
          </>
        ),
      };

    case 'CANCELLED':
      return {
        icon: Ban,
        tone: 'border-line-strong bg-elevated text-faint',
        title: 'Partido cancelado',
        body: (
          <>
            No se jugará y no cuenta para nadie: ni como victoria, ni como derrota, ni como partido
            jugado. Sigue apareciendo en el calendario para que la jornada se entienda.
          </>
        ),
      };
  }
}

export function MatchStateNotice({ match }: { match: MatchDetail }) {
  const { icon: Icon, title, tone, body, role } = notice(match);

  return (
    <div
      {...(role === undefined ? {} : { role })}
      className={`rounded-panel border px-5 py-4 ${tone}`}
    >
      <p className="flex items-center gap-2 font-display font-semibold">
        <Icon aria-hidden="true" className="size-4" />
        {title}
      </p>
      <p className="mt-1 text-sm text-ink/90">{body}</p>
      <p className="mt-2 font-mono text-[11px] tracking-[0.1em] uppercase opacity-70">
        {countsForStandings(match.status)
          ? 'Cuenta en la clasificación'
          : 'No cuenta en la clasificación'}
      </p>
    </div>
  );
}

/**
 * Detalle de un aplazamiento.
 *
 * Va aparte del aviso porque son datos, no explicación: la fecha original, la
 * jornada que conserva, cuántas veces se movió y qué motivo se registró cada
 * vez. El texto libre que administración escribe al aplazar **no** sale aquí:
 * suele hablar de las circunstancias personales de alguien.
 */
export function PostponementDetail({ match }: { match: MatchDetail }) {
  const moves = match.history.postponements;

  return (
    <div className="rounded-panel border border-warning/40 bg-warning/[0.03] p-5">
      <h2 className="font-display text-base font-semibold">Detalle del aplazamiento</h2>

      <dl className="mt-4 grid gap-4 sm:grid-cols-4">
        <div>
          <dt className="text-[11px] tracking-[0.12em] text-faint uppercase">Jornada original</dt>
          <dd className="mt-0.5 font-mono text-sm">{roundLabel(match.roundNumber)}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-[0.12em] text-faint uppercase">Fecha original</dt>
          <dd className="mt-0.5 text-sm">{formatDateTime(match.originalScheduledAt)}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-[0.12em] text-faint uppercase">Nueva fecha</dt>
          <dd className="mt-0.5 text-sm">
            {match.scheduledAt === match.originalScheduledAt || match.scheduledAt === null
              ? 'Sin fecha nueva todavía'
              : formatDateTime(match.scheduledAt)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-[0.12em] text-faint uppercase">Aplazamientos</dt>
          <dd className="mt-0.5 font-mono text-sm">{match.postponementCount}</dd>
        </div>
      </dl>

      {moves.length === 0 ? (
        <p className="mt-4 border-t border-warning/20 pt-3 text-xs text-muted">
          El partido figura como aplazado, pero no hay ningún movimiento registrado en su historial.
        </p>
      ) : (
        <ol className="mt-4 space-y-2 border-t border-warning/20 pt-3">
          {moves.map((move, index) => (
            <li
              key={`${move.event}-${move.occurredAt}-${index}`}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
            >
              <span className="font-mono text-[11px] text-faint">
                {formatDateTime(move.occurredAt)}
              </span>
              <span className="font-medium">
                {move.event === 'POSTPONED' ? 'Aplazado' : 'Reprogramado'}
              </span>
              <span className="text-muted">
                {move.event === 'POSTPONED'
                  ? `· ${POSTPONEMENT_REASON_LABELS[move.reason]}, estaba previsto para ${formatDateTime(move.previousScheduledAt)}`
                  : `· pasa a ${formatDateTime(move.newScheduledAt)}, sigue en la jornada ${move.roundNumber}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
