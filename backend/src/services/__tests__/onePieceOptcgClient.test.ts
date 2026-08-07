import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  clearOptcgCatalogCache,
  fetchOptcgJson,
  getAllOptcgCards,
} from '../providers/onePieceOptcgClient';

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

describe('One Piece OPTCG client resilience', () => {
  afterEach(() => {
    clearOptcgCatalogCache();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('returns a partial catalog when optional OPTCG bulk sources fail', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/allSetCards/')) {
        return {
          ok: true,
          json: async () => [rawCard],
        } as Response;
      }
      throw new Error('source unavailable');
    });

    const cards = await getAllOptcgCards(true);
    expect(cards).toEqual([rawCard]);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await getAllOptcgCards();
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await jest.advanceTimersByTimeAsync(90_001);
    await getAllOptcgCards();
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it('aborts an upstream request at the catalog deadline', async () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    const request = fetchOptcgJson('/allSetCards/');
    const rejection = expect(request).rejects.toThrow('aborted');
    await jest.advanceTimersByTimeAsync(5_001);
    await rejection;
  });
});
