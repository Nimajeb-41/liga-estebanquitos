/**
 * La tarjeta de partido es donde más fácil sería mentir sin querer: mostrar un
 * aplazamiento como una derrota, o un resultado en disputa como definitivo.
 * Estos tests fijan que no ocurra.
 */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MatchCard } from '../src/components/matches/MatchCard.tsx';
import { makeMatch, makeResult } from './helpers.ts';

describe('MatchCard', () => {
  it('muestra el resultado de un partido finalizado', () => {
    render(<MatchCard match={makeMatch()} />);

    expect(screen.getByText('Nimaben')).toBeInTheDocument();
    expect(screen.getByText('Esteban')).toBeInTheDocument();
    expect(screen.getByText('Finalizado')).toBeInTheDocument();
    // Coronas y puntos, tal y como los da el backend.
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('+4')).toBeInTheDocument();
  });

  describe('un partido aplazado', () => {
    const postponed = makeMatch({
      status: 'POSTPONED',
      postponementCount: 2,
      result: null,
      scheduledAt: null,
      playedAt: null,
    });

    it('no se presenta como derrota ni como jugado', () => {
      render(<MatchCard match={postponed} />);

      expect(screen.getByText('Aplazado')).toBeInTheDocument();
      expect(screen.getByText(/no puntúa ni cuenta como jugado/i)).toBeInTheDocument();
      expect(screen.queryByText('Finalizado')).not.toBeInTheDocument();
    });

    it('conserva su jornada original y dice cuántas veces se aplazó', () => {
      render(<MatchCard match={postponed} />);

      expect(screen.getByText(/jornada 04/i)).toBeInTheDocument();
      expect(screen.getByText(/aplazado 2 veces/i)).toBeInTheDocument();
    });

    it('no enseña marcador aunque hubiera un resultado guardado', () => {
      // Un aplazado con resultado en la base de datos es un caso raro pero
      // posible; manda el estado, no el dato suelto.
      render(<MatchCard match={makeMatch({ status: 'POSTPONED', result: makeResult() })} />);

      expect(screen.queryByText('+4')).not.toBeInTheDocument();
    });
  });

  it('avisa de que un resultado en disputa no cuenta en la clasificación', () => {
    render(<MatchCard match={makeMatch({ status: 'DISPUTED' })} />);

    expect(screen.getByText('En disputa')).toBeInTheDocument();
    expect(screen.getByText(/no cuenta en la clasificación/i)).toBeInTheDocument();
  });

  it('dice que la puntuación está pendiente cuando el backend no la define', () => {
    const walkover = makeMatch({
      result: makeResult({ points: null, victoryType: 'WALKOVER', resolution: 'WALKOVER' }),
    });
    render(<MatchCard match={walkover} />);

    expect(screen.getByText(/puntuación pendiente de definición/i)).toBeInTheDocument();
    // Y desde luego no se inventa un número.
    expect(screen.queryByText('+3')).not.toBeInTheDocument();
    expect(screen.queryByText('+4')).not.toBeInTheDocument();
  });

  it('marca el directo sin fingir un marcador', () => {
    render(<MatchCard match={makeMatch({ status: 'LIVE', result: null })} />);

    expect(screen.getByText('En vivo')).toBeInTheDocument();
  });

  it('enlaza a la ficha del partido', () => {
    render(<MatchCard match={makeMatch()} />);

    const link = screen.getByRole('link', { name: /ver resultado/i });
    expect(link).toHaveAttribute('href', '/partidos/match-1');
    expect(within(link).getByText(/nimaben contra esteban/i)).toBeInTheDocument();
  });
});
