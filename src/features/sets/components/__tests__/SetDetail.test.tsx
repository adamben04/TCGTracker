import { MemoryRouter } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../../../test/utils';
import { CardModalProvider } from '../../../../contexts/CardModalContext';
import { GameProvider } from '../../../../contexts/GameContext';
import { SetDetail } from '../SetDetail';

const mocks = vi.hoisted(() => ({
  getSetCards: vi.fn(async () => [
    {
      id: 'OP-01::OP01-003::Luffy',
      name: 'Monkey.D.Luffy',
      images: {
        small: 'https://img.example/luffy.jpg',
        large: 'https://img.example/luffy.jpg',
      },
      set: { id: 'OP-01', name: 'Romance Dawn' },
      number: 'OP01-003',
      rarity: 'L',
      marketPrice: 19.15,
    },
  ]),
}));

vi.mock('../../../../services/onepieceApi', () => ({
  onePieceApi: {
    getSetCards: mocks.getSetCards,
    getPriceHistory: vi.fn(async () => []),
    getCardById: vi.fn(async () => null),
    extractCardPrice: vi.fn(() => 19.15),
  },
}));

describe('SetDetail One Piece routing', () => {
  beforeEach(() => {
    localStorage.setItem('tcgtracker_game', 'pokemon');
    mocks.getSetCards.mockClear();
  });

  it('recognizes a direct One Piece set link even when Pokémon was last selected', async () => {
    render(
      <MemoryRouter>
        <GameProvider>
          <CardModalProvider>
            <SetDetail setId="OP-01" onBack={() => undefined} />
          </CardModalProvider>
        </GameProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('Monkey.D.Luffy')).toBeInTheDocument();
    expect(screen.getByText('One Piece TCG')).toBeInTheDocument();
    expect(mocks.getSetCards).toHaveBeenCalledWith('OP-01');
  });
});
