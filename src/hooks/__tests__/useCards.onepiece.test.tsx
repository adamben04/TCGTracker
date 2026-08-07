import { useEffect } from 'react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../test/utils';
import { GameProvider } from '../../contexts/GameContext';
import { useCards } from '../useCards';

const searchCards = vi.hoisted(() =>
  vi.fn(async () => {
    throw new Error('One Piece catalog timeout');
  })
);

vi.mock('../../services/onepieceApi', () => ({
  onePieceApi: { searchCards },
}));

function Harness() {
  const { isLoading, error, setSearchQuery } = useCards();
  useEffect(() => setSearchQuery('luffy'), [setSearchQuery]);
  return (
    <>
      <span>{isLoading ? 'loading' : 'settled'}</span>
      {error ? <span>{error}</span> : null}
    </>
  );
}

describe('useCards One Piece failures', () => {
  beforeEach(() => {
    localStorage.setItem('tcgtracker_game', 'onepiece');
    searchCards.mockClear();
  });

  it('always clears loading and surfaces an error when catalog search fails', async () => {
    render(
      <GameProvider>
        <Harness />
      </GameProvider>
    );

    expect(await screen.findByText('Failed to load cards. Please try again.')).toBeInTheDocument();
    expect(screen.getByText('settled')).toBeInTheDocument();
  });
});
