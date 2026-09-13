/**
 * Las acciones administrativas no comprueban reglas: llaman al backend y
 * enseñan lo que responde. Estos tests fijan que un rechazo del motor llegue
 * al administrador tal y como es, y no se pierda por el camino.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActionButton } from '../src/components/admin/actions.tsx';
import { MatchAdmin } from '../src/components/admin/MatchAdmin.tsx';
import { TournamentControls } from '../src/components/admin/TournamentControls.tsx';
import type { AdminMatchDetail, TournamentOverview } from '@liga/contracts';

import { makeMatchDetail } from './helpers.ts';

function overview(overrides: Partial<TournamentOverview> = {}): TournamentOverview {
  return {
    id: 't1',
    slug: 'liga',
    name: 'Liga Estabanquitos',
    season: '2026-1',
    status: 'REGISTRATION',
    capabilities: ['MANAGE_ROSTER'],
    allowedTransitions: ['READY', 'CANCELLED'],
    format: {
      players: 10,
      legs: 2,
      rounds: 18,
      matchesPerRound: 5,
      totalMatches: 90,
      matchesPerPlayer: 18,
    },
    roster: { confirmed: 6, pending: 4, registered: 6, rosterSize: 10, complete: false },
    fixture: { generated: false, seed: null, generatedAt: null, matches: 0 },
    progress: {
      completed: 0,
      scheduled: 0,
      live: 0,
      postponed: 0,
      disputed: 0,
      cancelled: 0,
      total: 0,
      ratio: 0,
      currentRound: null,
    },
    rulesVersion: '2026-1.2',
    plannedStartAt: null,
    plannedEndAt: null,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function stubFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ActionButton', () => {
  it('llama al puente administrativo del propio origen, nunca a la API', async () => {
    const user = userEvent.setup();
    stubFetch(200, { ok: true });
    const onDone = vi.fn();

    render(
      <ActionButton path="players/p1/confirm" body={{ slot: 3 }} onDone={onDone}>
        Confirmar
      </ActionButton>,
    );
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe('/api/admin/players/p1/confirm');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ slot: 3 }));
  });

  it('enseña el motivo por el que el motor rechazó la operación', async () => {
    const user = userEvent.setup();
    stubFetch(422, {
      error: {
        code: 'PENDING_RULE',
        message:
          'Esta acción todavía no puede realizarse: la regla del torneo que la define está pendiente de definición.',
      },
    });

    render(<ActionButton path="matches/m1/result">Registrar</ActionButton>);
    await user.click(screen.getByRole('button', { name: 'Registrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/pendiente de definición/i);
  });

  it('desglosa los errores de validación campo a campo', async () => {
    const user = userEvent.setup();
    stubFetch(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Revisa los datos.',
        details: { issues: [{ path: 'homeCrowns', message: 'Debe ser un entero.' }] },
      },
    });

    render(<ActionButton path="matches/m1/result">Registrar</ActionButton>);
    await user.click(screen.getByRole('button', { name: 'Registrar' }));

    expect(await screen.findByText(/homeCrowns: Debe ser un entero/i)).toBeInTheDocument();
  });

  it('avisa cuando ni siquiera se pudo llegar al servidor', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );

    render(<ActionButton path="matches/m1/live">Directo</ActionButton>);
    await user.click(screen.getByRole('button', { name: 'Directo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo contactar/i);
  });
});

describe('TournamentControls', () => {
  it('ofrece solo las transiciones que declara el backend', () => {
    render(<TournamentControls overview={overview()} />);

    expect(screen.getByRole('button', { name: /plantilla cerrada/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelado/i })).toBeInTheDocument();
    // LIVE no está en allowedTransitions: no se ofrece.
    expect(screen.queryByRole('button', { name: /^en juego$/i })).not.toBeInTheDocument();
  });

  it('dice que un estado final no admite cambios', () => {
    render(
      <TournamentControls overview={overview({ status: 'FINISHED', allowedTransitions: [] })} />,
    );

    expect(screen.getByText(/este estado es final/i)).toBeInTheDocument();
  });
});

/* ========================================================================== */
/* Operaciones sobre un partido                                                */
/* ========================================================================== */

/**
 * Lo que se prueba aquí es la puerta, no el formulario.
 *
 * Cancelar es la única operación irreversible del calendario, así que no puede
 * dispararse con un clic distraído; y las operaciones que el backend no
 * permite en este estado no deben ni aparecer, porque ofrecer un botón que
 * siempre falla enseña a ignorar los errores.
 */
function adminMatch(overrides: Partial<AdminMatchDetail> = {}): AdminMatchDetail {
  return {
    ...makeMatchDetail(),
    actions: {
      allowedTransitions: ['LIVE', 'COMPLETED', 'POSTPONED', 'DISPUTED', 'CANCELLED'],
      acceptsResult: true,
      canCorrectResult: false,
      canReschedule: false,
      canCancel: true,
      canEditStream: true,
      walkover: { canDeclare: false, canDeclareFrom: null, toleranceMinutes: 15 },
    },
    history: { postponements: [], reports: [], revisions: [] },
    ...overrides,
  };
}

/** Un partido sin jugar, con la tolerancia ya cumplida. */
function walkoverReady(): AdminMatchDetail {
  return adminMatch({
    status: 'SCHEDULED',
    result: null,
    actions: {
      allowedTransitions: ['LIVE', 'POSTPONED', 'CANCELLED'],
      acceptsResult: true,
      canCorrectResult: false,
      canReschedule: true,
      canCancel: true,
      canEditStream: true,
      walkover: {
        canDeclare: true,
        canDeclareFrom: '2026-10-08T22:15:00.000Z',
        toleranceMinutes: 15,
      },
    },
  });
}

describe('MatchAdmin', () => {
  it('no cancela mientras no se escriba la confirmación', async () => {
    const user = userEvent.setup();
    stubFetch(200, { ok: true });
    render(<MatchAdmin match={adminMatch({ status: 'SCHEDULED' })} />);

    const button = screen.getByRole('button', { name: /cancelar el partido/i });
    expect(button).toBeDisabled();

    await user.type(
      screen.getByLabelText(/motivo de la cancelación/i),
      'Se retiró un participante',
    );
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText(/escribe cancelar/i), 'cancelar');
    expect(button).toBeEnabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('avisa de que cancelar no tiene vuelta atrás', () => {
    render(<MatchAdmin match={adminMatch({ status: 'SCHEDULED' })} />);
    expect(screen.getByText(/no tiene vuelta atrás/i)).toBeInTheDocument();
  });

  it('no ofrece cancelar cuando el backend no lo permite', () => {
    render(
      <MatchAdmin
        match={adminMatch({
          status: 'CANCELLED',
          actions: {
            allowedTransitions: [],
            acceptsResult: false,
            canCorrectResult: false,
            canReschedule: false,
            canCancel: false,
            canEditStream: true,
            walkover: { canDeclare: false, canDeclareFrom: null, toleranceMinutes: 15 },
          },
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: /cancelar el partido/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no admite ninguna operación/i)).toBeInTheDocument();
  });

  it('llama a resolver la disputa, no a registrar el resultado', () => {
    render(<MatchAdmin match={adminMatch({ status: 'DISPUTED' })} />);

    expect(screen.getByText('Resolver la disputa')).toBeInTheDocument();
    expect(screen.queryByText('Registrar resultado')).not.toBeInTheDocument();
  });

  it('guarda los enlaces de transmisión sin tocar el estado', async () => {
    const user = userEvent.setup();
    stubFetch(200, { ok: true });
    render(<MatchAdmin match={adminMatch({ status: 'SCHEDULED' })} />);

    await user.type(screen.getByLabelText('Directo'), 'https://twitch.tv/liga');
    await user.click(screen.getByRole('button', { name: /guardar enlaces/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!;
    expect(url).toContain('/stream');
    expect(JSON.parse(String(init.body))).toMatchObject({
      streamUrl: 'https://twitch.tv/liga',
      vodUrl: null,
      platform: null,
    });
  });

  it('no deja declarar la incomparecencia antes de la tolerancia', () => {
    render(
      <MatchAdmin
        match={adminMatch({
          status: 'SCHEDULED',
          result: null,
          actions: {
            allowedTransitions: ['LIVE'],
            acceptsResult: true,
            canCorrectResult: false,
            canReschedule: true,
            canCancel: true,
            canEditStream: true,
            walkover: {
              canDeclare: false,
              canDeclareFrom: '2026-10-08T22:15:00.000Z',
              toleranceMinutes: 15,
            },
          },
        })}
      />,
    );

    expect(screen.getByText(/Faltan por cumplirse/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /declarar incomparecencia/i }),
    ).not.toBeInTheDocument();
  });

  it('exige escribir INCOMPARECENCIA y avisa de que no hay marcador', async () => {
    const user = userEvent.setup();
    stubFetch(200, { ok: true });
    render(<MatchAdmin match={walkoverReady()} />);

    const button = screen.getByRole('button', { name: /declarar incomparecencia/i });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText(/motivo de la incomparecencia/i), 'No se conecto');
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText(/escribe incomparecencia/i), 'INCOMPARECENCIA');
    expect(button).toBeEnabled();
    // El aviso es la parte que evita el 3-0 inventado.
    expect(screen.getByText(/sin coronas/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('manda quien falto, no un marcador', async () => {
    const user = userEvent.setup();
    stubFetch(200, { ok: true });
    render(<MatchAdmin match={walkoverReady()} />);

    await user.selectOptions(screen.getByLabelText(/no se present/i), 'player-home');
    await user.type(screen.getByLabelText(/motivo de la incomparecencia/i), 'No se conecto');
    await user.type(screen.getByLabelText(/escribe incomparecencia/i), 'incomparecencia');
    await user.click(screen.getByRole('button', { name: /declarar incomparecencia/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!;
    expect(url).toContain('/walkover');
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ absentPlayerId: 'player-home', reason: 'No se conecto' });
    expect(body).not.toHaveProperty('homeCrowns');
  });

  it('un partido ya resuelto no ofrece incomparecencia', () => {
    render(<MatchAdmin match={adminMatch({ status: 'COMPLETED' })} />);

    expect(screen.queryByRole('heading', { name: 'Incomparecencia' })).not.toBeInTheDocument();
  });
});
