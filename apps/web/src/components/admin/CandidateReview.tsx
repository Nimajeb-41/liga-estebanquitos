/**
 * Revision de candidatos.
 *
 * La pantalla donde una persona decide. Todo lo que hay aqui esta al servicio
 * de esa decision: el partido de la liga a un lado, la batalla observada al
 * otro, y en medio los motivos por los que el sistema cree que son lo mismo.
 *
 * La confianza se muestra, pero **no habilita nada**: el boton de confirmar es
 * el mismo con un 100 que con un 40. Si el numero decidiera, sobraria la
 * pantalla.
 */

import type { BattleCandidate } from '@liga/contracts';
import { AlertTriangle, Check, CircleHelp, Gamepad2, Trophy, X } from 'lucide-react';
import { useState } from 'react';

import { formatDateTime, roundLabel } from '../../lib/presentation.ts';
import { DeckDisplay } from '../clash/DeckDisplay.tsx';
import { Badge, Button, EmptyState, type Tone } from '../ui/primitives.tsx';
import { ActionError, useAdminAction } from './actions.tsx';

/* -------------------------------------------------------------------------- */
/* Vocabulario                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Los codigos que devuelve el backend, en español.
 *
 * Se traducen aqui y no en el backend porque son vocabulario de interfaz. Un
 * codigo que no este en esta tabla se muestra tal cual: es preferible enseñar
 * `ALGO_RARO` que ocultar una señal que el sistema si detecto.
 */
const REASONS: Readonly<Record<string, string>> = {
  BOTH_PLAYERS_LINKED: 'Las dos cuentas están vinculadas a los dos participantes',
  FRIENDLY_BATTLE: 'Es una batalla amistosa, como se juega la liga',
  WITHIN_TIME_WINDOW: 'Se jugó cerca de la hora prevista',
  MATCH_AWAITING_RESULT: 'El partido está esperando resultado',
};

const AMBIGUITIES: Readonly<Record<string, string>> = {
  NOT_A_FRIENDLY_BATTLE: 'No es una amistosa: puede ser una partida cualquiera entre los dos',
  OUTSIDE_TIME_WINDOW: 'Se jugó lejos de la hora prevista',
  MATCH_HAS_NO_SCHEDULE: 'El partido no tiene fecha, así que no hay con qué comparar',
  MATCH_ALREADY_HAS_RESULT: 'El partido ya tiene resultado: confirmar sería corregirlo',
  MATCH_POSTPONED: 'El partido está aplazado y no cuenta como jugado',
  MATCH_DISPUTED: 'El partido está en disputa: su resultado no es definitivo',
  MATCH_CANCELLED: 'El partido está cancelado',
  MULTIPLE_MATCHES_POSSIBLE: 'La misma pareja juega ida y vuelta: encaja en más de un partido',
  ANOTHER_BATTLE_ALREADY_CONFIRMED: 'Este partido ya confirmó otra batalla',
  EQUAL_CROWNS: 'Mismas coronas: el reglamento no admite empates (R-01)',
};

const STATUS: Readonly<Record<string, { label: string; tone: Tone }>> = {
  PENDING: { label: 'Por revisar', tone: 'cyan' },
  NEEDS_REVIEW: { label: 'Apartado', tone: 'warning' },
  CONFIRMED: { label: 'Confirmado', tone: 'acid' },
  REJECTED: { label: 'Rechazado', tone: 'neutral' },
};

/** Verde, ámbar o rojo. Es una ayuda visual, no un permiso. */
function confidenceTone(confidence: number): string {
  if (confidence >= 75) return 'text-acid';
  if (confidence >= 45) return 'text-warning';
  return 'text-danger';
}

/* -------------------------------------------------------------------------- */
/* Tarjeta                                                                     */
/* -------------------------------------------------------------------------- */

function Score({ label, crowns }: { label: string; crowns: number | undefined }) {
  return (
    <div className="text-center">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className="font-display text-3xl font-bold">{crowns ?? '—'}</p>
    </div>
  );
}

function CandidateCard({ candidate }: { candidate: BattleCandidate }) {
  const action = useAdminAction();
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const resolved = candidate.status === 'CONFIRMED' || candidate.status === 'REJECTED';

  const resolve = async (verb: 'confirm' | 'reject' | 'review'): Promise<void> => {
    if (
      verb === 'confirm' &&
      !window.confirm(
        `Se registrará ${candidate.battle.home?.crowns ?? '?'}-${candidate.battle.away?.crowns ?? '?'} en ${roundLabel(candidate.match.roundNumber)}. ¿Confirmas?`,
      )
    ) {
      return;
    }
    const ok = await action.run(`clash-royale/candidates/${candidate.id}/${verb}`, {
      body: { note: note.trim() === '' ? null : note.trim() },
    });
    if (ok) window.location.reload();
  };

  const status = STATUS[candidate.status] ?? { label: candidate.status, tone: 'neutral' as Tone };

  return (
    <article className="panel p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            <span className="font-mono text-xs text-faint">
              {roundLabel(candidate.match.roundNumber)}
            </span>
          </p>
          <h3 className="mt-1.5 font-display text-lg font-semibold">
            {candidate.match.homeName} <span className="text-faint">vs</span>{' '}
            {candidate.match.awayName}
          </h3>
        </div>
        <div className="text-right">
          <p className={`font-display text-2xl font-bold ${confidenceTone(candidate.confidence)}`}>
            {candidate.confidence}
          </p>
          <p className="text-[10px] tracking-[0.14em] text-faint uppercase">Confianza</p>
        </div>
      </header>

      {/* Liga a la izquierda, Clash Royale a la derecha. Nunca mezclados. */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-panel border border-cyan/30 bg-cyan/[0.03] p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-[0.12em] text-cyan uppercase">
            <Trophy aria-hidden="true" className="size-3.5" />
            Partido de la liga
          </p>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-faint">Estado</dt>
              <dd>{candidate.match.status}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-faint">Fecha prevista</dt>
              <dd className="font-mono text-xs">{formatDateTime(candidate.match.scheduledAt)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-panel border border-line p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-[0.12em] text-faint uppercase">
            <Gamepad2 aria-hidden="true" className="size-3.5" />
            Batalla observada
          </p>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-faint">Jugada</dt>
              <dd className="font-mono text-xs">{formatDateTime(candidate.battle.battleTime)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-faint">Tipo · modo</dt>
              <dd className="font-mono text-xs">
                {candidate.battle.battleType} · {candidate.battle.gameModeName ?? '—'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-6 rounded-panel border border-line bg-elevated py-3">
        <Score label={candidate.match.homeName} crowns={candidate.battle.home?.crowns} />
        <span className="font-mono text-xs text-faint">coronas</span>
        <Score label={candidate.match.awayName} crowns={candidate.battle.away?.crowns} />
      </div>

      {candidate.reasons.length === 0 ? null : (
        <ul className="mt-4 space-y-1">
          {candidate.reasons.map((reason) => (
            <li key={reason} className="flex items-start gap-2 text-sm text-muted">
              <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-acid" />
              {REASONS[reason] ?? reason}
            </li>
          ))}
        </ul>
      )}

      {candidate.ambiguities.length === 0 ? null : (
        <ul className="mt-2 space-y-1">
          {candidate.ambiguities.map((ambiguity) => (
            <li key={ambiguity} className="flex items-start gap-2 text-sm text-warning">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {AMBIGUITIES[ambiguity] ?? ambiguity}
            </li>
          ))}
        </ul>
      )}

      {candidate.battle.needsReview ? (
        <p className="mt-3 rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
          Esta batalla llegó dos veces con datos distintos. Compruébala antes de confirmar.
        </p>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="text-xs text-cyan underline-offset-2 hover:underline"
        >
          {open ? 'Ocultar los mazos' : 'Ver los mazos de la batalla'}
        </button>
        {open ? (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {candidate.battle.home === null ? null : (
              <DeckDisplay cards={candidate.battle.home.deck} label={candidate.match.homeName} />
            )}
            {candidate.battle.away === null ? null : (
              <DeckDisplay cards={candidate.battle.away.deck} label={candidate.match.awayName} />
            )}
          </div>
        ) : null}
      </div>

      {resolved ? (
        <p className="mt-4 border-t border-line pt-3 text-xs text-faint">
          {status.label} por {candidate.resolvedBy ?? 'administración'} el{' '}
          {formatDateTime(candidate.resolvedAt)}.
          {candidate.resolutionNote === null ? '' : ` «${candidate.resolutionNote}»`}
        </p>
      ) : (
        <div className="mt-4 border-t border-line pt-4">
          <label htmlFor={`nota-${candidate.id}`} className="mb-1.5 block text-xs text-faint">
            Nota para la auditoría (opcional)
          </label>
          <input
            id={`nota-${candidate.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="Por qué confirmas o rechazas"
            className="min-h-11 w-full rounded-lg border border-line bg-elevated px-3 text-sm text-ink placeholder:text-faint focus:border-cyan focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              icon={Check}
              busy={action.busy}
              disabled={action.busy}
              onClick={() => void resolve('confirm')}
            >
              Confirmar como resultado
            </Button>
            <Button
              variant="danger"
              icon={X}
              busy={action.busy}
              disabled={action.busy}
              onClick={() => void resolve('reject')}
            >
              Rechazar
            </Button>
            <Button
              variant="ghost"
              icon={CircleHelp}
              busy={action.busy}
              disabled={action.busy}
              onClick={() => void resolve('review')}
            >
              Apartar
            </Button>
          </div>
          <ActionError failure={action.failure} />
        </div>
      )}
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Lista                                                                       */
/* -------------------------------------------------------------------------- */

const FILTERS = [
  { value: 'PENDING', label: 'Por revisar' },
  { value: 'NEEDS_REVIEW', label: 'Apartados' },
  { value: 'CONFIRMED', label: 'Confirmados' },
  { value: 'REJECTED', label: 'Rechazados' },
] as const;

export function CandidateReview({ candidates }: { candidates: readonly BattleCandidate[] }) {
  const [filter, setFilter] = useState<string>('PENDING');

  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    counts.set(candidate.status, (counts.get(candidate.status) ?? 0) + 1);
  }

  const visible = candidates.filter((candidate) => candidate.status === filter);

  return (
    <div className="space-y-5">
      <div className="rounded-panel border border-cyan/30 bg-cyan/5 px-4 py-3 text-sm">
        <p className="font-medium text-cyan">Ningún candidato se confirma solo.</p>
        <p className="mt-1 text-muted">
          La confianza ordena la cola, nada más. Un 100 y un 40 necesitan la misma decisión tuya, y
          confirmar registra el resultado por el mismo camino que escribirlo a mano: puntúa, mueve
          la tabla y queda auditado.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            onClick={() => setFilter(entry.value)}
            aria-pressed={filter === entry.value}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
              filter === entry.value
                ? 'border-cyan/50 bg-cyan/10 text-cyan'
                : 'border-line text-muted hover:border-line-strong hover:text-ink'
            }`}
          >
            {entry.label}
            <span className="font-mono text-[10px] text-faint">{counts.get(entry.value) ?? 0}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="Nada en esta cola"
          description="Sincroniza el historial de un participante para que aparezcan candidatos."
        />
      ) : (
        <div className="space-y-4">
          {visible.map((candidate) => (
            <CandidateCard key={candidate.id} candidate={candidate} />
          ))}
        </div>
      )}
    </div>
  );
}
