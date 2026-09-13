/**
 * Estado del torneo.
 *
 * Solo ofrece las transiciones que el dominio declara posibles desde el estado
 * actual (`allowedTransitions`). Si además hace falta otra condición —para
 * pasar a READY tiene que estar la plantilla completa—, la comprueba el
 * backend y su error se muestra tal cual.
 */

import type { TournamentOverview } from '@liga/contracts';
import { ArrowRight } from 'lucide-react';

import { tournamentStatusLabel } from '../../lib/presentation.ts';
import { LeagueStatusBadge } from '../league/LeagueStatus.tsx';
import { ActionError, useAdminAction } from './actions.tsx';

export function TournamentControls({ overview }: { overview: TournamentOverview }) {
  const action = useAdminAction();

  const change = async (status: string): Promise<void> => {
    const ok = await action.run('tournament/status', { body: { status } });
    if (ok) window.location.reload();
  };

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">Estado del torneo</h2>
          <p className="mt-1 text-sm text-muted">
            Cada cambio queda auditado, con quién lo hizo y cuándo.
          </p>
        </div>
        <LeagueStatusBadge status={overview.status} />
      </div>

      {overview.allowedTransitions.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Este estado es final: no admite más cambios.</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {overview.allowedTransitions.map((status) => (
            <button
              key={status}
              type="button"
              disabled={action.busy}
              onClick={() => void change(status)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-medium text-muted transition-colors hover:border-cyan/50 hover:text-cyan disabled:opacity-50"
            >
              <ArrowRight aria-hidden="true" className="size-3.5" />
              {tournamentStatusLabel(status)}
            </button>
          ))}
        </div>
      )}

      <ActionError failure={action.failure} />

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-faint">Reglamento</dt>
          <dd className="mt-0.5 font-mono">{overview.rulesVersion}</dd>
        </div>
        <div>
          <dt className="text-faint">Calendario</dt>
          <dd className="mt-0.5 font-mono">
            {overview.fixture.generated ? `${overview.fixture.matches} partidos` : 'Sin generar'}
          </dd>
        </div>
        <div>
          <dt className="text-faint">Semilla</dt>
          <dd className="mt-0.5 truncate font-mono">{overview.fixture.seed ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-faint">Capacidades</dt>
          <dd className="mt-0.5 font-mono">{overview.capabilities.length}</dd>
        </div>
      </dl>
    </div>
  );
}
