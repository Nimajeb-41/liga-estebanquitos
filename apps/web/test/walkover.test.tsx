/**
 * La incomparecencia en la interfaz.
 *
 * Un walkover es el resultado más fácil de dibujar mal: su marcador guardado es
 * 0–0, y un 0–0 en pantalla se lee como un empate a cero que se jugó. Estos
 * tests fijan que ninguna de las tres superficies —tarjeta, Match Center y
 * overlay— lo enseñe así.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MatchCard } from '../src/components/matches/MatchCard.tsx';
import { MatchScore } from '../src/components/matches/MatchScore.tsx';
import { MatchStateNotice } from '../src/components/matches/MatchStateNotice.tsx';
import { Overlay, type OverlayOptions } from '../src/components/stream/Overlay.tsx';
import { makeMatch, makeMatchDetail, makeResult } from './helpers.ts';

/** Gana el local; el visitante no se presentó. Sin coronas para nadie. */
const walkover = makeResult({
  homeCrowns: 0,
  awayCrowns: 0,
  resolution: 'WALKOVER',
  outcome: 'HOME_WIN',
  victoryType: 'WALKOVER',
  winnerId: 'player-home',
  loserId: 'player-away',
  points: { home: 3, away: 0 },
  crownDiff: { home: 0, away: 0 },
});

const OPTIONS: OverlayOptions = { variant: 'full', scale: 1, minimal: false };

describe('MatchScore', () => {
  it('no dibuja un 0–0: dice quién ganó y por qué', () => {
    render(<MatchScore result={walkover} homeName="Nimaben" awayName="Esteban" />);

    expect(screen.getByText('WALKOVER')).toBeInTheDocument();
    expect(screen.getByText(/gana nimaben/i)).toBeInTheDocument();
    expect(screen.getByText(/esteban no se presentó/i)).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('lo anuncia igual a un lector de pantalla', () => {
    render(<MatchScore result={walkover} homeName="Nimaben" awayName="Esteban" />);
    expect(screen.getByLabelText(/incomparecencia: gana nimaben/i)).toBeInTheDocument();
  });

  it('un partido jugado sigue enseñando su marcador', () => {
    render(
      <MatchScore
        result={makeResult({ homeCrowns: 3, awayCrowns: 1 })}
        homeName="Nimaben"
        awayName="Esteban"
      />,
    );

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('WALKOVER')).not.toBeInTheDocument();
  });
});

describe('MatchCard', () => {
  it('no enseña coronas de una incomparecencia', () => {
    render(<MatchCard match={makeMatch({ status: 'COMPLETED', result: walkover })} />);

    expect(screen.getByText(/walkover/i)).toBeInTheDocument();
    expect(screen.getByText(/por incomparecencia/i)).toBeInTheDocument();
    // Los dos lados van con guion: no hay marcador que enseñar.
    expect(screen.getAllByText('–').length).toBe(2);
  });
});

describe('MatchStateNotice', () => {
  it('dice que no hubo batalla, no «resultado registrado»', () => {
    render(<MatchStateNotice match={makeMatchDetail({ status: 'COMPLETED', result: walkover })} />);

    expect(screen.getByText('Walkover · incomparecencia')).toBeInTheDocument();
    expect(screen.getByText(/no hubo batalla/i)).toBeInTheDocument();
    expect(screen.queryByText('Resultado registrado')).not.toBeInTheDocument();
    // Pero sí cuenta en la clasificación: es un partido jugado.
    expect(screen.getByText('Cuenta en la clasificación')).toBeInTheDocument();
  });
});

describe('Overlay', () => {
  it('no pinta un 0–0 sobre el vídeo', () => {
    render(
      <Overlay match={makeMatch({ status: 'COMPLETED', result: walkover })} options={OPTIONS} />,
    );

    expect(screen.getByText('W. O.')).toBeInTheDocument();
    expect(screen.getByText('Walkover')).toBeInTheDocument();
    expect(screen.queryByText('Final')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
