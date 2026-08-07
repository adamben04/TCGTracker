import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { clearTcgDexPackPoolCache, getTcgDexPackPool } from '../providers/tcgdexPackPoolProvider';

describe('TCGdex pack pool fallback', () => {
  afterEach(() => {
    clearTcgDexPackPoolCache();
    jest.restoreAllMocks();
  });

  it('maps live card pricing and coalesces repeated callers', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/cards')) {
        return {
          ok: true,
          json: async () => [{ id: 'base1-4', localId: '4', name: 'Charizard', image: 'image' }],
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          id: 'base1-4',
          localId: '4',
          name: 'Charizard',
          image: 'https://assets.tcgdex.net/en/base/base1/4',
          rarity: 'Rare',
          set: { id: 'base1', name: 'Base Set' },
          pricing: { tcgplayer: { holofoil: { marketPrice: 818.65 } } },
        }),
      } as Response;
    });

    const [first, second] = await Promise.all([getTcgDexPackPool(), getTcgDexPackPool()]);

    expect(first[0]).toEqual(
      expect.objectContaining({
        id: 'base1-4',
        name: 'Charizard',
        marketPrice: 818.65,
      })
    );
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
