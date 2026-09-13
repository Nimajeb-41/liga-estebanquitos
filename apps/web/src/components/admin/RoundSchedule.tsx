/**
 * Programar una jornada entera.
 *
 * El caso real: «la jornada 4 se juega el sábado a las 20:00, uno cada media
 * hora». Hacerlo partido a partido son cinco formularios idénticos.
 *
 * La casilla de reescribir empieza apagada y lo dice claro: una fecha que ya
 * está puesta puede ser un acuerdo entre dos jugadores, y una programación en
 * bloque no es motivo suficiente para deshacerlo sin querer.
 */

import { CalendarRange } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../ui/primitives.tsx';
import { ActionError, useAdminAction } from './actions.tsx';

const field =
  'min-h-11 w-full rounded-lg border border-line bg-elevated px-3 text-sm text-ink placeholder:text-faint focus:border-cyan focus:outline-none';
const labelClass = 'mb-1.5 block text-xs text-faint';

export function RoundSchedule({
  roundNumber,
  pending,
}: {
  roundNumber: number;
  /** Cuántos partidos de la jornada están programados y sin fecha. */
  pending: number;
}) {
  const action = useAdminAction();
  const [startAt, setStartAt] = useState('');
  const [interval, setInterval] = useState('30');
  const [overwrite, setOverwrite] = useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const ok = await action.run(`rounds/${roundNumber}/schedule`, {
      body: {
        startAt: new Date(startAt).toISOString(),
        intervalMinutes: Number(interval),
        overwrite,
      },
    });
    if (ok) window.location.reload();
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="jornada-inicio" className={labelClass}>
            Primer partido
          </label>
          <input
            id="jornada-inicio"
            type="datetime-local"
            required
            value={startAt}
            onChange={(event) => setStartAt(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="jornada-intervalo" className={labelClass}>
            Minutos entre partidos
          </label>
          <input
            id="jornada-intervalo"
            type="number"
            min={0}
            max={1440}
            required
            value={interval}
            onChange={(event) => setInterval(event.target.value)}
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

      <div className="mt-4">
        <Button
          type="submit"
          icon={CalendarRange}
          busy={action.busy}
          disabled={action.busy || startAt === ''}
        >
          Programar la jornada
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted">
        {overwrite ? (
          <>
            Se reescribirá la fecha de <strong>todos</strong> los partidos programados de esta
            jornada, incluidos los que ya la tenían.
          </>
        ) : pending === 0 ? (
          <>
            Todos los partidos programados de esta jornada ya tienen fecha. Para cambiarlas hay que
            marcar «reescribir».
          </>
        ) : (
          <>
            Solo se tocan los {pending} {pending === 1 ? 'partido' : 'partidos'} sin fecha. Los
            aplazados, cancelados y terminados se quedan como están.
          </>
        )}
      </p>
      <ActionError failure={action.failure} />
    </form>
  );
}
