/**
 * Cuenta de Clash Royale del participante.
 *
 * Muestra la vinculación, si existe, y **dice lo que no sabe**: que la cuenta
 * esté vinculada no significa que se haya comprobado que es suya. Comprobarlo
 * exigiría un endpoint que Supercell no documenta, así que la etiqueta se
 * presenta como declarada, no como verificada. Es P-11, y sigue abierta.
 *
 * El nombre de la liga no se toca: el tag sirve para cruzar datos externos, no
 * para identificar a nadie ante el público.
 */
import { Link2, ShieldQuestion } from 'lucide-react';

export function ClashRoyalePanel({
  clashTag,
  linkStatus,
}: {
  clashTag: string | null;
  linkStatus: 'UNVERIFIED' | 'VERIFIED' | null;
}) {
  const linked = clashTag !== null;

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold">Clash Royale</h2>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.14em] uppercase ${
            linked ? 'border-cyan/50 text-cyan' : 'border-line text-faint'
          }`}
        >
          {linked ? (
            <>
              <Link2 aria-hidden="true" className="size-3" />
              Vinculada
            </>
          ) : (
            'Sin vincular'
          )}
        </span>
      </div>

      {linked ? (
        <>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-faint">Player tag</dt>
              <dd className="font-mono text-ink">{clashTag}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-faint">Propiedad de la cuenta</dt>
              <dd className="text-warning">
                {linkStatus === 'VERIFIED' ? 'Verificada' : 'Sin verificar'}
              </dd>
            </div>
          </dl>

          <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-xs text-muted">
            <ShieldQuestion aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <span>
              La cuenta está declarada, no comprobada: el sistema sabe que existe, no que sea de
              esta persona. Verificarlo depende de una decisión de reglamento todavía abierta
              (P-11).
            </span>
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted">
          Este participante no tiene ninguna cuenta de Clash Royale vinculada, así que no se puede
          cruzar su historial de batallas con el calendario.
        </p>
      )}
    </div>
  );
}
