/**
 * Marca de procedencia de un dato. Definición única para toda la plataforma.
 *
 * La distinción que sostiene toda la Fase 4, hecha visible. Un número oficial
 * decide la clasificación; uno observado es evidencia parcial de Clash Royale y
 * **siempre** dice sobre cuántas batallas se calculó.
 *
 * Se distinguen por color, forma y texto, no solo por color.
 *
 * Existe en React —y no solo en Astro— porque la ficha de partido la usa dentro
 * de una isla. Dos definiciones acabarían divergiendo, y esta etiqueta es
 * justamente la que no puede significar cosas distintas en dos pantallas.
 */

export function SourceBadge({
  source,
  sampleSize,
  className = '',
}: {
  source: 'OFFICIAL' | 'OBSERVED';
  /** Obligatorio en lo observado: sin muestra, un porcentaje no significa nada. */
  sampleSize?: number;
  className?: string;
}) {
  const official = source === 'OFFICIAL';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.14em] uppercase ${
        official
          ? 'border-cyan/50 bg-cyan/10 text-cyan'
          : 'border-line-strong bg-elevated text-muted'
      } ${className}`}
    >
      {official ? 'Oficial' : 'Observado'}
      {!official && sampleSize !== undefined ? (
        <span className="font-mono text-[9px] tracking-normal normal-case opacity-80">
          {sampleSize} {sampleSize === 1 ? 'batalla' : 'batallas'}
        </span>
      ) : null}
    </span>
  );
}
