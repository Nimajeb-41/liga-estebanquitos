/**
 * Configuración de la temporada.
 *
 * Dos formularios y un aviso que importa más que los dos.
 *
 * La clasificación de esta liga **se deriva**: no se guarda. Cambiar la
 * puntuación no actualiza una tabla, la reescribe entera y hacia atrás,
 * incluidas las jornadas ya jugadas. Eso no se puede descubrir después de
 * pulsar el botón, así que la pantalla lo dice antes y el backend sube la
 * versión del reglamento para que las dos tablas se distingan.
 *
 * Qué se puede cambiar lo decide el backend (`editable`, `lockedReason`): esta
 * pantalla no deduce nada. Si el calendario ya existe, el número de
 * participantes viene bloqueado con su motivo, y aquí solo se muestra.
 */

import type { ConfigurableSettings, TournamentOverview } from '@liga/contracts';
import { AlertTriangle, Lock, Save } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../ui/primitives.tsx';
import { ActionError, useAdminAction } from './actions.tsx';

const field =
  'min-h-11 w-full rounded-lg border border-line bg-elevated px-3 text-sm text-ink placeholder:text-faint focus:border-cyan focus:outline-none disabled:opacity-40';
const labelClass = 'mb-1.5 block text-xs text-faint';

const GROUP_LABEL: Readonly<Record<string, string>> = {
  FORMAT: 'Formato',
  SCORING: 'Puntuación',
  OPERATIONAL: 'Operación',
};

/** `2026-10-08T22:00:00.000Z` → `2026-10-08T22:00`, que es lo que pide el input. */
function toLocalInput(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Identity({ overview }: { overview: TournamentOverview }) {
  const action = useAdminAction();
  const [name, setName] = useState(overview.name);
  const [season, setSeason] = useState(overview.season);
  const [start, setStart] = useState(toLocalInput(overview.plannedStartAt));
  const [end, setEnd] = useState(toLocalInput(overview.plannedEndAt));

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const iso = (value: string): string | null =>
      value.trim() === '' ? null : new Date(value).toISOString();

    const ok = await action.run('tournament', {
      method: 'PATCH',
      body: {
        name: name.trim(),
        season: season.trim(),
        plannedStartAt: iso(start),
        plannedEndAt: iso(end),
      },
    });
    if (ok) window.location.reload();
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="temporada-nombre" className={labelClass}>
            Nombre
          </label>
          <input
            id="temporada-nombre"
            type="text"
            required
            minLength={3}
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="temporada-id" className={labelClass}>
            Temporada
          </label>
          <input
            id="temporada-id"
            type="text"
            required
            minLength={3}
            maxLength={20}
            value={season}
            onChange={(event) => setSeason(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="temporada-inicio" className={labelClass}>
            Inicio previsto
          </label>
          <input
            id="temporada-inicio"
            type="datetime-local"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="temporada-fin" className={labelClass}>
            Fin previsto
          </label>
          <input
            id="temporada-fin"
            type="datetime-local"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className={field}
          />
        </div>
      </div>

      <div className="mt-4">
        <Button type="submit" icon={Save} busy={action.busy} disabled={action.busy}>
          Guardar
        </Button>
      </div>
      <p className="mt-3 text-xs text-faint">
        Son fechas <strong>previstas</strong>. Cuándo empezó y terminó de verdad se registra solo, y
        se conserva aparte para poder decir «empezó dos semanas tarde».
      </p>
      <ActionError failure={action.failure} />
    </form>
  );
}

function Rules({ settings }: { settings: ConfigurableSettings }) {
  const action = useAdminAction();
  const [reason, setReason] = useState('');

  const scoring = settings.parameters.find((parameter) => parameter.key === 'scoring');
  const warns = scoring?.recalculatesStandings === true;

  return (
    <div className="space-y-4">
      {warns ? (
        <p
          role="note"
          className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/5 px-3 py-2.5 text-xs text-warning"
        >
          <AlertTriangle aria-hidden="true" className="mt-px size-4 shrink-0" />
          <span>
            Cambiar la puntuación <strong>recalcula la clasificación hacia atrás</strong>, incluidas
            las jornadas ya jugadas. La versión del reglamento sube automáticamente para que las dos
            tablas se distingan.
          </span>
        </p>
      ) : null}

      <ul className="space-y-2">
        {settings.parameters.map((parameter) => (
          <li
            key={parameter.key}
            className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line px-3 py-2.5"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">{parameter.label}</span>
              <span className="font-mono text-[10px] tracking-[0.1em] text-faint uppercase">
                {GROUP_LABEL[parameter.group] ?? parameter.group}
              </span>
              {parameter.lockedReason === null ? null : (
                <span className="mt-1 block text-xs text-muted">{parameter.lockedReason}</span>
              )}
            </span>

            <span className="shrink-0 text-xs">
              {parameter.editable ? (
                parameter.recalculatesStandings ? (
                  <span className="text-warning">Recalcula la tabla</span>
                ) : (
                  <span className="text-muted">Ajustable</span>
                )
              ) : (
                <span className="inline-flex items-center gap-1.5 text-faint">
                  <Lock aria-hidden="true" className="size-3.5" />
                  Fijado
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget as HTMLFormElement;
          const data = new FormData(form);

          /*
            Solo viaja lo que se ha rellenado. Mandar el resto como `null`
            borraría valores que nadie pidió borrar, y algunos de esos `null`
            significan «esta regla sigue sin decidirse».
          */
          const body: Record<string, unknown> = { reason: String(data.get('reason') ?? '') };
          const win = data.get('win');
          const maxCrowns = data.get('winWithMaxCrowns');
          const tolerance = data.get('toleranceMinutes');
          const window_ = data.get('windowHours');

          const scoringChanges: Record<string, number> = {};
          if (String(win ?? '') !== '') scoringChanges['win'] = Number(win);
          if (String(maxCrowns ?? '') !== '') {
            scoringChanges['winWithMaxCrowns'] = Number(maxCrowns);
          }
          if (Object.keys(scoringChanges).length > 0) body['scoring'] = scoringChanges;
          if (String(tolerance ?? '') !== '') {
            body['noShow'] = { toleranceMinutes: Number(tolerance) };
          }
          if (String(window_ ?? '') !== '') {
            body['disputes'] = { windowHours: Number(window_) };
          }

          void action.run('tournament/settings', { method: 'PATCH', body }).then((ok) => {
            if (ok) window.location.reload();
          });
        }}
        className="rounded-panel border border-line p-4"
      >
        <p className="mb-3 text-sm text-muted">Deja en blanco lo que no quieras cambiar.</p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="cfg-win" className={labelClass}>
              Puntos por victoria
            </label>
            <input id="cfg-win" name="win" type="number" min={0} max={20} className={field} />
          </div>
          <div>
            <label htmlFor="cfg-max" className={labelClass}>
              Victoria con 3 coronas
            </label>
            <input
              id="cfg-max"
              name="winWithMaxCrowns"
              type="number"
              min={0}
              max={20}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="cfg-tolerance" className={labelClass}>
              Tolerancia (minutos)
            </label>
            <input
              id="cfg-tolerance"
              name="toleranceMinutes"
              type="number"
              min={0}
              max={240}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="cfg-window" className={labelClass}>
              Impugnación (horas)
            </label>
            <input
              id="cfg-window"
              name="windowHours"
              type="number"
              min={0}
              max={720}
              className={field}
            />
          </div>
        </div>

        <div className="mt-3">
          <label htmlFor="cfg-motivo" className={labelClass}>
            Motivo del cambio (queda registrado con tu nombre)
          </label>
          <textarea
            id="cfg-motivo"
            name="reason"
            required
            minLength={3}
            maxLength={500}
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className={`${field} py-2`}
          />
        </div>

        <div className="mt-3">
          <Button type="submit" icon={Save} busy={action.busy} disabled={action.busy}>
            Aplicar al reglamento
          </Button>
        </div>
        <ActionError failure={action.failure} />
      </form>
    </div>
  );
}

export function SeasonSettings({
  overview,
  settings,
}: {
  overview: TournamentOverview;
  settings: ConfigurableSettings;
}) {
  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <h2 className="font-display text-base font-semibold">Identidad y fechas</h2>
        <div className="mt-4">
          <Identity overview={overview} />
        </div>
      </section>

      <section className="panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-base font-semibold">Reglamento</h2>
          <p className="font-mono text-[11px] text-faint">versión {settings.rulesVersion}</p>
        </div>
        <div className="mt-4">
          <Rules settings={settings} />
        </div>
      </section>
    </div>
  );
}
