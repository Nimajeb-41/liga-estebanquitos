/**
 * Programar la temporada entera.
 *
 * El caso de esta liga: **tres jornadas cada sábado**. Dieciocho jornadas salen
 * en seis sábados, quince partidos por día.
 *
 * El formulario muestra la cuenta antes de enviar nada —cuántas sesiones,
 * cuántos partidos, cuánto dura un día— porque «tres jornadas el sábado» suena
 * razonable hasta que se ve que son siete horas seguidas.
 *
 * Respeta las mismas reglas que programar una jornada suelta: solo toca
 * partidos programados y no pisa una fecha ya puesta salvo que se marque
 * expresamente.
 */

import type { TournamentOverview } from '@liga/contracts';
import { CalendarRange } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../ui/primitives.tsx';
import { ActionError, useAdminAction } from './actions.tsx';

const field =
  'min-h-11 w-full rounded-lg border border-line bg-elevated px-3 text-sm text-ink focus:border-cyan focus:outline-none';
const labelClass = 'mb-1.5 block text-xs text-faint';

/** `2026-10-10T20:00` para el input, a partir de una fecha. */
function toLocalInput(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** El próximo sábado a las 20:00: el hueco por defecto de esta liga. */
function nextSaturday(): string {
  const date = new Date();
  date.setHours(20, 0, 0, 0);
  const days = (6 - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + days);
  return toLocalInput(date);
}

function hours(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function SeasonSchedule({ overview }: { overview: TournamentOverview }) {
  const action = useAdminAction();
  const [startAt, setStartAt] = useState(nextSaturday());
  const [roundsPerSession, setRounds] = useState('3');
  const [daysBetween, setDays] = useState('7');
  const [interval, setInterval] = useState('30');
  const [roundGap, setGap] = useState('15');
  const [overwrite, setOverwrite] = useState(false);

  const totalRounds = overview.format.rounds;
  const perRound = overview.format.matchesPerRound;
  const perSession = Math.max(Number(roundsPerSession) || 1, 1);
  const sessions = Math.ceil(totalRounds / perSession);

  /*
    Duración de una sesión: los partidos de cada jornada más los descansos
    entre ellas. Es una estimación de la ventana, no una promesa: un partido
    puede alargarse.
  */
  const spanPerRound = Math.max(perRound - 1, 0) * (Number(interval) || 0);
  const sessionMinutes = spanPerRound * perSession + (perSession - 1) * (Number(roundGap) || 0);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const ok = await action.run('rounds/schedule-season', {
      body: {
        startAt: new Date(startAt).toISOString(),
        roundsPerSession: Number(roundsPerSession),
        daysBetweenSessions: Number(daysBetween),
        intervalMinutes: Number(interval),
        roundGapMinutes: Number(roundGap),
        overwrite,
      },
    });
    if (ok) window.location.reload();
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="temp-inicio" className={labelClass}>
            Primer partido de la primera sesión
          </label>
          <input
            id="temp-inicio"
            type="datetime-local"
            required
            value={startAt}
            onChange={(event) => setStartAt(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="temp-jornadas" className={labelClass}>
            Jornadas por sesión
          </label>
          <input
            id="temp-jornadas"
            type="number"
            min={1}
            max={totalRounds}
            required
            value={roundsPerSession}
            onChange={(event) => setRounds(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="temp-dias" className={labelClass}>
            Días entre sesiones
          </label>
          <input
            id="temp-dias"
            type="number"
            min={1}
            max={60}
            required
            value={daysBetween}
            onChange={(event) => setDays(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="temp-intervalo" className={labelClass}>
            Minutos entre partidos
          </label>
          <input
            id="temp-intervalo"
            type="number"
            min={0}
            max={1440}
            required
            value={interval}
            onChange={(event) => setInterval(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="temp-descanso" className={labelClass}>
            Descanso entre jornadas
          </label>
          <input
            id="temp-descanso"
            type="number"
            min={0}
            max={1440}
            required
            value={roundGap}
            onChange={(event) => setGap(event.target.value)}
            className={field}
          />
        </div>
        <div className="flex items-end">
          <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(event) => setOverwrite(event.target.checked)}
              className="size-4 rounded border-line bg-elevated accent-cyan"
            />
            Reescribir las fechas ya puestas
          </label>
        </div>
      </div>

      {/* La cuenta, antes de enviar nada. */}
      <p
        role="note"
        className="mt-4 rounded-md border border-line bg-elevated px-3 py-2.5 text-sm text-muted"
      >
        <strong className="text-ink">{sessions}</strong> {sessions === 1 ? 'sesión' : 'sesiones'} de{' '}
        <strong className="text-ink">{perSession * perRound}</strong> partidos, cada {daysBetween}{' '}
        {Number(daysBetween) === 1 ? 'día' : 'días'}. Cada sesión dura unas{' '}
        <strong className="text-ink">{hours(sessionMinutes)}</strong> desde el primer partido hasta
        el último.
      </p>

      <div className="mt-4">
        <Button
          type="submit"
          icon={CalendarRange}
          busy={action.busy}
          disabled={action.busy || startAt === ''}
        >
          Programar la temporada
        </Button>
      </div>

      <p className="mt-3 text-xs text-faint">
        {overwrite
          ? 'Se reescribirán todas las fechas de los partidos programados, incluidas las acordadas a mano.'
          : 'Los partidos que ya tienen fecha se quedan como están. Los aplazados, cancelados y terminados no se tocan nunca.'}
      </p>
      <ActionError failure={action.failure} />
    </form>
  );
}
