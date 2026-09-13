/**
 * Las piezas del Match Center: el historial de un partido, el marcador en
 * directo y el panel de transmisión.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LiveMatch } from '../src/components/matches/LiveMatch.tsx';
import {
  MatchStateNotice,
  PostponementDetail,
} from '../src/components/matches/MatchStateNotice.tsx';
import { MatchTimeline } from '../src/components/matches/MatchTimeline.tsx';
import { safeExternalUrl, StreamPanel } from '../src/components/matches/StreamPanel.tsx';
import { makeMatch, makeMatchDetail } from './helpers.ts';

describe('MatchTimeline', () => {
  it('cuenta el aplazamiento con su motivo y su fecha anterior', () => {
    const detail = makeMatchDetail({
      history: {
        postponements: [
          {
            event: 'POSTPONED',
            roundNumber: 4,
            previousScheduledAt: '2026-10-08T22:00:00.000Z',
            newScheduledAt: null,
            reason: 'CONNECTION',
            occurredAt: '2026-10-08T21:50:00.000Z',
          },
          {
            event: 'RESCHEDULED',
            roundNumber: 4,
            previousScheduledAt: null,
            newScheduledAt: '2026-10-15T22:00:00.000Z',
            reason: 'SCHEDULE',
            occurredAt: '2026-10-09T10:00:00.000Z',
          },
        ],
        corrections: [],
        reportCount: 0,
      },
    });

    render(<MatchTimeline history={detail.history} />);

    expect(screen.getByText('Partido aplazado')).toBeInTheDocument();
    expect(screen.getByText(/problema de conexion/i)).toBeInTheDocument();
    expect(screen.getByText('Nueva fecha acordada')).toBeInTheDocument();
    // La jornada no cambia al reprogramar.
    expect(screen.getByText(/la jornada sigue siendo la 4/i)).toBeInTheDocument();
  });

  it('publica que hubo una corrección pero no su motivo, que depende de P-10', () => {
    const detail = makeMatchDetail({
      history: {
        postponements: [],
        corrections: [{ revision: 2, changedAt: '2026-10-09T12:00:00.000Z' }],
        reportCount: 2,
      },
    });

    render(<MatchTimeline history={detail.history} />);

    expect(screen.getByText(/corrección administrativa n.º 2/i)).toBeInTheDocument();
    expect(screen.getByText(/P-10/)).toBeInTheDocument();
  });

  it('dice que no hubo incidencias cuando no las hubo', () => {
    render(<MatchTimeline history={makeMatchDetail().history} />);

    expect(screen.getByText('Sin incidencias')).toBeInTheDocument();
  });
});

describe('LiveMatch', () => {
  it('no finge un marcador mientras no hay datos en vivo', () => {
    render(<LiveMatch match={makeMatch({ status: 'LIVE', result: null })} />);

    expect(screen.getByText('Esperando datos en vivo.')).toBeInTheDocument();
    expect(
      screen.getByText(/todavía no recibe las coronas batalla a batalla/i),
    ).toBeInTheDocument();
  });

  it('anuncia los cambios de forma cortés para un lector de pantalla', () => {
    const { container } = render(<LiveMatch match={makeMatch({ status: 'LIVE', result: null })} />);

    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('enseña el marcador en cuanto el resultado existe', () => {
    render(<LiveMatch match={makeMatch({ status: 'COMPLETED' })} />);

    expect(screen.getByLabelText('Nimaben 3, Esteban 1')).toBeInTheDocument();
  });
});

describe('StreamPanel', () => {
  it('no dibuja nada cuando el partido no tiene transmisión', () => {
    const { container } = render(<StreamPanel match={makeMatch()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('enlaza el directo con rel defensivo', () => {
    const match = makeMatch({
      stream: { url: 'https://twitch.tv/liga', vodUrl: null, platform: 'Twitch' },
    });
    render(<StreamPanel match={match} />);

    const link = screen.getByRole('link', { name: /ver en directo/i });
    expect(link).toHaveAttribute('href', 'https://twitch.tv/liga');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});

describe('safeExternalUrl', () => {
  it('acepta http y https', () => {
    expect(safeExternalUrl('https://twitch.tv/liga')).toBe('https://twitch.tv/liga');
    expect(safeExternalUrl('http://ejemplo.local/x')).toBe('http://ejemplo.local/x');
  });

  it('rechaza cualquier otro esquema, empezando por javascript:', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,<script>')).toBeNull();
    expect(safeExternalUrl('no es una url')).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl('')).toBeNull();
  });
});

/* ========================================================================== */
/* El aviso de estado                                                          */
/* ========================================================================== */

/**
 * Los seis estados tienen aviso y los seis dicen si el partido cuenta.
 *
 * Es la frase que decide cómo se lee todo lo demás de la pantalla, y la que
 * más caro sale equivocar: presentar un aplazado o una disputa como algo que
 * ya cuenta convierte la ficha en una mentira con buen diseño.
 */
describe('MatchStateNotice', () => {
  const CASES = [
    { status: 'SCHEDULED' as const, title: 'Todavía no se ha jugado', counts: false },
    { status: 'LIVE' as const, title: 'Partido en directo', counts: false },
    { status: 'COMPLETED' as const, title: 'Resultado registrado', counts: true },
    { status: 'POSTPONED' as const, title: 'Partido aplazado', counts: false },
    { status: 'DISPUTED' as const, title: 'Resultado en disputa', counts: false },
    { status: 'CANCELLED' as const, title: 'Partido cancelado', counts: false },
  ];

  for (const entry of CASES) {
    it(`explica el estado ${entry.status} y si cuenta en la tabla`, () => {
      render(<MatchStateNotice match={makeMatchDetail({ status: entry.status })} />);

      expect(screen.getByText(entry.title)).toBeInTheDocument();
      expect(
        screen.getByText(
          entry.counts ? 'Cuenta en la clasificación' : 'No cuenta en la clasificación',
        ),
      ).toBeInTheDocument();
    });
  }

  it('la disputa se anuncia a los lectores de pantalla', () => {
    render(<MatchStateNotice match={makeMatchDetail({ status: 'DISPUTED' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Resultado en disputa');
  });

  it('un aplazado conserva su jornada original en el texto', () => {
    render(<MatchStateNotice match={makeMatchDetail({ status: 'POSTPONED', roundNumber: 7 })} />);
    expect(screen.getByText(/jornada 07 original/i)).toBeInTheDocument();
  });

  it('un cancelado no se presenta como derrota de nadie', () => {
    render(<MatchStateNotice match={makeMatchDetail({ status: 'CANCELLED' })} />);

    expect(screen.getByText(/ni como victoria, ni como derrota/i)).toBeInTheDocument();
    expect(screen.queryByText(/gana /i)).not.toBeInTheDocument();
  });
});

describe('PostponementDetail', () => {
  const moved = makeMatchDetail({
    status: 'POSTPONED',
    roundNumber: 4,
    postponementCount: 2,
    originalScheduledAt: '2026-10-08T22:00:00.000Z',
    scheduledAt: '2026-10-15T22:00:00.000Z',
    history: {
      postponements: [
        {
          event: 'POSTPONED',
          roundNumber: 4,
          previousScheduledAt: '2026-10-08T22:00:00.000Z',
          newScheduledAt: null,
          reason: 'CONNECTION',
          occurredAt: '2026-10-08T21:30:00.000Z',
        },
        {
          event: 'RESCHEDULED',
          roundNumber: 4,
          previousScheduledAt: null,
          newScheduledAt: '2026-10-15T22:00:00.000Z',
          reason: 'CONNECTION',
          occurredAt: '2026-10-09T10:00:00.000Z',
        },
      ],
      corrections: [],
      reportCount: 0,
    },
  });

  it('conserva la jornada y la fecha originales', () => {
    render(<PostponementDetail match={moved} />);

    expect(screen.getByText('Jornada original')).toBeInTheDocument();
    expect(screen.getAllByText('Jornada 04').length).toBeGreaterThan(0);
    expect(screen.getByText('Fecha original')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // aplazamientos
  });

  it('enumera cada movimiento con su motivo', () => {
    render(<PostponementDetail match={moved} />);

    expect(screen.getByText('Aplazado')).toBeInTheDocument();
    expect(screen.getByText('Reprogramado')).toBeInTheDocument();
    expect(screen.getByText(/problema de conexion/i)).toBeInTheDocument();
  });

  it('nunca publica las notas internas del aplazamiento', () => {
    // El contrato publico no las trae; esto fija que la pieza tampoco las pida.
    const { container } = render(<PostponementDetail match={moved} />);
    expect(container.textContent).not.toContain('notes');
  });

  it('dice cuando un aplazado no tiene fecha nueva', () => {
    render(
      <PostponementDetail
        match={makeMatchDetail({
          status: 'POSTPONED',
          scheduledAt: '2026-10-08T22:00:00.000Z',
          originalScheduledAt: '2026-10-08T22:00:00.000Z',
        })}
      />,
    );

    expect(screen.getByText('Sin fecha nueva todavía')).toBeInTheDocument();
  });
});
