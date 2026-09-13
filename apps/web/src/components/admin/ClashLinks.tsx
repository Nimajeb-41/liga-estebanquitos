/**
 * Cuentas de Clash Royale de los participantes.
 *
 * Dos ideas que la pantalla tiene que dejar claras sin que nadie las explique:
 *
 * 1. El nombre de la liga y la etiqueta de Clash Royale son **cosas distintas**.
 *    El primero manda en la clasificación; la segunda solo sirve para cruzar
 *    datos externos.
 * 2. Vincular **no es verificar**. El sistema comprueba que la cuenta existe,
 *    no que sea de esa persona. Eso exigiría `verifytoken`, que Supercell no
 *    documenta, y por eso P-11 sigue abierta.
 */

import type { ClashLink } from '@liga/contracts';
import { Link2, RefreshCw, ShieldQuestion, Unlink } from 'lucide-react';
import { useState } from 'react';

import { formatDateTime } from '../../lib/presentation.ts';
import { Badge, Button, EmptyState } from '../ui/primitives.tsx';
import { ActionButton, ActionError, useAdminAction } from './actions.tsx';

function LinkForm({ playerId, current }: { playerId: string; current: string | null }) {
  const action = useAdminAction();
  const [tag, setTag] = useState(current ?? '');

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const ok = await action.run(`clash-royale/links/${playerId}`, { body: { clashTag: tag } });
    if (ok) window.location.reload();
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor={`tag-${playerId}`} className="sr-only">
          Etiqueta de Clash Royale
        </label>
        <input
          id={`tag-${playerId}`}
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          placeholder="#ABC123"
          maxLength={16}
          className="min-h-9 w-36 rounded-md border border-line bg-elevated px-2 font-mono text-xs text-ink placeholder:text-faint focus:border-cyan focus:outline-none"
        />
      </div>
      <Button type="submit" size="sm" icon={Link2} busy={action.busy} disabled={action.busy}>
        {current === null ? 'Vincular' : 'Cambiar'}
      </Button>
      <ActionError failure={action.failure} />
    </form>
  );
}

export function ClashLinks({ links }: { links: readonly ClashLink[] }) {
  if (links.length === 0) {
    return <EmptyState title="No hay participantes" />;
  }

  const linked = links.filter((entry) => entry.clashTag !== null);

  return (
    <div className="space-y-5">
      <div className="rounded-panel border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
        <p className="flex items-center gap-2 font-medium text-warning">
          <ShieldQuestion aria-hidden="true" className="size-4" />
          Vincular no es verificar
        </p>
        <p className="mt-1 text-muted">
          Se comprueba que la cuenta exista, no que sea de esa persona. Comprobar la propiedad
          exigiría un endpoint que Supercell no documenta, así que toda vinculación queda como{' '}
          <strong>no verificada</strong> y la regla <strong>P-11</strong> sigue abierta.
        </p>
      </div>

      <p className="text-sm text-muted">
        {linked.length} de {links.length} participantes tienen cuenta vinculada.
      </p>

      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.playerId} className="panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                {/* El nombre de la liga primero, siempre. */}
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{link.displayName}</span>
                  {link.linkStatus === null ? (
                    <Badge tone="neutral">Sin vincular</Badge>
                  ) : (
                    <Badge tone="warning">No verificada</Badge>
                  )}
                </p>
                {link.clashTag === null ? (
                  <p className="mt-1 text-xs text-faint">
                    Sin cuenta de Clash Royale. No se podrá importar su historial.
                  </p>
                ) : (
                  <p className="mt-1 font-mono text-[11px] text-faint">
                    {link.clashTag}
                    {link.clashName === null ? '' : ` · ${link.clashName}`}
                    {link.syncedAt === null
                      ? ' · nunca sincronizado'
                      : ` · sincronizado ${formatDateTime(link.syncedAt)}`}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-start gap-2">
                <LinkForm playerId={link.playerId} current={link.clashTag} />
                {link.clashTag === null ? null : (
                  <>
                    <ActionButton
                      path={`clash-royale/sync/${link.playerId}`}
                      icon={RefreshCw}
                      variant="secondary"
                    >
                      Sincronizar
                    </ActionButton>
                    <ActionButton
                      path={`clash-royale/links/${link.playerId}`}
                      method="DELETE"
                      icon={Unlink}
                      variant="ghost"
                      confirm={`¿Desvincular la cuenta de ${link.displayName}?`}
                    >
                      Desvincular
                    </ActionButton>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
