import { describe, it, expect, beforeEach } from 'vitest';
import { priceTrackingService } from '../priceTrackingService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock axios for API calls
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() })),
    defaults: { withCredentials: true },
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

describe('PriceTrackingService', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('tracked cards (localStorage)', () => {
    it('returns empty array when no cards tracked', async () => {
      const cards = await priceTrackingService.getTrackedCards();
      expect(cards).toEqual([]);
    });

    it('tracks a card', async () => {
      const mockCard = {
        id: 'sv7-1',
        name: 'Charizard ex',
        set: { id: 'sv7', name: 'Obsidian Flames' },
        number: '223',
        marketPrice: 50,
      } as any;

      await priceTrackingService.trackCard(mockCard);
      const cards = await priceTrackingService.getTrackedCards();
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe('sv7-1');
      expect(cards[0].card.name).toBe('Charizard ex');
    });

    it('does not track duplicate cards', async () => {
      const mockCard = {
        id: 'sv7-1',
        name: 'Charizard ex',
        set: { id: 'sv7', name: 'Obsidian Flames' },
      } as any;

      await priceTrackingService.trackCard(mockCard);
      await priceTrackingService.trackCard(mockCard);
      const cards = await priceTrackingService.getTrackedCards();
      expect(cards).toHaveLength(1);
    });

    it('untracks a card', async () => {
      const mockCard = {
        id: 'sv7-1',
        name: 'Charizard ex',
        set: { id: 'sv7', name: 'Obsidian Flames' },
      } as any;

      await priceTrackingService.trackCard(mockCard);
      await priceTrackingService.untrackCard('sv7-1');
      const cards = await priceTrackingService.getTrackedCards();
      expect(cards).toHaveLength(0);
    });

    it('checks if card is tracked', async () => {
      const mockCard = {
        id: 'sv7-1',
        name: 'Charizard ex',
        set: { id: 'sv7', name: 'Obsidian Flames' },
      } as any;

      expect(priceTrackingService.isTracked('sv7-1')).toBe(false);
      await priceTrackingService.trackCard(mockCard);
      expect(priceTrackingService.isTracked('sv7-1')).toBe(true);
    });

    it('updates card price', async () => {
      const mockCard = {
        id: 'sv7-1',
        name: 'Charizard ex',
        set: { id: 'sv7', name: 'Obsidian Flames' },
        marketPrice: 50,
      } as any;

      await priceTrackingService.trackCard(mockCard);
      priceTrackingService.updateCardPrice('sv7-1', 60);
      const cards = await priceTrackingService.getTrackedCards();
      expect(cards[0].priceHistory).toHaveLength(2);
      expect(cards[0].priceHistory[1].price).toBe(60);
    });
  });

  describe('stats', () => {
    it('returns zero stats when no cards tracked', () => {
      const stats = priceTrackingService.getStats();
      expect(stats.totalTracked).toBe(0);
      expect(stats.totalGainers).toBe(0);
      expect(stats.totalLosers).toBe(0);
    });
  });
});
