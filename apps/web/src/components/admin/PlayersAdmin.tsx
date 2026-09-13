/**
 * Participantes.
 *
 * Alta, edición, confirmación, retirada y sustitución. Ninguna restricción se
 * comprueba aquí: si el torneo no admite la operación en su estado actual, o si
 * la plaza está ocupada, o si el saliente ya jugó, lo rechaza el backend y se
 * muestra su mensaje. Es lo que evita tener dos reglamentos.
 */

import type { AdminPlayersResponse, ParticipantStatus } from '@liga/contracts';
import { CheckCircle2, Pencil, Trash2, UserMinus, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';

import { EMPTY_SLOT_LABEL, participantStatusLabel } from '../../lib/presentation.ts';
import { PlayerAvatar } from '../players/PlayerAvatar.tsx';
import { Badge, Button, EmptyState, type Tone } from '../ui/primitives.tsx';
import { ActionButton, ActionError, useAdminAction } from './actions.tsx';

const STATUS_TONE: Readonly<Record<ParticipantStatus, Tone>> = {
  REGISTERED: 'neutral',
  CONFIRMED: 'acid',
  WITHDRAWN: 'danger',
  REPLACED: 'warning',
};

const field =
  'min-h-11 w-full rounded-lg border border-line bg-elevated px-3 text-sm text-ink placeholder:text-faint focus:border-cyan focus:outline-none';

function CreatePlayer() {
  const action = useAdminAction();
  const [displayName, setDisplayName] = useState('');
  const [clashTag, setClashTag] = useState('');

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const ok = await action.run('players', {
      body: {
        displayName,
        ...(clashTag.trim() === '' ? {} : { clashTag: clashTag.trim() }),
      },
    });
    if (ok) window.location.reload();
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="panel p-5">
      <h2 className="font-display text-base font-semibold">Añadir participante</h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        Se da de alta como inscrito. Confirmarlo y asignarle plaza es un paso aparte.
      </p>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="nuevo-nombre" className="mb-1.5 block text-xs text-faint">
            Nombre
          </label>
          <input
            id="nuevo-nombre"
            className={field}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            minLength={2}
            maxLength={40}
          />
        </div>
        <div>
          <label htmlFor="nuevo-tag" className="mb-1.5 block text-xs text-faint">
            Tag de Clash Royale (opcional)
          </label>
          <input
            id="nuevo-tag"
            className={field}
            value={clashTag}
            onChange={(event) => setClashTag(event.target.value)}
            maxLength={20}
            placeholder="#ABC123"
          />
        </div>
        <Button type="submit" icon={UserPlus} busy={action.busy} disabled={action.busy}>
          Añadir
        </Button>
      </div>
      <ActionError failure={action.failure} />
    </form>
  );
}

function EditPlayer({
  id,
  displayName,
  clashTag,
  onClose,
}: {
  id: string;
  displayName: string;
  clashTag: string | null;
  onClose: () => void;
}) {
  const action = useAdminAction();
  const [name, setName] = useState(displayName);
  const [tag, setTag] = useState(clashTag ?? '');

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const ok = await action.run(`players/${id}`, {
      method: 'PATCH',
      body: { displayName: name, clashTag: tag.trim() === '' ? null : tag.trim() },
    });
    if (ok) window.location.reload();
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-3 border-t border-line pt-3">
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto_auto] sm:items-end">
        <div>
          <label htmlFor={`nombre-${id}`} className="mb-1 block text-xs text-faint">
            Nombre
          </label>
          <input
            id={`nombre-${id}`}
            className={field}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor={`tag-${id}`} className="mb-1 block text-xs text-faint">
            Tag
          </label>
          <input
            id={`tag-${id}`}
            className={field}
            value={tag}
            onChange={(event) => setTag(event.target.value)}
          />
        </div>
        <Button type="submit" size="sm" busy={action.busy} disabled={action.busy}>
          Guardar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      </div>
      <ActionError failure={action.failure} />
    </form>
  );
}

export function PlayersAdmin({ data }: { data: AdminPlayersResponse }) {
  const [editing, setEditing] = useState<string | null>(null);

  const freeSlots = data.slots.filter((slot) => slot.player === null).map((slot) => slot.slot);

  return (
    <div className="space-y-6">
      <CreatePlayer />

      <section className="panel p-5">
        <h2 className="font-display text-base font-semibold">Plazas</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          {data.summary.confirmed} de {data.summary.rosterSize} confirmadas.
          {freeSlots.length === 0
            ? ' No queda ninguna libre.'
            : ` Libres: ${freeSlots.join(', ')}.`}
        </p>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {data.slots.map((slot) => (
            <li
              key={slot.slot}
              className={`rounded-md border px-3 py-2 text-sm ${
                slot.player === null
                  ? 'border-dashed border-line text-faint'
                  : 'border-line bg-elevated'
              }`}
            >
              <span className="block font-mono text-[10px] text-faint">PLAZA {slot.slot}</span>
              <span className="mt-0.5 block truncate">
                {slot.player?.displayName ?? EMPTY_SLOT_LABEL}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-3 font-display text-base font-semibold">
          Participantes ({data.players.length})
        </h2>
        {data.players.length === 0 ? (
          <EmptyState title="Todavía no hay participantes" icon={Users} />
        ) : (
          <ul className="space-y-2">
            {data.players.map((player) => (
              <li key={player.id} className="panel p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <PlayerAvatar name={player.displayName} avatarUrl={player.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{player.displayName}</span>
                      <Badge tone={STATUS_TONE[player.status]}>
                        {participantStatusLabel(player.status)}
                      </Badge>
                      {player.slot === null ? null : (
                        <span className="font-mono text-[11px] text-faint">
                          PLAZA {player.slot}
                        </span>
                      )}
                    </p>
                    {player.clashTag === null ? null : (
                      <p className="mt-0.5 font-mono text-[11px] text-faint">{player.clashTag}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-start gap-2">
                    {player.status === 'CONFIRMED' ? (
                      <ActionButton path={`players/${player.id}/unconfirm`} variant="ghost">
                        Quitar confirmación
                      </ActionButton>
                    ) : player.status === 'REGISTERED' ? (
                      <ConfirmPlayer id={player.id} freeSlots={freeSlots} />
                    ) : null}

                    {player.status === 'CONFIRMED' || player.status === 'REGISTERED' ? (
                      <ActionButton
                        path={`players/${player.id}/withdraw`}
                        variant="ghost"
                        icon={UserMinus}
                        confirm={`¿Retirar a ${player.displayName} del torneo?`}
                      >
                        Retirar
                      </ActionButton>
                    ) : null}

                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Pencil}
                      onClick={() => setEditing(editing === player.id ? null : player.id)}
                      aria-expanded={editing === player.id}
                    >
                      Editar
                    </Button>

                    <ActionButton
                      path={`players/${player.id}`}
                      method="DELETE"
                      variant="danger"
                      icon={Trash2}
                      confirm={`¿Borrar a ${player.displayName}? Solo es posible si todavía no ha jugado.`}
                    >
                      Borrar
                    </ActionButton>
                  </div>
                </div>

                {editing === player.id ? (
                  <EditPlayer
                    id={player.id}
                    displayName={player.displayName}
                    clashTag={player.clashTag}
                    onClose={() => setEditing(null)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Confirmar exige elegir plaza cuando quedan varias libres. */
function ConfirmPlayer({ id, freeSlots }: { id: string; freeSlots: readonly number[] }) {
  const action = useAdminAction();
  const [slot, setSlot] = useState<string>('');

  const confirm = async (): Promise<void> => {
    const ok = await action.run(`players/${id}/confirm`, {
      body: slot === '' ? {} : { slot: Number(slot) },
    });
    if (ok) window.location.reload();
  };

  return (
    <span className="inline-flex flex-col">
      <span className="flex items-center gap-2">
        {freeSlots.length > 0 ? (
          <>
            <label htmlFor={`slot-${id}`} className="sr-only">
              Plaza
            </label>
            <select
              id={`slot-${id}`}
              value={slot}
              onChange={(event) => setSlot(event.target.value)}
              className="min-h-9 rounded-md border border-line bg-elevated px-2 text-xs text-ink"
            >
              <option value="">Primera libre</option>
              {freeSlots.map((free) => (
                <option key={free} value={free}>
                  Plaza {free}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <Button
          size="sm"
          icon={CheckCircle2}
          busy={action.busy}
          disabled={action.busy}
          onClick={() => void confirm()}
        >
          Confirmar
        </Button>
      </span>
      <ActionError failure={action.failure} />
    </span>
  );
}
