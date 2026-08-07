import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnePieceCard, OnePieceSet } from '../../types/onepiece';

const mocks = vi.hoisted(() => {
  const set: OnePieceSet = { id: 'OP-01', name: 'Romance Dawn' };
  const cards: OnePieceCard[] = [0.5, 2, 5, 10, 50].map((marketPrice, index) => ({
    id: `op-card-${index}`,
    name: `One Piece Card ${index}`,
    images: {
      small: `https://img.example/${index}.jpg`,
      large: `https://img.example/${index}.jpg`,
    },
    set: { id: set.id, name: set.name },
    number: `OP01-00${index}`,
    rarity: 'R',
    marketPrice,
  }));

  return {
    getSets: vi.fn(async () => [set]),
    getSetCards: vi.fn(async () => cards),
    getPackPool: vi.fn(async () => cards),
    extractCardPrice: vi.fn((card: OnePieceCard) => card.marketPrice ?? 0),
  };
});

vi.mock('../onepieceApi', () => ({
  onePieceApi: mocks,
  onepieceApi: mocks,
}));

import { tieredPackService } from '../tieredPackService';

describe('tieredPackService One Piece packs', () => {
  beforeEach(() => {
    localStorage.clear();
    tieredPackService.clearOnePieceCache();
    tieredPackService.clearHistory('onepiece');
    vi.clearAllMocks();
  });

  it('opens a One Piece pack through the explicitly imported API client', async () => {
    const pack = tieredPackService.getOnePiecePacks()[0];

    const pull = await tieredPackService.openPack(pack, false, 'onepiece');

    expect(mocks.getPackPool).toHaveBeenCalledOnce();
    expect(pull.cards).toHaveLength(1);
    expect(pull.cards[0].id).toMatch(/^op-card-/);
    expect(pull.totalValue).toBeGreaterThan(0);
  });
});
