/**
 * Interfaz de la evidencia externa.
 *
 * Lo que se prueba aquí es la frontera que la Fase 3 no puede cruzar: que un
 * dato de Clash Royale nunca se presente como resultado oficial, que la
 * confianza no habilite nada, y que una cuenta vinculada no se anuncie como
 * verificada.
 */

import type { BattleCandidate, ExternalCard, MatchEvidence } from '@liga/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CandidateReview } from '../src/components/admin/CandidateReview.tsx';
import { ClashLinks } from '../src/components/admin/ClashLinks.tsx';
import { DeckDisplay } from '../src/components/clash/DeckDisplay.tsx';
import { MatchEvidencePanel } from '../src/components/clash/MatchEvidence.tsx';
import { ClashRoyalePanel } from '../src/components/players/ClashRoyalePanel.tsx';

/* -------------------------------------------------------------------------- */
/* Datos de prueba, con la forma real que devuelve la API                      */
/* -------------------------------------------------------------------------- */

function card(overrides: Partial<ExternalCard> = {}): ExternalCard {
  return {
    cardId: 26000017,
    name: 'Wizard',
    level: 9,
    evolutionLevel: 0,
    starLevel: null,
    iconUrl: 'https://api-assets.clashroyale.com/cards/300/x.png',
    ...overrides,
  };
}

const deck = (): ExternalCard[] =>
  Array.from({ length: 8 }, (_, index) =>
    card({ cardId: 26000000 + index, name: `Carta ${index + 1}` }),
  );

function evidence(overrides: Partial<MatchEvidence> = {}): MatchEvidence {
  return {
    battleId: 'battle-1',
    candidateStatus: 'CONFIRMED',
    confidence: 95,
    battleTime: '2026-09-10T05:02:49.000Z',
    battleType: 'friendly',
    gameModeName: 'Friendly',
    arenaName: 'Hog Mountain',
    deckSelection: 'collection',
    home: { clashTag: '#AAA111', clashName: 'CuentaA', crowns: 1, deck: deck() },
    away: { clashTag: '#BBB222', clashName: 'CuentaB', crowns: 0, deck: deck() },
    ...overrides,
  };
}

function candidate(overrides: Partial<BattleCandidate> = {}): BattleCandidate {
  return {
    id: 'candidate-1',
    status: 'PENDING',
    confidence: 95,
    reasons: ['BOTH_PLAYERS_LINKED', 'FRIENDLY_BATTLE', 'WITHIN_TIME_WINDOW'],
    ambiguities: [],
    detectedAt: '2026-09-10T06:00:00.000Z',
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    match: {
      id: 'match-1',
      roundNumber: 4,
      status: 'SCHEDULED',
      scheduledAt: '2026-09-10T05:00:00.000Z',
      homeName: 'Nimaben',
      awayName: 'Esteban',
    },
    battle: {
      id: 'battle-1',
      battleTime: '2026-09-10T05:02:49.000Z',
      battleType: 'friendly',
      gameModeName: 'Friendly',
      arenaName: 'Hog Mountain',
      deckSelection: 'collection',
      needsReview: false,
      home: { clashTag: '#AAA111', clashName: 'CuentaA', crowns: 1, deck: deck() },
      away: { clashTag: '#BBB222', clashName: 'CuentaB', crowns: 0, deck: deck() },
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ========================================================================== */

describe('DeckDisplay', () => {
  it('muestra las ocho cartas con su nivel', () => {
    render(<DeckDisplay cards={deck()} label="Mazo usado" />);

    expect(screen.getByText('Mazo usado')).toBeInTheDocument();
    expect(screen.getAllByText(/^Carta \d$/)).toHaveLength(8);
    expect(screen.getAllByText('n9')).toHaveLength(8);
  });

  it('marca la evolución cuando la carta la trae', () => {
    render(<DeckDisplay cards={[card({ evolutionLevel: 1 })]} label="Mazo" />);
    expect(screen.getByLabelText('Carta evolucionada')).toBeInTheDocument();
  });

  it('cae en el nombre cuando no hay icono, en vez de un hueco roto', () => {
    render(<DeckDisplay cards={[card({ iconUrl: null, name: 'Golem' })]} label="Mazo" />);
    expect(screen.getByText('GOL')).toBeInTheDocument();
  });

  it('dice que no hay mazo en lugar de dibujar ocho huecos', () => {
    render(<DeckDisplay cards={[]} label="Mazo" />);
    expect(screen.getByText(/no devolvió el mazo/i)).toBeInTheDocument();
  });
});

/* ========================================================================== */

describe('MatchEvidencePanel', () => {
  it('se presenta como evidencia, no como resultado', () => {
    render(<MatchEvidencePanel evidence={evidence()} homeName="Nimaben" awayName="Esteban" />);

    expect(screen.getByText('Datos de Clash Royale')).toBeInTheDocument();
    // La misma etiqueta que en el resto del sitio, con su muestra.
    expect(screen.getByText('Observado')).toBeInTheDocument();
    expect(screen.getByText('1 batalla')).toBeInTheDocument();
    expect(screen.queryByText('Oficial')).not.toBeInTheDocument();
    expect(screen.getByText(/no el resultado oficial/i)).toBeInTheDocument();
    expect(screen.getByText(/el marcador que cuenta para la clasificación/i)).toBeInTheDocument();
  });

  it('usa el nombre de la liga, no el de la cuenta', () => {
    render(<MatchEvidencePanel evidence={evidence()} homeName="Nimaben" awayName="Esteban" />);

    expect(screen.getByText('Nimaben')).toBeInTheDocument();
    // El nombre de Clash Royale aparece como dato secundario, junto al tag.
    expect(screen.getByText(/#AAA111 · CuentaA/)).toBeInTheDocument();
  });

  it('muestra las coronas y los dos mazos', () => {
    render(<MatchEvidencePanel evidence={evidence()} homeName="Nimaben" awayName="Esteban" />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getAllByText('Mazo usado')).toHaveLength(2);
  });

  it('avisa de que las reglas de mazos siguen sin decidirse', () => {
    render(<MatchEvidencePanel evidence={evidence()} homeName="Nimaben" awayName="Esteban" />);
    expect(screen.getByText(/P-04/)).toBeInTheDocument();
  });

  it('explica el lado que no está vinculado en lugar de inventarlo', () => {
    render(
      <MatchEvidencePanel
        evidence={evidence({ away: null })}
        homeName="Nimaben"
        awayName="Esteban"
      />,
    );
    expect(screen.getByText(/no está vinculada a este participante/i)).toBeInTheDocument();
  });
});

/* ========================================================================== */

describe('CandidateReview', () => {
  it('deja claro que nada se confirma solo', () => {
    render(<CandidateReview candidates={[candidate()]} />);
    expect(screen.getByText(/ningún candidato se confirma solo/i)).toBeInTheDocument();
  });

  it('traduce los códigos de motivo a algo que se entiende', () => {
    render(<CandidateReview candidates={[candidate()]} />);

    expect(screen.getByText(/las dos cuentas están vinculadas/i)).toBeInTheDocument();
    expect(screen.getByText(/es una batalla amistosa/i)).toBeInTheDocument();
    // El código crudo no se enseña cuando hay traducción.
    expect(screen.queryByText('BOTH_PLAYERS_LINKED')).not.toBeInTheDocument();
  });

  it('muestra un código desconocido tal cual, en vez de tragárselo', () => {
    render(<CandidateReview candidates={[candidate({ reasons: ['SEÑAL_NUEVA'] })]} />);
    expect(screen.getByText('SEÑAL_NUEVA')).toBeInTheDocument();
  });

  it('explica cada ambigüedad', () => {
    render(
      <CandidateReview
        candidates={[
          candidate({ ambiguities: ['MULTIPLE_MATCHES_POSSIBLE', 'MATCH_HAS_NO_SCHEDULE'] }),
        ]}
      />,
    );

    expect(screen.getByText(/juega ida y vuelta/i)).toBeInTheDocument();
    expect(screen.getByText(/no tiene fecha/i)).toBeInTheDocument();
  });

  it('ofrece confirmar con la misma facilidad al 100 que al 40', () => {
    // La confianza ordena la cola; no habilita ni deshabilita nada.
    const { rerender } = render(<CandidateReview candidates={[candidate({ confidence: 100 })]} />);
    const alto = screen.getByRole('button', { name: /confirmar como resultado/i });
    expect(alto).toBeEnabled();

    rerender(<CandidateReview candidates={[candidate({ confidence: 40 })]} />);
    expect(screen.getByRole('button', { name: /confirmar como resultado/i })).toBeEnabled();
  });

  it('pide confirmación antes de registrar un resultado', async () => {
    const user = userEvent.setup();
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    vi.stubGlobal('fetch', vi.fn());

    render(<CandidateReview candidates={[candidate()]} />);
    await user.click(screen.getByRole('button', { name: /confirmar como resultado/i }));

    expect(confirm).toHaveBeenCalled();
    // Al decir que no, no se llama a nada.
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('confirma contra el puente administrativo del propio origen', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );

    render(<CandidateReview candidates={[candidate()]} />);
    await user.click(screen.getByRole('button', { name: /confirmar como resultado/i }));

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    const [url] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe('/api/admin/clash-royale/candidates/candidate-1/confirm');
  });

  it('rechazar no pide confirmación: no registra nada', async () => {
    const user = userEvent.setup();
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );

    render(<CandidateReview candidates={[candidate()]} />);
    await user.click(screen.getByRole('button', { name: /^rechazar$/i }));

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
  });

  it('la cola arranca en «por revisar», que es donde hace falta decidir', () => {
    render(<CandidateReview candidates={[candidate({ status: 'CONFIRMED' })]} />);
    // Un confirmado no estorba la cola de trabajo.
    expect(screen.getByText(/nada en esta cola/i)).toBeInTheDocument();
  });

  it('un candidato resuelto no ofrece botones', async () => {
    const user = userEvent.setup();
    render(
      <CandidateReview
        candidates={[
          candidate({
            status: 'CONFIRMED',
            resolvedBy: 'Administrador',
            resolvedAt: '2026-09-10T07:00:00.000Z',
            resolutionNote: 'Comprobado.',
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /confirmados/i }));

    expect(screen.queryByRole('button', { name: /confirmar como resultado/i })).toBeNull();
    expect(screen.getByText(/comprobado/i)).toBeInTheDocument();
  });

  it('avisa si la batalla llegó dos veces con datos distintos', () => {
    render(
      <CandidateReview
        candidates={[candidate({ battle: { ...candidate().battle, needsReview: true } })]}
      />,
    );
    expect(screen.getByText(/llegó dos veces con datos distintos/i)).toBeInTheDocument();
  });

  it('separa visualmente el partido de la liga de la batalla observada', () => {
    render(<CandidateReview candidates={[candidate()]} />);

    expect(screen.getByText('Partido de la liga')).toBeInTheDocument();
    expect(screen.getByText('Batalla observada')).toBeInTheDocument();
  });
});

/* ========================================================================== */

describe('ClashLinks', () => {
  const link = {
    playerId: 'p1',
    displayName: 'Nimaben',
    clashTag: '#AAA111',
    clashName: 'CuentaA',
    linkStatus: 'UNVERIFIED' as const,
    linkedAt: '2026-09-10T05:00:00.000Z',
    syncedAt: null,
  };

  it('avisa de que vincular no es verificar', () => {
    render(<ClashLinks links={[link]} />);

    expect(screen.getByText(/vincular no es verificar/i)).toBeInTheDocument();
    expect(screen.getByText(/P-11/)).toBeInTheDocument();
  });

  it('marca la cuenta como no verificada', () => {
    render(<ClashLinks links={[link]} />);
    expect(screen.getByText('No verificada')).toBeInTheDocument();
  });

  it('el nombre de la liga va primero, el tag como dato secundario', () => {
    render(<ClashLinks links={[link]} />);

    expect(screen.getByText('Nimaben')).toBeInTheDocument();
    expect(screen.getByText(/#AAA111 · CuentaA/)).toBeInTheDocument();
  });

  it('explica la consecuencia de no tener cuenta vinculada', () => {
    render(<ClashLinks links={[{ ...link, clashTag: null, linkStatus: null }]} />);
    expect(screen.getByText(/no se podrá importar su historial/i)).toBeInTheDocument();
  });
});

/* ========================================================================== */

describe('ClashRoyalePanel del perfil', () => {
  it('presenta la cuenta como declarada, no comprobada', () => {
    render(<ClashRoyalePanel clashTag="#AAA111" linkStatus="UNVERIFIED" />);

    expect(screen.getByText('#AAA111')).toBeInTheDocument();
    expect(screen.getByText('Sin verificar')).toBeInTheDocument();
    expect(screen.getByText(/declarada, no comprobada/i)).toBeInTheDocument();
    expect(screen.getByText(/P-11/)).toBeInTheDocument();
  });

  it('dice qué se pierde cuando no hay cuenta vinculada', () => {
    render(<ClashRoyalePanel clashTag={null} linkStatus={null} />);

    expect(screen.getByText('Sin vincular')).toBeInTheDocument();
    expect(screen.getByText(/no se puede cruzar su historial/i)).toBeInTheDocument();
  });
});
