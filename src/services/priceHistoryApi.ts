import { env } from '../config/env';
import { resolveHistoryPointPrice } from '../utils/resolveListingPrice';
import { normalizeVariantKey } from '../utils/normalizeVariantKey';

interface PriceHistoryPoint {
  date: string;
  price: number;
  marketPrice?: number;
  subTypeName?: string;
  lowPrice?: number;
  highPrice?: number;
  volume?: number;
  source: string;
  message?: string;
}

interface CardPriceHistoryResponse {
  uniqueIdentifier: string;
  cardDetails: {
    cardName: string;
    setId: string;
    cardNumber?: string;
  };
  priceHistory: PriceHistoryPoint[];
  rollingAverages: unknown[];
}

interface CardMatchResponse {
  matchedProduct?: {
    productId: number;
    productName: string;
    groupName: string;
    uniqueIdentifier?: string;
  };
  priceHistory: PriceHistoryPoint[];
  rollingAverages: unknown[];
  message?: string;
  searchCriteria?: {
    cardName: string;
    setName: string;
    cardNumber?: string;
  };
}

export interface TopMoverEntry {
  productName: string;
  currentPrice: number;
  previousPrice: number;
  changePercent: number;
  uniqueIdentifier?: string | null;
  subTypeName?: string | null;
  groupName?: string | null;
  imageSmall: string | null;
  imageLarge: string | null;
  cardId: string | null;
  setId: string | null;
  setName: string | null;
  cardNumber: string | null;
  rarity: string | null;
  tcgplayerProductId: string | null;
  tcgplayerPrices: string | null;
  productId: number;
}

export interface TopMoversResponse {
  date: string | null;
  days: number;
  gainers: TopMoverEntry[];
  losers: TopMoverEntry[];
}

const TOP_MOVERS_TTL_MS = 10 * 60 * 1000; // match backend TTL

type TopMoversCacheEntry = {
  expiresAt: number;
  data: TopMoversResponse;
};

/**
 * Fetches top movers (biggest gainers/losers) over a given period
 */
export class PriceHistoryApi {
  private static baseUrl = `${env.apiUrl}/api/prices`;
  public static dataMode: 'live' | 'static' = 'live'; // Use live mode by default (backend server)
  private static staticMappings: CardIdentifier[] | null = null;
  private static latestPrices: { [uniqueIdentifier: string]: PricePoint } | null = null;
  private static topMoversMemory = new Map<string, TopMoversCacheEntry>();

  private static topMoversCacheKey(days: number, limit: number): string {
    return `${days}:${limit}`;
  }

  private static topMoversStorageKey(days: number, limit: number): string {
    return `tcgtracker:top-movers:${days}:${limit}`;
  }

  private static readTopMoversStorage(days: number, limit: number): TopMoversCacheEntry | null {
    try {
      const raw = localStorage.getItem(this.topMoversStorageKey(days, limit));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as TopMoversCacheEntry;
      if (!parsed?.data || typeof parsed.expiresAt !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private static writeTopMoversCache(days: number, limit: number, data: TopMoversResponse): void {
    const entry: TopMoversCacheEntry = {
      expiresAt: Date.now() + TOP_MOVERS_TTL_MS,
      data,
    };
    const key = this.topMoversCacheKey(days, limit);
    this.topMoversMemory.set(key, entry);
    try {
      localStorage.setItem(this.topMoversStorageKey(days, limit), JSON.stringify(entry));
    } catch {
      // Quota / private mode — memory cache still works for the session
    }
  }

  /** Instant cache read for stale-while-revalidate UI (may be expired). */
  static peekTopMovers(days: number = 7, limit: number = 20): TopMoversResponse | null {
    const key = this.topMoversCacheKey(days, limit);
    const mem = this.topMoversMemory.get(key);
    if (mem?.data) return mem.data;
    const stored = this.readTopMoversStorage(days, limit);
    if (stored?.data) {
      this.topMoversMemory.set(key, stored);
      return stored.data;
    }
    return null;
  }

  static async getTopMovers(
    days: number = 7,
    limit: number = 20,
    options: { force?: boolean } = {}
  ): Promise<TopMoversResponse> {
    const key = this.topMoversCacheKey(days, limit);
    const mem = this.topMoversMemory.get(key);
    if (
      !options.force &&
      mem &&
      mem.expiresAt > Date.now() &&
      (mem.data.gainers.length > 0 || mem.data.losers.length > 0)
    ) {
      return mem.data;
    }

    const stored = this.readTopMoversStorage(days, limit);
    if (
      !options.force &&
      stored &&
      stored.expiresAt > Date.now() &&
      (stored.data.gainers.length > 0 || stored.data.losers.length > 0)
    ) {
      this.topMoversMemory.set(key, stored);
      return stored.data;
    }

    try {
      const response = await fetch(`${this.baseUrl}/top-movers?days=${days}&limit=${limit}`);
      if (!response.ok) {
        return mem?.data ?? stored?.data ?? { date: null, days, gainers: [], losers: [] };
      }
      const data = (await response.json()) as TopMoversResponse;
      if (data.gainers.length > 0 || data.losers.length > 0) {
        this.writeTopMoversCache(days, limit, data);
      }
      return data;
    } catch {
      return mem?.data ?? stored?.data ?? { date: null, days, gainers: [], losers: [] };
    }
  }

  /**
   * Gets price history for a specific card using its details (LIVE MODE ONLY)
   */
  static async getCardPriceHistory(
    cardName: string,
    setId: string,
    cardNumber?: string
  ): Promise<CardPriceHistoryResponse | null> {
    try {
      const params = new URLSearchParams({
        cardName,
        setId,
      });

      if (cardNumber) {
        params.append('cardNumber', cardNumber);
      }

      const response = await fetch(`${this.baseUrl}/card?${params}`);

      if (!response.ok) {
        // Silently return null for 404s (expected when card not in database)
        return null;
      }

      return await response.json();
    } catch (error) {
      // Only log actual errors in dev mode
      if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_API) {
        console.error('Error fetching card price history:', error);
      }
      return null;
    }
  }

  /**
   * Matches a card and gets its price history (LIVE MODE ONLY)
   */
  static async matchCardAndGetHistory(
    cardName: string,
    setName: string,
    cardNumber?: string,
    setId?: string
  ): Promise<CardMatchResponse | null> {
    try {
      const params = new URLSearchParams({
        cardName,
        setName,
      });

      if (cardNumber) {
        params.append('cardNumber', cardNumber);
      }

      if (setId) {
        params.append('setId', setId);
      }

      const response = await fetch(`${this.baseUrl}/match?${params}`);

      if (!response.ok) {
        // Silently return null (expected when card not in database)
        return null;
      }

      return await response.json();
    } catch (error) {
      // Only log in debug mode
      if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_API) {
        console.error('Error matching card:', error);
      }
      return null;
    }
  }

  /**
   * Deduplicate to one price per calendar day. Does NOT gap-fill — that's for chart display only.
   */
  static formatPriceHistory(
    priceHistory: PriceHistoryPoint[],
    preferredVariant?: string
  ): Array<{ date: string; price: number }> {
    const preferred = normalizeVariantKey(preferredVariant);
    const byDate = new Map<string, { price: number; score: number }>();

    const scoreVariant = (subTypeName?: string): number => {
      const rowVariant = normalizeVariantKey(subTypeName);
      if (rowVariant === preferred) return 3;
      if (preferred !== 'normal' && rowVariant.includes(preferred)) return 2;
      if (preferred === 'normal' && (rowVariant === 'normal' || rowVariant === 'unlimited'))
        return 2;
      return rowVariant === 'normal' ? 1 : 0;
    };

    priceHistory
      .filter((point) => resolveHistoryPointPrice(point) > 0)
      .forEach((point) => {
        const pointDate = point.date.includes('T') ? point.date.split('T')[0] : point.date;
        const normalizedPrice = resolveHistoryPointPrice(point);
        const score = scoreVariant(point.subTypeName);
        const existing = byDate.get(pointDate);
        if (!existing || score > existing.score) {
          byDate.set(pointDate, { price: normalizedPrice, score });
        }
      });

    const deduped = Array.from(byDate.entries())
      .filter(([, { score }]) => score > 0)
      .map(([date, { price }]) => ({ date, price }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // If variant filter was too strict, keep best available row per day.
    if (
      deduped.length === 0 ||
      deduped.length <
        Math.min(10, priceHistory.filter((p) => resolveHistoryPointPrice(p) > 0).length * 0.25)
    ) {
      byDate.clear();
      priceHistory
        .filter((point) => resolveHistoryPointPrice(point) > 0)
        .forEach((point) => {
          const pointDate = point.date.includes('T') ? point.date.split('T')[0] : point.date;
          const normalizedPrice = resolveHistoryPointPrice(point);
          const score = scoreVariant(point.subTypeName);
          const existing = byDate.get(pointDate);
          if (!existing || score > existing.score) {
            byDate.set(pointDate, { price: normalizedPrice, score });
          }
        });
      return Array.from(byDate.entries())
        .map(([date, { price }]) => ({ date, price }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    return deduped;
  }

  /**
   * Gets price history for a Pokemon card from the Pokemon TCG API format
   */
  static async getPokemonCardPriceHistory(card: {
    id: string;
    name: string;
    set: { id: string; name: string };
    number?: string;
    rarity?: string;
    productId?: string;
    variant?: string;
  }): Promise<Array<{ date: string; price: number }>> {
    const cardNumber = card.number || this.extractCardNumber(card.id);
    return this.getPriceHistory({
      id: card.id,
      name: card.name,
      set: card.set,
      number: cardNumber,
      rarity: card.rarity,
      productId: card.productId,
      variant: card.variant,
    });
  }

  static async getPriceHistory(card: {
    id?: string;
    name: string;
    set: { id: string; name: string };
    number?: string;
    rarity?: string;
    productId?: string;
    variant?: string;
  }): Promise<Array<{ date: string; price: number }>> {
    const variantKey = normalizeVariantKey(card.variant);

    if (PriceHistoryApi.dataMode === 'static') {
      const matchedCard = await this.findCardStatically(card);
      if (!matchedCard || !matchedCard.uniqueIdentifier) {
        return [];
      }
      try {
        const response = await fetch(`/data/prices/${matchedCard.uniqueIdentifier}.json`);
        if (!response.ok) {
          // Silently return empty array - many cards don't have price files
          return [];
        }

        // Check if response is actually JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          // Silently fail - price file doesn't exist or is not valid JSON
          return [];
        }

        const data = await response.json();
        const normalizedData = (data || []).filter((point: PriceHistoryPoint) => {
          const pointVariant = normalizeVariantKey(point.subTypeName);
          return variantKey === 'normal' ? true : pointVariant === variantKey;
        });
        return this.formatPriceHistory(normalizedData, card.variant);
      } catch {
        // Silently fail - price file doesn't exist or is invalid
        return [];
      }
    }

    try {
      const fetchHistory = async (variantToUse?: string) => {
        const params = new URLSearchParams({
          cardId: card.id,
          cardName: card.name,
          setName: card.set.name,
          setId: card.set.id,
        });
        if (variantToUse) {
          params.append('variant', variantToUse);
        }
        if (card.number) {
          params.append('cardNumber', card.number);
        }
        if (card.rarity) {
          params.append('rarity', card.rarity);
        }
        if (card.productId) {
          params.append('productId', card.productId);
        }
        const response = await fetch(`${this.baseUrl}/history?${params}`);
        if (!response.ok) {
          return [];
        }
        const data = await response.json();
        const raw = data?.priceHistory ?? [];
        const formatted = this.formatPriceHistory(raw, variantToUse);
        // If variant-specific result is sparse, retry using all subtype rows from the same product.
        if (formatted.length < 14 && raw.length > formatted.length) {
          const fallback = this.formatPriceHistory(raw, undefined);
          if (fallback.length > formatted.length) {
            return fallback;
          }
        }
        return formatted;
      };

      return await fetchHistory(variantKey);
    } catch (error) {
      if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_API) {
        console.warn('History endpoint failed', error);
      }
    }

    return [];
  }

  /** Period comparison for a TCGPlayer product (outer vs inner window). */
  static async compareProduct(
    productId: string | number,
    outerDays = 90,
    innerDays = 7
  ): Promise<{
    data: Array<{
      period: string;
      avgPrice: number;
      minPrice: number;
      maxPrice: number;
      dataPoints: number;
    }>;
    analysis: { priceChange: number | null; trend: string };
  } | null> {
    try {
      const url = new URL(`${this.baseUrl}/compare/${productId}`);
      url.searchParams.set('outer', String(outerDays));
      url.searchParams.set('inner', String(innerDays));
      const res = await fetch(url.toString());
      if (!res.ok) return null;
      return (await res.json()) as {
        data: Array<{
          period: string;
          avgPrice: number;
          minPrice: number;
          maxPrice: number;
          dataPoints: number;
        }>;
        analysis: { priceChange: number | null; trend: string };
      };
    } catch {
      return null;
    }
  }

  /**
   * Extracts card number from Pokemon TCG API card ID
   */
  private static extractCardNumber(cardId: string): string {
    const parts = cardId.split('-');
    const lastPart = parts.length > 1 ? parts[parts.length - 1] : '';

    // Handle various formats like "6", "006", "TG01", etc.
    // Pad single digits with leading zeros to match common formats
    if (lastPart && /^\d+$/.test(lastPart)) {
      return lastPart.padStart(3, '0'); // Convert "6" to "006"
    }

    return lastPart;
  }
}
