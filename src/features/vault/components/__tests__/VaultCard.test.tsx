import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { VaultCard } from '../VaultCard';
import type { VaultCard as VaultCardType } from '../../../../types/pokemon';

const mockCard = {
  id: 'sv7-1',
  name: 'Charizard ex',
  set: { id: 'sv7', name: 'Obsidian Flames' },
  number: '223',
  rarity: 'Ultra Rare',
  images: { small: 'https://example.com/small.png', large: 'https://example.com/large.png' },
  marketPrice: 50,
  tcgplayer: { prices: { holofoil: { market: 50 } } },
};

const mockVaultCard = {
  id: 'vault-1',
  card: mockCard,
  quantity: 2,
  purchasePrice: 45,
  purchaseDate: '2025-01-01',
  condition: 'near-mint',
  notes: '',
} as unknown as VaultCardType;

const mockProps = {
  vaultCard: mockVaultCard,
  onRemove: vi.fn(),
  onUpdate: vi.fn(),
};

describe('VaultCard', () => {
  it('renders card name', () => {
    render(<VaultCard {...mockProps} />);
    expect(screen.getByText('Charizard ex')).toBeTruthy();
  });

  it('shows quantity', () => {
    render(<VaultCard {...mockProps} />);
    expect(screen.getByText('2x owned')).toBeTruthy();
  });

  it('handles missing images gracefully', () => {
    const noImageCard = { ...mockCard, images: undefined };
    render(<VaultCard {...mockProps} vaultCard={{ ...mockVaultCard, card: noImageCard }} />);
    expect(screen.getByText('No image')).toBeTruthy();
  });
});
