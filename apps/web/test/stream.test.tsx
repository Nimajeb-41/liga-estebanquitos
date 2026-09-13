/**
 * El overlay y el panel de transmisión.
 *
 * Un overlay miente más barato que una página: va encima del vídeo, en letra
 * enorme, y nadie va a pararlo a comprobar nada. Por eso lo que se fija aquí es
 * lo que **no** puede aparecer: un marcador que no existe, un partido que no
 * cuenta presentado como si contara, o cualquier dato administrativo.
 */

import type { Match } from '@liga/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Overlay, type OverlayOptions } from '../src/components/stream/Overlay.tsx';
import { StreamControl } from '../src/components/stream/StreamControl.tsx';
import { makeMatch, makeResult } from './helpers.ts';

const OPTIONS: OverlayOptions = { variant: 'full', scale: 1, minimal: false };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Overlay', () => {
  it('no inventa un marcador cuando no hay resultado', () => {
    render(<Overlay match={makeMatch({ status: 'LIVE', result: null })} options={OPTIONS} />);

    // «VS», no un 0–0 que se leería como un marcador real en pantalla.
    expect(screen.getByText('VS')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('muestra las coronas en cuanto el resultado existe', () => {
    render(
      <Overlay
        match={makeMatch({
          status: 'COMPLETED',
          result: makeResult({ homeCrowns: 3, awayCrowns: 1 }),
        })}
        options={OPTIONS}
      />,
    );

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('VS')).not.toBeInTheDocument();
  });

  it('dice en pantalla que un aplazado está aplazado', () => {
    render(<Overlay match={makeMatch({ status: 'POSTPONED', result: null })} options={OPTIONS} />);
    expect(screen.getByText('Aplazado')).toBeInTheDocument();
  });

  it('un partido en revisión no se anuncia como final', () => {
    render(
      <Overlay match={makeMatch({ status: 'DISPUTED', result: makeResult() })} options={OPTIONS} />,
    );

    expect(screen.getByText('En revisión')).toBeInTheDocument();
    expect(screen.queryByText('Final')).not.toBeInTheDocument();
  });

  it('el modo mínimo deja solo nombres y marcador', () => {
    render(<Overlay match={makeMatch()} options={{ ...OPTIONS, minimal: true }} />);

    expect(screen.getByText('Nimaben')).toBeInTheDocument();
    expect(screen.queryByText(/jornada/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Final')).not.toBeInTheDocument();
  });

  it('sondea el estado del partido sin salir de este origen', () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ status: 'COMPLETED', result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<Overlay match={makeMatch({ id: 'm-9', status: 'LIVE' })} options={OPTIONS} />);
    vi.advanceTimersByTime(10_000);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/partidos/m-9/live.json',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    );
    vi.useRealTimers();
  });
});

describe('StreamControl', () => {
  const matches: Match[] = [
    makeMatch({ id: 'm-1', roundNumber: 3 }),
    makeMatch({ id: 'm-2', roundNumber: 4, status: 'SCHEDULED', result: null }),
  ];

  it('construye la URL del overlay con el origen público', () => {
    render(<StreamControl matches={matches} origin="https://liga.example" />);

    expect(screen.getByLabelText('URL del overlay')).toHaveValue(
      'https://liga.example/overlay/match/m-1',
    );
  });

  it('los ajustes se reflejan en la URL, no en el servidor', async () => {
    const user = userEvent.setup();
    render(<StreamControl matches={matches} origin="https://liga.example" />);

    await user.selectOptions(screen.getByLabelText('Colocación'), 'compact');
    await user.selectOptions(screen.getByLabelText('Tamaño'), '1.5');
    await user.click(screen.getByLabelText(/solo nombres y marcador/i));

    const value = String((screen.getByLabelText('URL del overlay') as HTMLInputElement).value);
    expect(value).toContain('variant=compact');
    expect(value).toContain('scale=1.5');
    expect(value).toContain('minimal=1');
  });

  it('explica que el overlay no enseña un cero por un marcador', () => {
    render(<StreamControl matches={matches} origin="https://liga.example" />);
    expect(screen.getByText(/no un 0–0/i)).toBeInTheDocument();
  });

  it('sin calendario lo dice, en vez de dar una URL rota', () => {
    render(<StreamControl matches={[]} origin="https://liga.example" />);

    expect(screen.getByText(/no hay ningún partido en el calendario/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('URL del overlay')).not.toBeInTheDocument();
  });
});
