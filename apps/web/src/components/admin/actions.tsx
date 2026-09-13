/**
 * Operaciones administrativas desde el navegador.
 *
 * Todas pasan por `/api/admin/...`, que las reenvía a la API con la sesión.
 * Ninguna comprueba reglas por su cuenta: si la operación no procede, la
 * rechaza el backend y aquí solo se muestra su mensaje. Es a propósito, porque
 * duplicar la regla en React garantizaría que tarde o temprano dijeran cosas
 * distintas.
 */

import { CircleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';

import { Button, type ButtonSize, type ButtonVariant } from '../ui/primitives.tsx';

export interface ActionFailure {
  readonly message: string;
  readonly code: string | null;
  readonly details: unknown;
}

interface ErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: unknown;
  };
}

export function useAdminAction() {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ActionFailure | null>(null);

  const run = useCallback(
    async (
      path: string,
      options: { method?: 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {},
    ): Promise<boolean> => {
      setBusy(true);
      setFailure(null);
      try {
        const response = await fetch(`/api/admin/${path}`, {
          method: options.method ?? 'POST',
          headers: options.body === undefined ? {} : { 'content-type': 'application/json' },
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        });

        if (response.ok) return true;

        const body = (await response.json().catch(() => ({}))) as ErrorBody;
        setFailure({
          message: body.error?.message ?? `La operación falló (${response.status}).`,
          code: body.error?.code ?? null,
          details: body.error?.details ?? null,
        });
        return false;
      } catch {
        setFailure({
          message: 'No se pudo contactar con el servidor. Revisa la conexión.',
          code: 'NETWORK',
          details: null,
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { run, busy, failure, clear: () => setFailure(null) };
}

/** Mensaje de error de una operación, con los detalles de validación si vienen. */
export function ActionError({ failure }: { failure: ActionFailure | null }) {
  if (failure === null) return null;

  const issues =
    failure.details !== null &&
    typeof failure.details === 'object' &&
    'issues' in failure.details &&
    Array.isArray((failure.details as { issues: unknown }).issues)
      ? ((failure.details as { issues: { path: string; message: string }[] }).issues ?? [])
      : [];

  return (
    <div
      role="alert"
      className="mt-3 rounded-md border border-danger/50 bg-danger/5 px-3 py-2 text-sm text-danger"
    >
      <p className="flex items-start gap-2">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {failure.message}
      </p>
      {issues.length === 0 ? null : (
        <ul className="mt-1.5 ml-6 list-disc text-xs">
          {issues.map((issue) => (
            <li key={`${issue.path}-${issue.message}`}>
              {issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Botón que ejecuta una operación y recarga la página al terminar.
 *
 * Recargar en lugar de actualizar el estado en memoria es deliberado: después
 * de tocar un resultado cambian la clasificación, el progreso del torneo y la
 * auditoría. Volver a pedir la página al servidor evita enseñar una mezcla de
 * datos viejos y nuevos.
 */
export function ActionButton({
  path,
  body,
  method,
  children,
  confirm,
  variant = 'secondary',
  size = 'sm',
  icon,
  onDone,
}: {
  path: string;
  body?: unknown;
  method?: 'POST' | 'PATCH' | 'DELETE';
  children: ReactNode;
  /** Texto de confirmación para lo que no tiene vuelta atrás. */
  confirm?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  onDone?: () => void;
}) {
  const action = useAdminAction();

  const click = async (): Promise<void> => {
    if (confirm !== undefined && !window.confirm(confirm)) return;
    const ok = await action.run(path, {
      ...(method === undefined ? {} : { method }),
      ...(body === undefined ? {} : { body }),
    });
    if (!ok) return;
    if (onDone === undefined) window.location.reload();
    else onDone();
  };

  return (
    <span className="inline-flex flex-col">
      <Button
        variant={variant}
        size={size}
        busy={action.busy}
        disabled={action.busy}
        onClick={() => void click()}
        {...(icon === undefined ? {} : { icon })}
      >
        {children}
      </Button>
      <ActionError failure={action.failure} />
    </span>
  );
}
