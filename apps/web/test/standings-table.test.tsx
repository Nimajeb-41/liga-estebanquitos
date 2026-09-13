/**
 * La tabla no calcula: representa. Estos tests fijan que respete el orden del
 * backend, que avise cuando el usuario lo cambia, y que sea una tabla de
 * verdad, navegable con lector de pantalla.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { StandingsTable } from '../src/components/standings/StandingsTable.tsx';
import { makeRow, makeStandings } from './helpers.ts';

const standings = makeStandings([
  makeRow({ playerId: 'a', displayName: 'Nimaben', slug: 'nimaben', position: 1, points: 11 }),
  makeRow({
    playerId: 'b',
    displayName: 'Lyuk',
    slug: 'lyuk',
    position: 2,
    points: 7,
    played: 4,
    wins: 2,
    losses: 2,
    crownDiff: -1,
    form: ['L', 'W'],
    positionChange: -1,
  }),
  makeRow({
    playerId: 'c',
    displayName: 'Dullys',
    slug: 'dullys',
    position: 3,
    points: 3,
    played: 5,
    wins: 1,
    losses: 4,
    crownDiff: -4,
    sanctionPoints: -2,
    sanctionCount: 1,
    unresolvedTie: true,
    positionChange: null,
  }),
]);

describe('StandingsTable', () => {
  it('respeta el orden que calculó el backend', () => {
    render(<StandingsTable standings={standings} />);

    const names = screen.getAllByRole('link').map((link) => link.textContent?.trim());
    expect(names[0]).toContain('Nimaben');
    expect(names[1]).toContain('Lyuk');
    expect(names[2]).toContain('Dullys');
  });

  it('es una tabla accesible, con título y encabezados explicados', () => {
    render(<StandingsTable standings={standings} />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText(/ordenada según los criterios del reglamento/i)).toBeInTheDocument();
    expect(screen.getByTitle('Partidos jugados')).toBeInTheDocument();
    expect(screen.getByTitle('Diferencia de coronas')).toBeInTheDocument();
  });

  it('marca el empate sin resolver en lugar de deshacerlo por su cuenta', () => {
    render(<StandingsTable standings={standings} />);

    expect(screen.getByTitle(/empate sin resolver/i)).toBeInTheDocument();
  });

  it('muestra las sanciones que restan puntos', () => {
    render(<StandingsTable standings={standings} />);

    expect(screen.getByText(/-2 pts · 1 sanción/i)).toBeInTheDocument();
  });

  it('escribe la diferencia de coronas con signo', () => {
    render(<StandingsTable standings={standings} />);

    expect(screen.getByText('+6')).toBeInTheDocument();
    expect(screen.getByText('−1')).toBeInTheDocument();
  });

  it('avisa cuando el orden ya no es el oficial, y permite volver', async () => {
    const user = userEvent.setup();
    render(<StandingsTable standings={standings} />);

    await user.click(screen.getByRole('button', { name: /ordenar por partidos jugados/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/no es la clasificación oficial/i);

    await user.click(screen.getByRole('button', { name: /volver al orden oficial/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('no dibuja una tabla en cero cuando todavía no se jugó nada', () => {
    render(<StandingsTable standings={makeStandings([])} />);

    expect(screen.getByText(/todavía no hay clasificación/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('describe la forma reciente en texto, no solo en color', () => {
    render(<StandingsTable standings={standings} />);

    expect(screen.getAllByText(/forma reciente de nimaben/i).length).toBeGreaterThan(0);
  });
});
