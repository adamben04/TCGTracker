import axios, { AxiosError } from 'axios';
import { PSAData, PricePoint, RealData } from '../types/pokemon';
import { buildApiUrl } from '../config/env';

class RealDataService {
  private backendApi = buildApiUrl('/api');
  /** Same-origin proxy path — works in dev (Vite) and prod (nginx). */
  private readonly pokemonPriceBase = '/api/pokemonprice';

  async fetchRealData(cardName: string, setName: string, cardNumber: string, cardId?: string): Promise<RealData | null> {
    try {
      // First, try to get historical price data from our backend
      const backendPriceHistory = await this.fetchBackendPriceHistory(cardName, setName, cardNumber, cardId);
      
      // Try to get PSA data from pokemonprice.com (if available)
      let psaData: PSAData | null = null;
      let scrapedPriceHistory: PricePoint[] = [];
      try {
        const searchHtml = await this.searchForCard(cardName, setName);
        if (searchHtml) {
          const cardPageLink = this.findCardPageLink(searchHtml, cardName, setName, cardNumber);
          if (cardPageLink) {
            const cardPageHtml = await this.getCardPage(cardPageLink);
            if (cardPageHtml) {
              psaData = this.parseCardPage(cardPageHtml);
              scrapedPriceHistory = await this.fetchRealPriceHistory(cardPageHtml);
            }
          }
        }
      } catch (error) {
    
      }

      const priceHistory =
        backendPriceHistory.length > 0 ? backendPriceHistory : scrapedPriceHistory;

      return {
        psaData,
        priceHistory,
      };

    } catch (error) {
      console.error(`Error processing ${cardName}:`, (error as Error).message);
      return null;
    }
  }

  private async fetchBackendPriceHistory(cardName: string, setName: string, cardNumber: string, cardId?: string): Promise<PricePoint[]> {
    try {

      // Use the new, more precise matching endpoint
      const response = await axios.get(`${this.backendApi}/prices/match`, {
        params: { cardName, setName, cardNumber },
      });

      let priceHistory: PricePoint[] = [];

      if (response.data?.priceHistory?.length > 0) {
        const { matchedProduct, priceHistory: history } = response.data;

        priceHistory = history.map((item: { date: string; marketPrice?: number; price?: number; volume?: number }) => ({
          date: item.date,
          price: item.marketPrice || item.price || 0,
          volume: item.volume || 1,
        })).filter((item: PricePoint) => item.price > 0);

      }

      // Fallback to Pokemon TCG API rolling averages if our backend has no data
      if (priceHistory.length === 0 && cardId) {
        try {
          const rollingResponse = await axios.get(`${this.backendApi}/prices/rolling/${cardId}`);
          
          if (rollingResponse.data?.data?.length > 0) {
            priceHistory = rollingResponse.data.data.map((item: { date: string; marketPrice?: number; avg30?: number; avg7?: number; avg1?: number }) => ({
              date: item.date,
              price: item.marketPrice || item.avg30 || item.avg7 || item.avg1 || 0,
              volume: 1,
            })).filter((item: PricePoint) => item.price > 0);
            
            if (priceHistory.length > 0) {
            }
          }
        } catch (error) {
        }
      }

      // Sort by date ascending (oldest first)
      priceHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      return priceHistory;

    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
      } else {
        console.error('Error fetching backend price history:', error);
      }
      return [];
    }
  }

  private async searchForCard(cardName: string, setName: string): Promise<string | null> {
    // pokemonprice.com uses a simple GET request for search
    const searchQuery = `${cardName} ${setName}`;
    const searchUrl = `${this.pokemonPriceBase}/?s=${encodeURIComponent(searchQuery)}`;

    try {
      const response = await axios.get(searchUrl);
      return response.data;
    } catch (error) {
      console.error(`Failed to search for card: ${searchQuery}`, (error as AxiosError).message);
      return null;
    }
  }

  private findCardPageLink(_html: string, _cardName: string, _setName: string, _cardNumber: string): string | null {
    // Scraping disabled - backend price data is the primary source
    return null;
  }

  private calculateMatchScore(title: string, cardName: string, setName: string, cardNumber: string): number {
    const lowerTitle = title.toLowerCase();
    const lowerCardName = cardName.toLowerCase();

    let score = 0;

    // Card name must match
    if (!lowerTitle.includes(lowerCardName)) {
      return 0;
    }
    score += 10;
    
    // Card number must match
    if(cardNumber && lowerTitle.includes(`#${cardNumber}`)) {
      score += 10;
    }

    // Check set name
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    const titleWords = new Set(normalize(title));
    const setNameWords = normalize(setName);
    
    const setMatchCount = setNameWords.filter(w => titleWords.has(w)).length;
    const setMatchRatio = setMatchCount / setNameWords.length;

    if (setMatchRatio > 0.5) {
      score += Math.floor(setMatchRatio * 5);
    }

    // Penalize for incorrect terms to avoid false positives
    if (lowerTitle.includes('sealed') || lowerTitle.includes('booster')) score -= 10;
    
    return score;
  }

  private async getCardPage(cardLink: string): Promise<string | null> {
    try {
      const response = await axios.get(`${this.pokemonPriceBase}${cardLink}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch card page: ${cardLink}`, (error as AxiosError).message);
      return null;
    }
  }
  
  private parseCardPage(_html: string): PSAData | null {
    // Scraping disabled - backend price data is the primary source
    return null;
  }

  private buildPSAData(grade10: number, grade9: number, grade8: number, grade7: number): PSAData {
    const total = grade10 + grade9 + grade8 + grade7;
    const prices = {
        grade10: 0, // Price history will be handled separately
        grade9: 0,
        grade8: 0,
        raw: 0
    };
    return {
      population: { grade10, grade9, grade8, grade7, total },
      prices,
      popReport: {
        lowPop: grade10 < 100 && grade10 > 0,
        grade10Percentage: total > 0 ? (grade10 / total) * 100 : 0,
        totalSubmissions: total,
      },
      returnRate: total > 0 ? ((grade10 + grade9) / total) * 100 : 0
    };
  }

  private async fetchRealPriceHistory(_html: string): Promise<PricePoint[]> {
    // Scraping disabled - backend price data is the primary source
    return [];
  }

  // New method to get market snapshots for dashboard
  async getMarketSnapshots(days: number = 30) {
    try {
      const response = await axios.get(`${this.backendApi}/prices/snapshots/daily?days=${days}`);
      return response.data?.data || [];
    } catch (error) {
      console.error('Error fetching market snapshots:', error);
      return [];
    }
  }

  // New method to create price alerts
  async createPriceAlert(cardId: string, productId: number, targetPrice: number, alertType: string) {
    try {
      const response = await axios.post(`${this.backendApi}/prices/alerts`, {
        cardId,
        productId,
        targetPrice,
        alertType,
        threshold: 0
      });
      return response.data;
    } catch (error) {
      console.error('Error creating price alert:', error);
      return null;
    }
  }

  // New method to get latest price for a single card from local database
  async getLatestPrice(cardName: string, setName: string, cardNumber: string): Promise<number> {
    // Generate name variations to try
    const nameVariations = [
      cardName, // Original name
      cardName.replace(/-/g, ' '), // Replace hyphens with spaces (e.g., "Charizard-EX" -> "Charizard EX")
      cardName.replace(/-/g, ''), // Remove hyphens (e.g., "Charizard-EX" -> "CharizardEX")
    ];
    
    // Try each name variation
    for (const nameVariation of nameVariations) {
      try {
        // Use the same matching endpoint as fetchRealData
        const response = await axios.get(`${this.backendApi}/prices/match`, {
          params: { cardName: nameVariation, setName, cardNumber },
        });

        if (response.data?.priceHistory?.length > 0) {
          const { priceHistory } = response.data;
          
          // Get the most recent price point
          const latestPrice = priceHistory
            .map((item: { date: string; marketPrice?: number; price?: number }) => ({
              date: item.date,
              price: item.marketPrice || item.price || 0,
            }))
            .filter((item: { price: number }) => item.price > 0)
            .sort((a: { date: string }, b: { date: string }) => 
              new Date(b.date).getTime() - new Date(a.date).getTime()
            )[0];

          if (latestPrice) {
            return latestPrice.price;
          }
        }
      } catch (error) {
        // Silently fail for 404s and continue to next variation
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          continue;
        }
        // Only log actual errors, not expected missing data
        if (import.meta.env.DEV) {
          console.error('Error fetching latest price:', error);
        }
      }
    }

    // Only log this in development for debugging if all variations failed
    if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_PRICES) {
      console.warn(`No price found in database for ${cardName} from ${setName} (tried ${nameVariations.length} variations)`);
    }
    return 0;
  }
}

export const realDataService = new RealDataService();