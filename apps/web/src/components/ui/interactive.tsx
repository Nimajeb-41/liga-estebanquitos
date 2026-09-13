/**
 * Componentes que necesitan JavaScript.
 *
 * Se hidratan solo donde la página lo pide (`client:visible`, `client:load`).
 * Todo lo que se puede resolver con HTML y CSS no está aquí.
 */

import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/* Pestañas                                                                    */
/* -------------------------------------------------------------------------- */

export interface TabDefinition {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}

/**
 * Pestañas accesibles con el patrón ARIA completo: flechas para moverse, Inicio
 * y Fin para los extremos.
 */
export function Tabs({
  tabs,
  initial,
  label,
}: {
  tabs: readonly TabDefinition[];
  initial?: string;
  label: string;
}) {
  const base = useId();
  const first = tabs[0]?.id ?? '';
  const [active, setActive] = useState(initial ?? first);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (delta: number): void => {
    const index = tabs.findIndex((tab) => tab.id === active);
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    if (next === undefined) return;
    setActive(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 border-b border-line">
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                refs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  move(1);
                }
                if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  move(-1);
                }
                if (event.key === 'Home') {
                  event.preventDefault();
                  move(-tabs.length);
                }
              }}
              className={`-mb-px min-h-11 border-b-2 px-4 text-sm font-medium transition-colors ${
                selected ? 'border-cyan text-cyan' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${base}-panel-${tab.id}`}
          aria-labelledby={`${base}-tab-${tab.id}`}
          hidden={tab.id !== active}
          tabIndex={0}
          className="pt-5"
        >
          {tab.id === active ? tab.content : null}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Diálogo modal sobre `<dialog>` nativo: el navegador se encarga del foco
 * atrapado, la capa superior y el cierre con Escape.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-label={title}
      className="panel m-auto w-[min(32rem,calc(100vw-2rem))] p-0 text-ink backdrop:bg-void/80 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="rounded-md p-1 text-muted transition-colors hover:text-ink"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer === undefined ? null : (
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>
      )}
    </dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Tooltip                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Descripción emergente.
 *
 * Aparece con el ratón y con el foco de teclado, y el texto vive en el DOM
 * asociado con `aria-describedby`: un lector de pantalla lo lee siempre, se
 * muestre o no.
 */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative inline-flex">
      <span
        aria-describedby={id}
        tabIndex={0}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="inline-flex cursor-help border-b border-dotted border-line-strong"
      >
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        hidden={!visible}
        className="absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-56 -translate-x-1/2 rounded-md border border-line-strong bg-raised px-2.5 py-1.5 text-xs text-ink shadow-lg"
      >
        {label}
      </span>
    </span>
  );
}
