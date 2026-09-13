/**
 * Los dos bloques nuevos de la ficha de jugador.
 *
 * En ambos, lo que se prueba es lo mismo: que la interfaz no ascienda un dato
 * de categoría. Un partido que todavía no cuenta no puede aparecer como 0-0, y
 * el tag de alguien que no juega la liga no puede aparecer entero.
 */

import type { ObservedDeck, PlayerMatchRow } from '@liga/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ObservedDecks } from '../src/components/clash/ObservedDecks.tsx';
import { PlayerHistory } from '../src/components/statistics/PlayerHistory.tsx';

function row(overrides: Partial<PlayerMatchRow> = {}): PlayerMatchRow {
  return {
    matchId: 'match-1',
    roundNumber: 3,
    scheduledAt: '2026-10-08T22:00:00.000Z',
    opponentName: 'Esteban',
    opponentSlug: 'esteban',
    isHome: true,
    status: 'COMPLETED',
    crownsFor: 3,
    crownsAgainst: 1,
    points: 3,
    outcome: 'W',
    ...overrides,
  };
}

function deck(overrides: Partial<ObservedDeck> = {}): ObservedDeck {
  return {
    battleId: 'battle-1',
    battleTime: '2026-10-08T22:40:00.000Z',
    battleType: 'friendly',
    opponent: {
      isParticipant: true,
      displayName: 'Esteban',
      slug: 'esteban',
      tag: '#2P0LYQ0',
    },
    cards: Array.from({ length: 8 }, (_, index) => ({
      cardId: 26_000_000 + index,
      name: `Carta ${index + 1}`,
      level: 14,
      evolutionLevel: index === 0 ? 1 : 0,
      iconUrl: null,
    })),
    averageElixir: 3.6,
    ...overrides,
  };
}

describe('PlayerHistory', () => {
  it('muestra el marcador y los puntos de un partido jugado', () => {
    render(<PlayerHistory history={[row()]} playerName="Nimaben" />);

    expect(screen.getByText('3–1')).toBeInTheDocument();
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Esteban' })).toHaveAttribute(
      'href',
      '/jugadores/esteban',
    );
  });

  for (const status of ['POSTPONED', 'DISPUTED', 'SCHEDULED', 'CANCELLED'] as const) {
    it(`un partido ${status} no aparece con marcador ni como derrota`, () => {
      render(
        <PlayerHistory
          history={[
            row({ status, crownsFor: null, crownsAgainst: null, points: null, outcome: null }),
          ]}
          playerName="Nimaben"
        />,
      );

      const table = screen.getByRole('table');
      // Ni marcador inventado ni un cero que se lea como «lo intentó y falló».
      expect(within(table).queryByText('0–0')).not.toBeInTheDocument();
      expect(within(table).queryByText('Derrota')).not.toBeInTheDocument();
      expect(within(table).getAllByText('—').length).toBeGreaterThanOrEqual(2);
    });
  }

  it('distingue lo jugado de lo que todavía no cuenta', async () => {
    const user = userEvent.setup();
    render(
      <PlayerHistory
        history={[
          row(),
          row({
            matchId: 'match-2',
            roundNumber: 4,
            status: 'POSTPONED',
            crownsFor: null,
            crownsAgainst: null,
            points: null,
            outcome: null,
          }),
        ]}
        playerName="Nimaben"
      />,
    );

    expect(screen.getAllByRole('row')).toHaveLength(3); // cabecera + 2

    await user.click(screen.getByRole('button', { name: /jugados/i }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('3–1')).toBeInTheDocument();
  });

  it('explica por qué hay filas sin marcador', () => {
    render(
      <PlayerHistory
        history={[
          row({
            status: 'POSTPONED',
            crownsFor: null,
            crownsAgainst: null,
            points: null,
            outcome: null,
          }),
        ]}
        playerName="Nimaben"
      />,
    );

    expect(screen.getByText(/cuentan como derrota ni suman puntos/i)).toBeInTheDocument();
  });
});

describe('ObservedDecks', () => {
  it('nombra al rival cuando juega la liga', () => {
    render(<ObservedDecks decks={[deck()]} sampleSize={1} playerName="Nimaben" />);

    expect(screen.getByText(/contra/)).toHaveTextContent('Esteban');
  });

  it('no publica entero el tag de quien no juega la liga', () => {
    render(
      <ObservedDecks
        decks={[
          deck({
            opponent: {
              isParticipant: false,
              displayName: null,
              slug: null,
              tag: '#••••YQ0',
            },
          }),
        ]}
        sampleSize={1}
        playerName="Nimaben"
      />,
    );

    expect(screen.getByText('#••••YQ0')).toBeInTheDocument();
    expect(screen.queryByText('#2P0LYQ0')).not.toBeInTheDocument();
  });

  it('dice sobre cuántos mazos se calcula todo', () => {
    render(<ObservedDecks decks={[deck()]} sampleSize={1} playerName="Nimaben" />);

    expect(screen.getByText('Mazos observados')).toBeInTheDocument();
    expect(screen.getByText('Cartas más repetidas')).toBeInTheDocument();
    // Cada carta lleva su recuento sobre la muestra, no un porcentaje suelto.
    expect(screen.getAllByText('1/1').length).toBe(8);
  });

  it('no inventa una media de elixir cuando no la hay', () => {
    render(
      <ObservedDecks decks={[deck({ averageElixir: null })]} sampleSize={1} playerName="Nimaben" />,
    );

    expect(screen.getByText('Elixir medio').closest('div')).toHaveTextContent('—');
  });

  it('sin batallas confirmadas lo dice, en vez de enseñar un mazo vacío', () => {
    render(<ObservedDecks decks={[]} sampleSize={0} playerName="Nimaben" />);

    expect(screen.getByText('Sin mazos observados')).toBeInTheDocument();
    expect(screen.getByText(/no significa que no haya jugado/i)).toBeInTheDocument();
  });
});
