/**
 * Forma reciente y movimiento de posición.
 *
 * Los dos vienen calculados del dominio. Aquí solo se dibujan, y siempre con
 * texto accesible: las letras V/D no son solo color.
 */

import type { FormResult } from '@liga/contracts';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { FORM_LABEL, FORM_TONE } from '../../lib/presentation.ts';

/** Letra visible de cada resultado. El dominio usa W/L/D; la liga habla en español. */
const FORM_LETTER: Readonly<Record<FormResult, string>> = { W: 'V', L: 'D', D: 'E' };

export function FormIndicator({
  form,
  playerName,
}: {
  /** Del más reciente al más antiguo, tal y como llega de la API. */
  form: readonly FormResult[];
  playerName: string;
}) {
  if (form.length === 0) {
    return <span className="text-xs text-faint">Sin partidos</span>;
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="sr-only">
        Forma reciente de {playerName}, del partido más reciente al más antiguo:{' '}
        {form.map((entry) => FORM_LABEL[entry]).join(', ')}.
      </span>
      {form.map((entry, index) => (
        <span
          key={`${entry}-${index}`}
          aria-hidden="true"
          className={`inline-flex size-5 items-center justify-center rounded border font-mono text-[10px] font-bold ${FORM_TONE[entry]}`}
        >
          {FORM_LETTER[entry]}
        </span>
      ))}
    </span>
  );
}

/**
 * Puestos ganados o perdidos desde la jornada anterior.
 *
 * `null` significa que no hay jornada previa con la que comparar, y eso se dice
 * en vez de dibujar un cero engañoso.
 */
export function PositionChange({ change }: { change: number | null }) {
  if (change === null) {
    return (
      <span className="inline-flex items-center text-faint" title="Sin jornada anterior">
        <span className="sr-only">Sin referencia previa</span>
        <span aria-hidden="true" className="font-mono text-xs">
          ·
        </span>
      </span>
    );
  }

  if (change === 0) {
    return (
      <span className="inline-flex items-center text-faint">
        <span className="sr-only">Mantiene la posición</span>
        <Minus aria-hidden="true" className="size-3.5" />
      </span>
    );
  }

  const up = change > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 ${up ? 'text-acid' : 'text-danger'}`}>
      <span className="sr-only">
        {up ? `Sube ${change} puestos` : `Baja ${Math.abs(change)} puestos`}
      </span>
      <Icon aria-hidden="true" className="size-3.5" />
      <span aria-hidden="true" className="font-mono text-xs">
        {Math.abs(change)}
      </span>
    </span>
  );
}
