/**
 * Estado de la competición y resumen numérico.
 *
 * Todas las cifras vienen de `/api/v1/tournament`. Aquí no se calcula ninguna:
 * si el backend no la da, no se muestra.
 */

import type { TournamentOverview, TournamentStatus } from '@liga/contracts';
import {
  CalendarCheck,
  CircleDot,
  FileText,
  Flag,
  PauseCircle,
  Radio,
  Scale,
  Trophy,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { percent, tournamentStatusLabel } from '../../lib/presentation.ts';
import { Badge, ProgressBar, StatTile, type Tone } from '../ui/primitives.tsx';

const STATUS_TONE: Readonly<Record<TournamentStatus, Tone>> = {
  DRAFT: 'neutral',
  REGISTRATION: 'cyan',
  READY: 'purple',
  SCHEDULED: 'purple',
  LIVE: 'magenta',
  FINISHED: 'acid',
  CANCELLED: 'danger',
};

const STATUS_ICON: Readonly<Record<TournamentStatus, LucideIcon>> = {
  DRAFT: FileText,
  REGISTRATION: Users,
  READY: Flag,
  SCHEDULED: CalendarCheck,
  LIVE: Radio,
  FINISHED: Trophy,
  CANCELLED: CircleDot,
};

export function LeagueStatusBadge({ status }: { status: TournamentStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} icon={STATUS_ICON[status]}>
      {tournamentStatusLabel(status)}
    </Badge>
  );
}

/**
 * Resumen de la competición.
 *
 * El progreso se mide sobre partidos finalizados, que son los únicos que
 * cuentan. Los aplazados y los que están en disputa aparecen aparte, porque no
 * son lo mismo que «pendientes de jugar».
 */
export function CompetitionSummary({ overview }: { overview: TournamentOverview }) {
  const { progress, roster, format } = overview;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Confirmados"
          value={`${roster.confirmed}/${roster.rosterSize}`}
          hint={roster.complete ? 'Plantilla completa' : `${roster.pending} plazas por confirmar`}
          tone={roster.complete ? 'acid' : 'warning'}
        />
        <StatTile label="Jornadas" value={format.rounds} hint={`${format.legs} vueltas`} />
        <StatTile
          label="Partidos"
          value={progress.total === 0 ? format.totalMatches : progress.total}
          hint={progress.total === 0 ? 'Calendario sin generar' : 'En el calendario'}
        />
        <StatTile label="Finalizados" value={progress.completed} tone="acid" />
        <StatTile label="Por jugar" value={progress.scheduled} hint="Programados" />
        <StatTile
          label="Aplazados"
          value={progress.postponed}
          tone={progress.postponed > 0 ? 'warning' : 'neutral'}
          hint="No cuentan como jugados"
        />
      </div>

      <div className="panel p-5">
        <ProgressBar
          value={percent(progress.ratio)}
          label={`Temporada · ${progress.completed} de ${progress.total} partidos finalizados`}
          tone="cyan"
        />
        <ul className="mt-4 flex flex-wrap gap-4 text-xs text-muted">
          {progress.live > 0 ? (
            <li className="flex items-center gap-1.5 text-magenta">
              <Radio aria-hidden="true" className="size-3.5" />
              {progress.live} en directo
            </li>
          ) : null}
          {progress.disputed > 0 ? (
            <li className="flex items-center gap-1.5 text-danger">
              <Scale aria-hidden="true" className="size-3.5" />
              {progress.disputed} en disputa
            </li>
          ) : null}
          {progress.postponed > 0 ? (
            <li className="flex items-center gap-1.5 text-warning">
              <PauseCircle aria-hidden="true" className="size-3.5" />
              {progress.postponed} aplazados
            </li>
          ) : null}
          <li className="flex items-center gap-1.5">
            <CalendarCheck aria-hidden="true" className="size-3.5" />
            {progress.currentRound === null
              ? 'Sin jornada en curso'
              : `Jornada en curso: ${progress.currentRound}`}
          </li>
        </ul>
      </div>
    </div>
  );
}
