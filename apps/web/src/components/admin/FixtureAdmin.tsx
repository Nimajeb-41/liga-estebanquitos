/**
 * Generación del calendario oficial.
 *
 * La semilla se guarda con el calendario: con ella, el mismo sorteo se puede
 * reproducir y comprobar. Regenerar borra el anterior, así que exige
 * confirmarlo dos veces: la casilla y el diálogo.
 */

import type { TournamentOverview } from '@liga/contracts';
import { AlertTriangle, Check, CircleDashed, Dices, LockKeyhole } from 'lucide-react';
import { useState } from 'react';

import { formatDateTime, tournamentStatusLabel } from '../../lib/presentation.ts';
import { Button } from '../ui/primitives.tsx';
import { ActionError, useAdminAction } from './actions.tsx';

export function FixtureAdmin({ overview }: { overview: TournamentOverview }) {
  const action = useAdminAction();
  const [seed, setSeed] = useState('');
  const [replace, setReplace] = useState(false);

  /*
    Generar el calendario exige dos cosas: la plantilla completa y un estado que
    lo permita. Las dos se comprueban aqui para poder decir **cual** falta.

    Antes la pantalla decia «y que el torneo este en un estado que lo admita»,
    el boton parecia disponible, y al pulsarlo salia un codigo de error. Quien
    no conoce los estados por dentro no tenia forma de saber que hacer.
  */
  const rosterReady = overview.roster.complete;
  const statusAllows = overview.capabilities.includes('GENERATE_FIXTURE');
  const canGenerate = rosterReady && statusAllows;
  /** ¿Se puede pasar a READY desde aqui? Es el paso que suele faltar. */
  const canReady = overview.allowedTransitions.includes('READY');

  const toReady = async (): Promise<void> => {
    const ok = await action.run('tournament/status', { body: { status: 'READY' } });
    if (ok) window.location.reload();
  };

  const generate = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (
      replace &&
      !window.confirm(
        'Regenerar el calendario borra el actual y todo lo asociado a sus partidos. ¿Continuar?',
      )
    ) {
      return;
    }
    const ok = await action.run('fixture/generate', {
      body: {
        ...(seed.trim() === '' ? {} : { seed: seed.trim() }),
        ...(replace ? { replaceExisting: true } : {}),
      },
    });
    if (ok) window.location.reload();
  };

  return (
    <form onSubmit={(event) => void generate(event)} className="panel p-5">
      <h2 className="font-display text-base font-semibold">Calendario oficial</h2>

      {overview.fixture.generated ? (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-faint">Partidos</dt>
            <dd className="mt-0.5 font-mono">{overview.fixture.matches}</dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Semilla</dt>
            <dd className="mt-0.5 truncate font-mono">{overview.fixture.seed ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Generado</dt>
            <dd className="mt-0.5 font-mono">{formatDateTime(overview.fixture.generatedAt)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-muted">Todavía no hay calendario. Hacen falta dos cosas:</p>
      )}

      {overview.fixture.generated || canGenerate ? null : (
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex items-start gap-2.5">
            {rosterReady ? (
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-acid" />
            ) : (
              <CircleDashed aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            )}
            <span className={rosterReady ? 'text-muted' : ''}>
              Plantilla completa:{' '}
              <strong className={rosterReady ? 'text-acid' : 'text-warning'}>
                {overview.roster.confirmed}/{overview.roster.rosterSize}
              </strong>{' '}
              confirmados.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            {statusAllows ? (
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-acid" />
            ) : (
              <CircleDashed aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            )}
            <span>
              El torneo tiene que estar en <strong>preparado</strong>; ahora está en{' '}
              <strong className="text-warning">{tournamentStatusLabel(overview.status)}</strong>.
              {statusAllows ? null : (
                <span className="mt-2 block text-xs text-muted">
                  Cerrar la inscripción fija quién compite: a partir de ahí no se añade ni se quita
                  gente, aunque los nombres sí se pueden seguir corrigiendo.
                </span>
              )}
            </span>
          </li>
        </ul>
      )}

      {canGenerate || overview.fixture.generated || !rosterReady || !canReady ? null : (
        <div className="mt-4">
          <Button
            type="button"
            icon={LockKeyhole}
            busy={action.busy}
            disabled={action.busy}
            onClick={() => void toReady()}
          >
            Cerrar la inscripción y preparar el torneo
          </Button>
        </div>
      )}

      <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label htmlFor="semilla" className="mb-1.5 block text-xs text-faint">
            Semilla (opcional). Con la misma semilla sale el mismo sorteo.
          </label>
          <input
            id="semilla"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            maxLength={120}
            placeholder="Se genera una si se deja vacía"
            className="min-h-11 w-full rounded-lg border border-line bg-elevated px-3 text-sm text-ink placeholder:text-faint focus:border-cyan focus:outline-none"
          />
        </div>
        <Button
          type="submit"
          icon={Dices}
          busy={action.busy}
          disabled={action.busy || !canGenerate}
        >
          {overview.fixture.generated ? 'Regenerar' : 'Generar calendario'}
        </Button>
      </div>

      {overview.fixture.generated ? (
        <label className="mt-4 flex items-start gap-2.5 rounded-md border border-danger/40 bg-danger/5 px-3 py-2.5 text-sm text-danger">
          <input
            type="checkbox"
            checked={replace}
            onChange={(event) => setReplace(event.target.checked)}
            className="mt-0.5 size-4 accent-current"
          />
          <span className="flex items-start gap-2">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Sí, quiero reemplazar el calendario actual. Se borran sus partidos, sus resultados y sus
            aplazamientos.
          </span>
        </label>
      ) : null}

      <ActionError failure={action.failure} />
    </form>
  );
}
