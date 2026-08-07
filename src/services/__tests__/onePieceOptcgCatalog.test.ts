import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearOptcgCatalogCache, fetchFullOptcgCatalog } from '../onePieceOptcgCatalog';

const rawCard = {
  inventory_price: 2,
  market_price: 3,
  card_name: 'Monkey.D.Luffy',
  set_name: 'Romance Dawn',
  card_text: '',
  set_id: 'OP-01',
  rarity: 'Leader',
  card_set_id: 'OP01-003',
  card_color: 'Red',
  card_type: 'Leader',
  life: '5',
  card_cost: null,
  card_power: '5000',
  sub_types: 'Straw Hat Crew',
  counter_amount: null,
  attribute: 'Strike',
  date_scraped: '2026-01-01',
  card_image_id: 'op01-003',
  card_image: 'https://example.com/luffy.jpg',
};

describe('browser One Piece catalog fallback', () => {
  afterEach(() => {
    clearOptcgCatalogCache();
    vi.useRealTimers();
  });

  it('retries a partial catalog after a short cache window', async () => {
    vi.useFakeTimers();
    const fetchJson = vi.fn(async (path: string) => {
      if (path === '/allSetCards/') return [rawCard];
      throw new Error('source unavailable');
    }) as unknown as <T>(path: string) => Promise<T>;

    const cards = await fetchFullOptcgCatalog(fetchJson);
    expect(cards).toHaveLength(1);
    expect(fetchJson).toHaveBeenCalledTimes(4);

    await fetchFullOptcgCatalog(fetchJson);
    expect(fetchJson).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(90_001);
    await fetchFullOptcgCatalog(fetchJson);
    expect(fetchJson).toHaveBeenCalledTimes(8);
  });
});
