/**
 * Sanciones.
 *
 * Crear y anular. Anular no borra: la sanción se queda en el historial marcada
 * como anulada, con el motivo. Los puntos por defecto los fija el reglamento y
 * llegan de la API; aquí no hay ningún −2 escrito a mano.
 */

import type { AdminPlayer, AdminSanction, Rules, SanctionType } from '@liga/contracts';
import { Ban, ShieldAlert } from 'lucide-react';
import { useState } from 'react';

import { formatDateTime, SANCTION_TYPE_LABELS } from '../../lib/presentation.ts';
import { Badge, Button, EmptyState } from '../ui/primitives.tsx';
import { ActionError, useAdminAction } from './actions.tsx';

const field =
  'min-h-11 w-full rounded-lg border border-line bg-elevated px-3 text-sm text-ink placeholder:text-faint focus:border-cyan focus:outline-none';
const labelClass = 'mb-1.5 block text-xs text-faint';

const TYPES: readonly SanctionType[] = ['BM', 'NO_SHOW', 'RULE_BREACH', 'OTHER'];

function CreateSanction({
  players,
  rules,
}: {
  players: readonly AdminPlayer[];
  rules: Rules | null;
}) {
  const action = useAdminAction();
  const [playerId, setPlayerId] = useState(players[0]?.id ?? '');
  const [type, setType] = useState<SanctionType>('BM');
  const [reason, setReason] = useState('');
  const [points, setPoints] = useState('');

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const ok = await action.run('sanctions', {
      body: {
        playerId,
        type,
        reason,
        ...(points.trim() === '' ? {} : { points: Number(points) }),
      },
    });
    if (ok) window.location.reload();
  };

  if (players.length === 0) {
    return <EmptyState title="No hay participantes a los que sancionar" icon={ShieldAlert} />;
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="panel p-5">
      <h2 className="font-display text-base font-semibold">Nueva sanción</h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        Resta puntos en la clasificación desde el momento en que se registra.
        {rules === null
          ? ''
          : ` Por defecto ${rules.sanctions.defaultPoints}; el mínimo permitido es ${rules.sanctions.minPoints}.`}
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="san-jugador" className={labelClass}>
            Participante
          </label>
          <select
            id="san-jugador"
            value={playerId}
            onChange={(event) => setPlayerId(event.target.value)}
            className={field}
          >
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="san-tipo" className={labelClass}>
            Tipo
          </label>
          <select
            id="san-tipo"
            value={type}
            onChange={(event) => setType(event.target.value as SanctionType)}
            className={field}
          >
            {TYPES.map((entry) => (
              <option key={entry} value={entry}>
                {SANCTION_TYPE_LABELS[entry] ?? entry}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="san-puntos" className={labelClass}>
            Puntos (negativo; vacío = por defecto)
          </label>
          <input
            id="san-puntos"
            type="number"
            max={0}
            min={-20}
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            placeholder={rules === null ? '' : String(rules.sanctions.defaultPoints)}
            className={field}
          />
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor="san-motivo" className={labelClass}>
          Conducta sancionada (se publica)
        </label>
        <textarea
          id="san-motivo"
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
        <Button type="submit" icon={ShieldAlert} busy={action.busy} disabled={action.busy}>
          Registrar sanción
        </Button>
      </div>
      <ActionError failure={action.failure} />
    </form>
  );
}

function RevokeSanction({ id }: { id: string }) {
  const action = useAdminAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const ok = await action.run(`sanctions/${id}/revoke`, { body: { reason } });
    if (ok) window.location.reload();
  };

  if (!open) {
    return (
      <Button size="sm" variant="ghost" icon={Ban} onClick={() => setOpen(true)}>
        Anular
      </Button>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="w-full">
      <label htmlFor={`revoke-${id}`} className={labelClass}>
        Motivo de la anulación
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <input
          id={`revoke-${id}`}
          required
          minLength={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={`${field} sm:w-72`}
        />
        <Button type="submit" size="sm" busy={action.busy} disabled={action.busy}>
          Anular
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
      <ActionError failure={action.failure} />
    </form>
  );
}

export function SanctionsAdmin({
  sanctions,
  players,
  rules,
}: {
  sanctions: readonly AdminSanction[];
  players: readonly AdminPlayer[];
  rules: Rules | null;
}) {
  const active = sanctions.filter((sanction) => sanction.status === 'ACTIVE');
  const revoked = sanctions.filter((sanction) => sanction.status !== 'ACTIVE');

  return (
    <div className="space-y-6">
      <CreateSanction players={players} rules={rules} />

      <section>
        <h2 className="mb-3 font-display text-base font-semibold">Vigentes ({active.length})</h2>
        {active.length === 0 ? (
          <EmptyState title="No hay sanciones vigentes" />
        ) : (
          <ul className="space-y-2">
            {active.map((sanction) => (
              <li key={sanction.id} className="panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{sanction.playerName}</span>
                      <Badge tone="danger">
                        {SANCTION_TYPE_LABELS[sanction.type] ?? sanction.type}
                      </Badge>
                      <span className="font-display font-bold text-danger">{sanction.points}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted">{sanction.reason}</p>
                    {sanction.notes === null ? null : (
                      <p className="mt-1 text-xs text-faint">Nota interna: {sanction.notes}</p>
                    )}
                    <p className="mt-1 font-mono text-[11px] text-faint">
                      {formatDateTime(sanction.issuedAt)}
                      {sanction.roundNumber === null ? '' : ` · jornada ${sanction.roundNumber}`}
                    </p>
                  </div>
                  <RevokeSanction id={sanction.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {revoked.length === 0 ? null : (
        <section>
          <h2 className="mb-3 font-display text-base font-semibold">Anuladas ({revoked.length})</h2>
          <ul className="space-y-2">
            {revoked.map((sanction) => (
              <li key={sanction.id} className="panel p-4 opacity-70">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{sanction.playerName}</span>
                  <Badge tone="neutral">Anulada</Badge>
                </p>
                <p className="mt-1 text-sm text-muted line-through">{sanction.reason}</p>
                {sanction.revokedReason === null ? null : (
                  <p className="mt-1 text-sm text-muted">
                    Anulada porque: {sanction.revokedReason}
                  </p>
                )}
                <p className="mt-1 font-mono text-[11px] text-faint">
                  {formatDateTime(sanction.issuedAt)} → {formatDateTime(sanction.revokedAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
