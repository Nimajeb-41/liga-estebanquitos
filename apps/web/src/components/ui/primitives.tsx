/**
 * Primitivas del sistema de diseño.
 *
 * Componentes React que Astro renderiza en el servidor: no se hidratan salvo
 * que una página lo pida expresamente. Iconografía con Lucide; nunca emojis.
 */

import { AlertTriangle, CircleAlert, Info, Loader2, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type Tone = 'neutral' | 'cyan' | 'magenta' | 'acid' | 'warning' | 'danger' | 'purple';

const TONE_CLASS: Readonly<Record<Tone, string>> = {
  neutral: 'border-line text-muted',
  cyan: 'border-cyan/45 text-cyan',
  magenta: 'border-magenta/50 text-magenta',
  acid: 'border-acid/45 text-acid',
  warning: 'border-warning/50 text-warning',
  danger: 'border-danger/50 text-danger',
  purple: 'border-purple/50 text-purple',
};

export function Badge({
  children,
  tone = 'neutral',
  className = '',
  icon: Icon,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  icon?: LucideIcon;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide ${TONE_CLASS[tone]} ${className}`}
    >
      {Icon === undefined ? null : <Icon aria-hidden="true" className="size-3.5" />}
      {children}
    </span>
  );
}

export function Panel({
  children,
  className = '',
  glass = false,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  glass?: boolean;
  as?: 'section' | 'article' | 'div' | 'aside';
}) {
  return <Tag className={`${glass ? 'panel-glass' : 'panel'} p-5 ${className}`}>{children}</Tag>;
}

export function SectionHeading({
  title,
  description,
  action,
  level = 2,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  level?: 1 | 2 | 3;
}) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
  const size = level === 1 ? 'text-3xl sm:text-4xl' : level === 2 ? 'text-xl' : 'text-base';
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <Tag className={`${size} font-semibold`}>{title}</Tag>
        {description === undefined ? null : (
          <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-panel border border-line bg-elevated px-4 py-3">
      <p className="text-[11px] font-medium tracking-[0.12em] text-faint uppercase">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${TONE_CLASS[tone].split(' ')[1]}`}>
        {value}
      </p>
      {hint === undefined ? null : <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Info,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-panel border border-dashed border-line px-6 py-10 text-center">
      <Icon aria-hidden="true" className="size-6 text-faint" />
      <p className="font-medium">{title}</p>
      {description === undefined ? null : (
        <p className="max-w-md text-sm text-muted">{description}</p>
      )}
    </div>
  );
}

export function ErrorState({
  title = 'No se pudo cargar la información',
  message,
  code,
  requestId,
}: {
  title?: string;
  message: string;
  code?: string | null;
  requestId?: string | null;
}) {
  return (
    <div role="alert" className="rounded-panel border border-danger/50 bg-danger/5 px-5 py-4">
      <p className="flex items-center gap-2 font-medium text-danger">
        <CircleAlert aria-hidden="true" className="size-4" />
        {title}
      </p>
      <p className="mt-1 text-sm text-ink/90">{message}</p>
      {code === undefined || code === null ? null : (
        <p className="mt-2 font-mono text-xs text-faint">
          {code}
          {requestId === undefined || requestId === null ? '' : ` · ${requestId}`}
        </p>
      )}
    </div>
  );
}

/**
 * Aviso de regla pendiente.
 *
 * Se usa allí donde el reglamento todavía no ha decidido algo. Nunca se
 * sustituye por un valor inventado.
 */
export function PendingRule({ rule, children }: { rule: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-panel border border-warning/40 bg-warning/5 px-4 py-3">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="text-sm">
        <p className="font-medium text-warning">Pendiente de definición · {rule}</p>
        <p className="mt-0.5 text-muted">{children}</p>
      </div>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-elevated ${className}`} />;
}

export function Spinner({ label = 'Cargando' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status">
      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Acciones                                                                    */
/* -------------------------------------------------------------------------- */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Readonly<Record<ButtonVariant, string>> = {
  primary:
    'border-cyan/60 bg-cyan/15 text-cyan hover:bg-cyan/25 hover:border-cyan focus-visible:bg-cyan/25',
  secondary: 'border-line-strong bg-elevated text-ink hover:border-cyan/50 hover:bg-raised',
  ghost: 'border-transparent bg-transparent text-muted hover:text-ink hover:bg-elevated',
  danger: 'border-danger/50 bg-danger/10 text-danger hover:bg-danger/20 hover:border-danger',
};

const SIZE_CLASS: Readonly<Record<ButtonSize, string>> = {
  // 44 px de alto mínimo en los tamaños táctiles: es el objetivo acordado.
  sm: 'min-h-9 px-3 text-xs',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-6 text-base',
};

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg border font-medium tracking-wide transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50';

export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  extra = '',
): string {
  return `${BUTTON_BASE} ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${extra}`;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className = '',
  type = 'button',
  busy = false,
  ...rest
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  busy?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & { className?: string }) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      ) : Icon === undefined ? null : (
        <Icon aria-hidden="true" className="size-4" />
      )}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Progreso y datos                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Barra de progreso.
 *
 * Lleva siempre el porcentaje escrito al lado: el color no puede ser el único
 * portador del dato.
 */
export function ProgressBar({
  value,
  label,
  tone = 'cyan',
}: {
  /** 0..100. */
  value: number;
  label: string;
  tone?: Tone;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const fill: Readonly<Record<Tone, string>> = {
    neutral: 'bg-line-strong',
    cyan: 'bg-cyan',
    magenta: 'bg-magenta',
    acid: 'bg-acid',
    warning: 'bg-warning',
    danger: 'bg-danger',
    purple: 'bg-purple',
  };
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono font-medium text-ink">{clamped}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1.5 overflow-hidden rounded-full bg-elevated"
      >
        <div className={`h-full rounded-full ${fill[tone]}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

/** Par etiqueta/valor. Se usa en fichas y cabeceras. */
export function KeyValue({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-medium tracking-[0.12em] text-faint uppercase">{label}</dt>
      <dd className={`text-sm text-ink ${mono ? 'font-mono' : ''}`}>{children}</dd>
    </div>
  );
}

/**
 * Contenedor de tabla.
 *
 * El desbordamiento se queda dentro: la página nunca hace scroll horizontal.
 */
export function TableScroll({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative -mx-px overflow-x-auto rounded-panel border border-line ${className}`}
    >
      {children}
    </div>
  );
}
