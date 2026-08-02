import { env } from '../config/env';

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
  rollingAverages: any[];
}

interface CardMatchResponse {
  matchedProduct?: {
    productId: number;
    productName: string;
    groupName: string;
    uniqueIdentifier?: string;
  };
  priceHistory: PriceHistoryPoint[];
  rollingAverages: any[];
  message?: string;
  searchCriteria?: {
    cardName: string;
    setName: string;
    cardNumber?: string;
  };
}

export class PriceHistoryApi {
  private static baseUrl = `${env.apiUrl}/api/prices`;
  private static normalizeVariantKey(value?: string): string {
    if (!value) return 'normal';
    const compact = value.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!compact) return 'normal';
    return compact;
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
        setId
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
        setName
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
    const preferred = this.normalizeVariantKey(preferredVariant);
    const byDate = new Map<string, { price: number; score: number }>();

    const scoreVariant = (subTypeName?: string): number => {
      const rowVariant = this.normalizeVariantKey(subTypeName);
      if (rowVariant === preferred) return 3;
      if (preferred !== 'normal' && rowVariant.includes(preferred)) return 2;
      if (preferred === 'normal' && (rowVariant === 'normal' || rowVariant === 'unlimited')) return 2;
      return rowVariant === 'normal' ? 1 : 0;
    };

    priceHistory
      .filter((point) => (point.marketPrice || point.price) > 0)
      .forEach((point) => {
        const pointDate = point.date.includes('T') ? point.date.split('T')[0] : point.date;
        const normalizedPrice = point.marketPrice || point.price;
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
      deduped.length < Math.min(10, priceHistory.filter((p) => (p.marketPrice || p.price) > 0).length * 0.25)
    ) {
      byDate.clear();
      priceHistory
        .filter((point) => (point.marketPrice || point.price) > 0)
        .forEach((point) => {
          const pointDate = point.date.includes('T') ? point.date.split('T')[0] : point.date;
          const normalizedPrice = point.marketPrice || point.price;
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
    const variantKey = this.normalizeVariantKey(card.variant);

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
        console.log('History endpoint failed', error);
      }
    }

    return [];
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