/**
 * Operaciones sobre un partido.
 *
 * Qué se puede hacer lo dice el backend en `match.actions`: este componente no
 * deduce transiciones ni comprueba plazos. Si una operación no procede, no se
 * ofrece; y si aun así el backend la rechaza, se enseña su motivo.
 */

import type { AdminMatchDetail, MatchResolution, PostponementReason } from '@liga/contracts';
import {
  Ban,
  CalendarClock,
  Clock,
  PauseCircle,
  Radio,
  RotateCcw,
  Save,
  Send,
  UserX,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { formatDateTime, POSTPONEMENT_REASON_LABELS, roundLabel } from '../../lib/presentation.ts';
import { Button, PendingRule } from '../ui/primitives.tsx';
import { ActionError, useAdminAction } from './actions.tsx';

const field =
  'min-h-11 w-full rounded-lg border border-line bg-elevated px-3 text-sm text-ink placeholder:text-faint focus:border-cyan focus:outline-none';
const labelClass = 'mb-1.5 block text-xs text-faint';

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel p-5">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {description === undefined ? null : <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** `datetime-local` da una cadena sin zona; se convierte a ISO con la del navegador. */
function toIso(value: string): string {
  return new Date(value).toISOString();
}

const REASONS: readonly PostponementReason[] = [
  'PERSONAL',
  'TECHNICAL',
  'CONNECTION',
  'SCHEDULE',
  'UNAVAILABLE',
  'ADMIN_DECISION',
  'OTHER',
];

function RecordResult({ match }: { match: AdminMatchDetail }) {
  const action = useAdminAction();
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [resolution, setResolution] = useState<MatchResolution>('PLAYED');

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const ok = await action.run(`matches/${match.id}/result`, {
      body: {
        homeCrowns: Number(home),
        awayCrowns: Number(away),
        ...(resolution === 'PLAYED' ? {} : { resolution }),
      },
    });
    if (ok) window.location.reload();
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
        <div>
          <label htmlFor="home-crowns" className={labelClass}>
            {match.home.displayName}
          </label>
          <input
            id="home-crowns"
            type="number"
            min={0}
            max={20}
            required
            value={home}
            onChange={(event) => setHome(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="away-crowns" className={labelClass}>
            {match.away.displayName}
          </label>
          <input
            id="away-crowns"
            type="number"
            min={0}
            max={20}
            required
            value={away}
            onChange={(event) => setAway(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="resolucion" className={labelClass}>
            Cómo se resolvió
          </label>
          <select
            id="resolucion"
            value={resolution}
            onChange={(event) => setResolution(event.target.value as MatchResolution)}
            className={field}
          >
            <option value="PLAYED">Se jugó</option>
            <option value="WALKOVER">Incomparecencia</option>
            <option value="ADMIN_DECISION">Decisión administrativa</option>
          </select>
        </div>
        <Button type="submit" icon={Save} busy={action.busy} disabled={action.busy}>
          Registrar
        </Button>
      </div>

      {resolution === 'WALKOVER' ? (
        <div className="mt-3">
          <PendingRule rule="P-01">
            La puntuación de una incomparecencia todavía no está decidida: ni los puntos del que sí
            se presentó, ni con qué coronas figura. El motor va a rechazar este registro a
            propósito, en lugar de inventar un resultado que nadie acordó.
          </PendingRule>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-muted">
        No se admiten empates: un marcador con las mismas coronas se rechaza (R-01).
      </p>
      <ActionError failure={action.failure} />
    </form>
  );
}

function CorrectResult({ match }: { match: AdminMatchDetail }) {
  const action = useAdminAction();
  const [home, setHome] = useState(String(match.result?.homeCrowns ?? ''));
  const [away, setAway] = useState(String(match.result?.awayCrowns ?? ''));
  const [reason, setReason] = useState('');

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const ok = await action.run(`matches/${match.id}/correct-result`, {
      body: { homeCrowns: Number(home), awayCrowns: Number(away), reason },
    });
    if (ok) window.location.reload();
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="corr-home" className={labelClass}>
            {match.home.displayName}
          </label>
          <input
            id="corr-home"
            type="number"
            min={0}
            max={20}
            required
            value={home}
            onChange={(event) => setHome(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="corr-away" className={labelClass}>
            {match.away.displayName}
          </label>
          <input
            id="corr-away"
            type="number"
            min={0}
            max={20}
            required
            value={away}
            onChange={(event) => setAway(event.target.value)}
            className={field}
          />
        </div>
      </div>
      <div className="mt-3">
        <label htmlFor="corr-motivo" className={labelClass}>
          Motivo de la corrección (queda registrado con tu nombre)
        </label>
        <textarea
          id="corr-motivo"
          required
          minLength={3}
          maxLength={500}
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={`${field} py-2`}
        />
      </div>
      <div className="mt-3">
        <Button type="submit" icon={RotateCcw} busy={action.busy} disabled={action.busy}>
          Corregir resultado
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">
        El valor anterior no se pierde: queda como revisión, junto al motivo y la fecha.
      </p>
      <ActionError failure={action.failure} />
    </form>
  );
}

function Postpone({ match }: { match: AdminMatchDetail }) {
  const action = useAdminAction();
  const [reason, setReason] = useState<PostponementReason>('CONNECTION');
  const [notes, setNotes] = useState('');

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const ok = await action.run(`matches/${match.id}/postpone`, { body: { reason, notes } });
    if (ok) window.location.reload();
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <div>
        <label htmlFor="apl-motivo" className={labelClass}>
          Motivo
        </label>
        <select
          id="apl-motivo"
          value={reason}
          onChange={(event) => setReason(event.target.value as PostponementReason)}
          className={field}
        >
          {REASONS.map((entry) => (
            <option key={entry} value={entry}>
              {POSTPONEMENT_REASON_LABELS[entry]}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3">
        <label htmlFor="apl-notas" className={labelClass}>
          Explicación (obligatoria, y no se publica)
        </label>
        <textarea
          id="apl-notas"
          required
          minLength={3}
          maxLength={500}
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className={`${field} py-2`}
        />
      </div>
      <div className="mt-3">
        <Button type="submit" icon={PauseCircle} busy={action.busy} disabled={action.busy}>
          Aplazar
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">
        El partido conserva su {roundLabel(match.roundNumber).toLowerCase()} y su fecha original. No
        puntúa ni cuenta como jugado.
      </p>
      <ActionError failure={action.failure} />
    </form>
  );
}

function Reschedule({ match }: { match: AdminMatchDetail }) {
  const action = useAdminAction();
  const [when, setWhen] = useState('');
  const [notes, setNotes] = useState('');

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const ok = await action.run(`matches/${match.id}/reschedule`, {
      body: { newScheduledAt: toIso(when), notes },
    });
    if (ok) window.location.reload();
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="rep-fecha" className={labelClass}>
            Nueva fecha
          </label>
          <input
            id="rep-fecha"
            type="datetime-local"
            required
            value={when}
            onChange={(event) => setWhen(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="rep-notas" className={labelClass}>
            Explicación
          </label>
          <input
            id="rep-notas"
            required
            minLength={3}
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={field}
          />
        </div>
      </div>
      <div className="mt-3">
        <Button type="submit" icon={CalendarClock} busy={action.busy} disabled={action.busy}>
          Reprogramar
        </Button>
      </div>
      <ActionError failure={action.failure} />
    </form>
  );
}

function Schedule({ match }: { match: AdminMatchDetail }) {
  const action = useAdminAction();
  const [when, setWhen] = useState('');

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const ok = await action.run(`matches/${match.id}/schedule`, {
      body: { scheduledAt: toIso(when) },
    });
    if (ok) window.location.reload();
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
    >
      <div>
        <label htmlFor="prog-fecha" className={labelClass}>
          Fecha y hora
        </label>
        <input
          id="prog-fecha"
          type="datetime-local"
          required
          value={when}
          onChange={(event) => setWhen(event.target.value)}
          className={field}
        />
      </div>
      <Button type="submit" icon={CalendarClock} busy={action.busy} disabled={action.busy}>
        Programar
      </Button>
      <div className="sm:col-span-2">
        <ActionError failure={action.failure} />
      </div>
    </form>
  );
}

function GoLive({ match }: { match: AdminMatchDetail }) {
  const action = useAdminAction();
  const [url, setUrl] = useState(match.stream.url ?? '');

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const ok = await action.run(`matches/${match.id}/live`, {
      body: url.trim() === '' ? {} : { streamUrl: url.trim() },
    });
    if (ok) window.location.reload();
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
    >
      <div>
        <label htmlFor="live-url" className={labelClass}>
          URL de la transmisión (opcional)
        </label>
        <input
          id="live-url"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://…"
          className={field}
        />
      </div>
      <Button type="submit" icon={Radio} busy={action.busy} disabled={action.busy}>
        Poner en directo
      </Button>
      <div className="sm:col-span-2">
        <ActionError failure={action.failure} />
      </div>
    </form>
  );
}

function ReportResult({ match }: { match: AdminMatchDetail }) {
  const action = useAdminAction();
  const [playerId, setPlayerId] = useState(match.home.id);
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const ok = await action.run(`matches/${match.id}/report-result`, {
      body: { playerId, homeCrowns: Number(home), awayCrowns: Number(away) },
    });
    if (ok) window.location.reload();
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="rep-jugador" className={labelClass}>
            Reporta
          </label>
          <select
            id="rep-jugador"
            value={playerId}
            onChange={(event) => setPlayerId(event.target.value)}
            className={field}
          >
            <option value={match.home.id}>{match.home.displayName}</option>
            <option value={match.away.id}>{match.away.displayName}</option>
          </select>
        </div>
        <div>
          <label htmlFor="rep-home" className={labelClass}>
            {match.home.displayName}
          </label>
          <input
            id="rep-home"
            type="number"
            min={0}
            max={20}
            required
            value={home}
            onChange={(event) => setHome(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="rep-away" className={labelClass}>
            {match.away.displayName}
          </label>
          <input
            id="rep-away"
            type="number"
            min={0}
            max={20}
            required
            value={away}
            onChange={(event) => setAway(event.target.value)}
            className={field}
          />
        </div>
        <Button type="submit" icon={Send} busy={action.busy} disabled={action.busy}>
          Reportar
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">
        El marcador se escribe siempre en el orden local-visitante. Si los dos reportes coinciden,
        el resultado queda validado; si se contradicen, el partido pasa a disputa (R-05).
      </p>
      <ActionError failure={action.failure} />
    </form>
  );
}

/**
 * Enlaces de transmisión.
 *
 * Metadatos: no tocan el estado del partido ni el resultado. Se editan en dos
 * momentos distintos —el directo antes, el VOD después—, así que el formulario
 * está siempre disponible y no depende de ninguna transición.
 */
function Stream({ match }: { match: AdminMatchDetail }) {
  const action = useAdminAction();
  const [url, setUrl] = useState(match.stream.url ?? '');
  const [vod, setVod] = useState(match.stream.vodUrl ?? '');
  const [platform, setPlatform] = useState(match.stream.platform ?? '');

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const clean = (value: string): string | null => (value.trim() === '' ? null : value.trim());
    const ok = await action.run(`matches/${match.id}/stream`, {
      body: { streamUrl: clean(url), vodUrl: clean(vod), platform: clean(platform) },
    });
    if (ok) window.location.reload();
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="stream-url" className={labelClass}>
            Directo
          </label>
          <input
            id="stream-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            className={field}
          />
        </div>
        <div>
          <label htmlFor="stream-vod" className={labelClass}>
            Repetición (VOD)
          </label>
          <input
            id="stream-vod"
            type="url"
            value={vod}
            onChange={(event) => setVod(event.target.value)}
            placeholder="https://…"
            className={field}
          />
        </div>
        <div>
          <label htmlFor="stream-plataforma" className={labelClass}>
            Plataforma
          </label>
          <input
            id="stream-plataforma"
            type="text"
            maxLength={40}
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
            placeholder="Twitch, YouTube…"
            className={field}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" icon={Save} busy={action.busy} disabled={action.busy}>
            Guardar enlaces
          </Button>
        </div>
      </div>
      <p className="mt-3 text-xs text-faint">
        Solo se admiten enlaces http o https. Vaciar un campo borra ese enlace.
      </p>
      <ActionError failure={action.failure} />
    </form>
  );
}

/**
 * Cancelar un partido.
 *
 * La única operación del calendario sin vuelta atrás. Por eso pide el motivo
 * y una confirmación escrita: un clic de más no debería poder borrar un
 * partido del calendario para siempre.
 */
function Cancel({ match }: { match: AdminMatchDetail }) {
  const action = useAdminAction();
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const confirmed = confirmation.trim().toUpperCase() === 'CANCELAR';

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!confirmed) return;
    const ok = await action.run(`matches/${match.id}/cancel`, { body: { reason: reason.trim() } });
    if (ok) window.location.reload();
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className="grid gap-3">
        <div>
          <label htmlFor="cancel-motivo" className={labelClass}>
            Motivo de la cancelación
          </label>
          <input
            id="cancel-motivo"
            type="text"
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Por qué este partido no se jugará"
            className={field}
          />
        </div>
        <div>
          <label htmlFor="cancel-confirmacion" className={labelClass}>
            Escribe CANCELAR para confirmar
          </label>
          <input
            id="cancel-confirmacion"
            type="text"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            aria-describedby="cancel-aviso"
            className={field}
          />
        </div>
        <div>
          <Button
            type="submit"
            variant="danger"
            icon={Ban}
            busy={action.busy}
            disabled={action.busy || !confirmed}
          >
            Cancelar el partido
          </Button>
        </div>
      </div>
      <p id="cancel-aviso" className="mt-3 text-xs text-danger">
        No tiene vuelta atrás: un partido cancelado no vuelve a ningún otro estado. No cuenta como
        victoria, ni como derrota, ni como partido jugado para ninguno de los dos.
      </p>
      <ActionError failure={action.failure} />
    </form>
  );
}

/**
 * Declarar una incomparecencia (R-09).
 *
 * Cuatro cosas y en este orden: comprobar que ya pasó la tolerancia, decir
 * quién no apareció, escribir el motivo y confirmar. El orden importa porque
 * la primera es la que decide si las otras tres tienen sentido.
 *
 * Si el backend dice que todavía no se puede, la pantalla dice **desde cuándo**
 * en vez de un «no» a secas: quien está esperando a que pasen los quince
 * minutos quiere saber cuántos faltan.
 */
function Walkover({ match }: { match: AdminMatchDetail }) {
  const action = useAdminAction();
  const [absent, setAbsent] = useState(match.away.id);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const { walkover } = match.actions;
  const confirmed = confirmation.trim().toUpperCase() === 'INCOMPARECENCIA';
  const present = absent === match.home.id ? match.away.displayName : match.home.displayName;

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!confirmed) return;
    const ok = await action.run(`matches/${match.id}/walkover`, {
      body: { absentPlayerId: absent, reason: reason.trim() },
    });
    if (ok) window.location.reload();
  };

  if (!walkover.canDeclare) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted">
        <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-faint" />
        <span>
          {walkover.canDeclareFrom === null ? (
            <>
              Este partido no admite incomparecencia: hace falta una hora prevista y que no tenga
              resultado todavía.
            </>
          ) : (
            <>
              Faltan por cumplirse los {walkover.toleranceMinutes} minutos de tolerancia. Se podrá
              declarar a partir de las <strong>{formatDateTime(walkover.canDeclareFrom)}</strong>.
            </>
          )}
        </span>
      </p>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className="grid gap-3">
        <div>
          <label htmlFor="wo-ausente" className={labelClass}>
            Quién no se presentó
          </label>
          <select
            id="wo-ausente"
            value={absent}
            onChange={(event) => setAbsent(event.target.value)}
            className={field}
          >
            <option value={match.home.id}>{match.home.displayName}</option>
            <option value={match.away.id}>{match.away.displayName}</option>
          </select>
        </div>

        <div>
          <label htmlFor="wo-motivo" className={labelClass}>
            Motivo de la incomparecencia
          </label>
          <input
            id="wo-motivo"
            type="text"
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Qué pasó, para poder explicarlo dentro de seis meses"
            className={field}
          />
        </div>

        <div>
          <label htmlFor="wo-confirmacion" className={labelClass}>
            Escribe INCOMPARECENCIA para confirmar
          </label>
          <input
            id="wo-confirmacion"
            type="text"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            aria-describedby="wo-aviso"
            className={field}
          />
        </div>

        <div>
          <Button
            type="submit"
            variant="danger"
            icon={UserX}
            busy={action.busy}
            disabled={action.busy || !confirmed}
          >
            Declarar incomparecencia
          </Button>
        </div>
      </div>

      <p id="wo-aviso" className="mt-3 text-xs text-warning">
        Gana <strong>{present}</strong> con 3 puntos y sin coronas. No se registra ningún marcador:
        no hubo batalla, y un 3-0 inventado contaminaría la diferencia de coronas de los dos.
      </p>
      <ActionError failure={action.failure} />
    </form>
  );
}

export function MatchAdmin({ match }: { match: AdminMatchDetail }) {
  const { actions } = match;
  const canGoLive = actions.allowedTransitions.includes('LIVE');
  const canPostpone = actions.allowedTransitions.includes('POSTPONED');

  return (
    <div className="space-y-5">
      {actions.acceptsResult ? (
        <Card
          title={match.status === 'DISPUTED' ? 'Resolver la disputa' : 'Registrar resultado'}
          description={
            match.status === 'DISPUTED'
              ? 'Los reportes de los dos jugadores están a la derecha. El marcador que se registre aquí cierra la disputa y vuelve a contar en la tabla.'
              : 'Lo introduce administración. El ganador, el tipo de victoria y los puntos los deriva el motor.'
          }
        >
          <RecordResult match={match} />
        </Card>
      ) : null}

      {actions.acceptsResult ? (
        <Card
          title="Reporte de un jugador"
          description="Doble reporte: cuando los dos coinciden, el resultado se valida solo."
        >
          <ReportResult match={match} />
        </Card>
      ) : null}

      {actions.canCorrectResult ? (
        <Card
          title="Corregir el resultado"
          description="Para arreglar un error ya registrado. Deja revisión y auditoría."
        >
          <CorrectResult match={match} />
        </Card>
      ) : null}

      {canGoLive ? (
        <Card title="Directo" description="Marca el partido como en juego.">
          <GoLive match={match} />
        </Card>
      ) : null}

      {canPostpone ? (
        <Card title="Aplazar" description="Ante un inconveniente real, antes o durante el partido.">
          <Postpone match={match} />
        </Card>
      ) : null}

      {actions.canReschedule ? (
        <Card
          title="Reprogramar"
          description={`Aplazado ${match.postponementCount} ${
            match.postponementCount === 1 ? 'vez' : 'veces'
          }. La fecha original sigue siendo ${formatDateTime(match.originalScheduledAt)}.`}
        >
          <Reschedule match={match} />
        </Card>
      ) : null}

      {match.status === 'SCHEDULED' ? (
        <Card title="Fecha" description="Fija o cambia la fecha prevista del partido.">
          <Schedule match={match} />
        </Card>
      ) : null}

      {actions.canEditStream ? (
        <Card
          title="Transmisión"
          description="El directo y la repetición. Son metadatos: no cambian el estado ni el resultado."
        >
          <Stream match={match} />
        </Card>
      ) : null}

      {match.result === null && match.status !== 'CANCELLED' ? (
        <Card
          title="Incomparecencia"
          description={`Pasados los ${actions.walkover.toleranceMinutes} minutos de tolerancia, si el rival no apareció.`}
        >
          <Walkover match={match} />
        </Card>
      ) : null}

      {actions.canCancel ? (
        <Card
          title="Cancelar"
          description="Para un partido que no se va a jugar nunca. Es la única operación irreversible."
        >
          <Cancel match={match} />
        </Card>
      ) : null}

      {actions.allowedTransitions.length === 0 &&
      !actions.acceptsResult &&
      !actions.canCorrectResult ? (
        <p className="panel p-5 text-sm text-muted">
          Este partido está cancelado: no admite ninguna operación. Sigue en el calendario para que
          la jornada se entienda, pero no cuenta para nadie.
        </p>
      ) : null}
    </div>
  );
}
