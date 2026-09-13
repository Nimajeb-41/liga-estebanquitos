/**
 * Registro de auditoría.
 *
 * Cada entrada trae su carga útil: para una corrección, el valor anterior y el
 * nuevo; para un cambio de estado, el de origen y el de destino. Se muestra tal
 * cual llega, sin reinterpretarla, porque el valor de un registro de auditoría
 * está justamente en que nadie lo maquilla.
 */

import type { AuditEntry } from '@liga/contracts';
import { ChevronDown, FileSearch } from 'lucide-react';
import { useMemo, useState } from 'react';

import { formatDateTime } from '../../lib/presentation.ts';
import { EmptyState } from '../ui/primitives.tsx';

/** Acciones agrupadas por familia, para poder filtrar sin escribir la lista. */
function familyOf(action: string): string {
  const [head] = action.split('_');
  return head ?? action;
}

function describe(entry: AuditEntry): string | null {
  const payload = entry.payload;
  if (payload === null || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;

  if (typeof record['from'] === 'string' && typeof record['to'] === 'string') {
    return `${record['from']} → ${record['to']}`;
  }
  if (typeof record['reason'] === 'string') return String(record['reason']);
  return null;
}

export function AuditLog({ entries }: { entries: readonly AuditEntry[] }) {
  const [family, setFamily] = useState<string>('ALL');
  const [open, setOpen] = useState<number | null>(null);

  const families = useMemo(
    () => [...new Set(entries.map((entry) => familyOf(entry.action)))].sort(),
    [entries],
  );

  const visible =
    family === 'ALL' ? entries : entries.filter((entry) => familyOf(entry.action) === family);

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Sin operaciones registradas"
        description="En cuanto se haga algo en el panel, aparecerá aquí."
        icon={FileSearch}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="familia"
          className="text-[11px] font-medium tracking-[0.12em] text-faint uppercase"
        >
          Filtrar
        </label>
        <select
          id="familia"
          value={family}
          onChange={(event) => setFamily(event.target.value)}
          className="min-h-9 rounded-md border border-line bg-elevated px-2 text-xs text-ink"
        >
          <option value="ALL">Todas las acciones</option>
          {families.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <span role="status" className="text-xs text-muted">
          {visible.length} de {entries.length}
        </span>
      </div>

      <div className="relative overflow-x-auto rounded-panel border border-line">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <caption className="sr-only">
            Registro de auditoría de la Liga Estabanquitos 2026-1
          </caption>
          <thead>
            <tr className="border-b border-line bg-elevated text-[11px] tracking-[0.1em] text-faint uppercase">
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Fecha
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Administrador
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Acción
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Entidad
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Detalle
              </th>
              <th scope="col" className="w-10 px-2 py-2.5">
                <span className="sr-only">Datos completos</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => (
              <tr key={entry.id} className="border-b border-line/60 align-top">
                <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-faint">
                  {formatDateTime(entry.createdAt)}
                </td>
                <td className="px-3 py-2.5 text-muted">{entry.actor ?? 'sistema'}</td>
                <th scope="row" className="px-3 py-2.5 text-left font-mono text-xs font-normal">
                  {entry.action}
                </th>
                <td className="px-3 py-2.5 text-muted">
                  {entry.entityType}
                  {entry.entityId === null ? null : (
                    <span className="block font-mono text-[10px] text-faint">
                      {entry.entityId.slice(0, 8)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-muted">
                  {describe(entry) ?? '—'}
                  {open === entry.id ? (
                    <>
                      <pre className="mt-2 max-w-md overflow-x-auto rounded-md border border-line bg-void px-2 py-1.5 font-mono text-[11px] text-muted">
                        {JSON.stringify(entry.payload, null, 2)}
                      </pre>
                      {/*
                        El identificador de la petición cruza esta entrada con
                        las líneas de registro del servidor. Sin él, «esta
                        corrección salió mal» y «este error en el log» son dos
                        hechos sueltos que nadie puede unir.
                      */}
                      <p className="mt-2 font-mono text-[10px] text-faint">
                        {entry.requestId === null ? (
                          'Sin petición asociada: no vino de una llamada HTTP.'
                        ) : (
                          <>
                            petición{' '}
                            <a
                              href={`/admin/auditoria?requestId=${encodeURIComponent(entry.requestId)}`}
                              className="text-cyan underline-offset-2 hover:underline"
                            >
                              {entry.requestId}
                            </a>
                          </>
                        )}
                      </p>
                    </>
                  ) : null}
                </td>
                <td className="px-2 py-2.5">
                  {entry.payload === null ? null : (
                    <button
                      type="button"
                      onClick={() => setOpen(open === entry.id ? null : entry.id)}
                      aria-expanded={open === entry.id}
                      aria-label={`Datos completos de la operación ${entry.action}`}
                      className="inline-flex size-8 items-center justify-center rounded-md border border-line text-muted"
                    >
                      <ChevronDown
                        aria-hidden="true"
                        className={`size-4 transition-transform ${open === entry.id ? 'rotate-180' : ''}`}
                      />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
