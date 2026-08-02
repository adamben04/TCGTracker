import axios from 'axios';
import { buildApiUrl } from '../config/env';
import { PokemonCard } from '../types/pokemon';

export interface TrackedCard {
  id: string;
  card: PokemonCard;
  addedAt: string;
  initialPrice: number;
  priceHistory: Array<{
    date: string;
    price: number;
  }>;
}

export interface PriceAlert {
  id: string;
  cardId: string;
  cardName: string;
  targetPrice: number;
  alertType: 'above' | 'below';
  isActive: boolean;
  createdAt: string;
}

class PriceTrackingService {
  private TRACKED_CARDS_KEY = 'tcg_tracked_cards';
  private PRICE_ALERTS_KEY = 'tcg_price_alerts';

  private _isLoggedIn(): boolean {
    return !!localStorage.getItem('tcgtracker_user');
  }

  private _mapBackendTrackedCard(backendCard: {
    id: string;
    card: PokemonCard;
    addedAt: string;
    initialPrice: number;
    priceHistory: Array<{ date: string; price: number }>;
  }): TrackedCard {
    return {
      id: backendCard.id,
      card: backendCard.card,
      addedAt: backendCard.addedAt,
      initialPrice: backendCard.initialPrice,
      priceHistory: backendCard.priceHistory,
    };
  }

  private _mapBackendAlert(backendAlert: {
    id: number;
    user_id: number;
    card_id: string;
    card_name: string;
    target_price: number;
    condition: 'above' | 'below';
    is_active: boolean;
    created_at: string;
  }): PriceAlert {
    return {
      id: String(backendAlert.id),
      cardId: backendAlert.card_id,
      cardName: backendAlert.card_name,
      targetPrice: backendAlert.target_price,
      alertType: backendAlert.condition,
      isActive: backendAlert.is_active,
      createdAt: backendAlert.created_at,
    };
  }

  private _getAlertsLocal(): PriceAlert[] {
    const stored = localStorage.getItem(this.PRICE_ALERTS_KEY);
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  private _setAlertsLocal(alerts: PriceAlert[]): void {
    localStorage.setItem(this.PRICE_ALERTS_KEY, JSON.stringify(alerts));
  }

  private _getTrackedCardsLocal(): TrackedCard[] {
    const stored = localStorage.getItem(this.TRACKED_CARDS_KEY);
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  private _setTrackedCardsLocal(tracked: TrackedCard[]): void {
    localStorage.setItem(this.TRACKED_CARDS_KEY, JSON.stringify(tracked));
  }

  // Get all tracked cards
  async getTrackedCards(): Promise<TrackedCard[]> {
    if (this._isLoggedIn()) {
      try {
        const response = await axios.get<{ trackedCards: Array<{
          id: string;
          card: PokemonCard;
          addedAt: string;
          initialPrice: number;
          priceHistory: Array<{ date: string; price: number }>;
        }> }>(buildApiUrl('/api/tracked-cards'));
        return response.data.trackedCards.map(this._mapBackendTrackedCard);
      } catch {
        // Fall back to localStorage
      }
    }
    return this._getTrackedCardsLocal();
  }

  // Add card to tracking
  async trackCard(card: PokemonCard): Promise<void> {
    if (this._isLoggedIn()) {
      try {
        const initialPrice = card.marketPrice || card.tcgplayer?.prices?.holofoil?.market || 0;
        await axios.post(buildApiUrl('/api/tracked-cards'), {
          cardId: card.id,
          cardData: card,
          initialPrice,
        });
        const tracked = this._getTrackedCardsLocal();
        if (!tracked.some(t => t.id === card.id)) {
          tracked.push({
            id: card.id,
            card,
            addedAt: new Date().toISOString(),
            initialPrice,
            priceHistory: [{ date: new Date().toISOString(), price: initialPrice }]
          });
          this._setTrackedCardsLocal(tracked);
        }
        return;
      } catch {
        // Fall back to localStorage
      }
    }

    const tracked = this._getTrackedCardsLocal();

    if (tracked.some(t => t.id === card.id)) {
      return;
    }

    const initialPrice = card.marketPrice || card.tcgplayer?.prices?.holofoil?.market || 0;

    const trackedCard: TrackedCard = {
      id: card.id,
      card,
      addedAt: new Date().toISOString(),
      initialPrice,
      priceHistory: [{
        date: new Date().toISOString(),
        price: initialPrice
      }]
    };

    tracked.push(trackedCard);
    this._setTrackedCardsLocal(tracked);
  }

  // Remove card from tracking
  async untrackCard(cardId: string): Promise<void> {
    if (this._isLoggedIn()) {
      try {
        await axios.delete(buildApiUrl(`/api/tracked-cards/${cardId}`));
        const tracked = this._getTrackedCardsLocal();
        this._setTrackedCardsLocal(tracked.filter(t => t.id !== cardId));
        return;
      } catch {
        // Fall back to localStorage
      }
    }

    const tracked = this._getTrackedCardsLocal();
    const filtered = tracked.filter(t => t.id !== cardId);
    this._setTrackedCardsLocal(filtered);
  }

  // Check if card is tracked
  isTracked(cardId: string): boolean {
    return this._getTrackedCardsLocal().some(t => t.id === cardId);
  }

  // Update price for a tracked card
  updateCardPrice(cardId: string, newPrice: number): void {
    const tracked = this._getTrackedCardsLocal();
    const card = tracked.find(t => t.id === cardId);

    if (card) {
      card.priceHistory.push({
        date: new Date().toISOString(),
        price: newPrice
      });

      // Keep only last 30 days of history
      if (card.priceHistory.length > 30) {
        card.priceHistory = card.priceHistory.slice(-30);
      }

      this._setTrackedCardsLocal(tracked);
    }
  }

  // Get price alerts
  async getAlerts(): Promise<PriceAlert[]> {
    if (this._isLoggedIn()) {
      try {
        const response = await axios.get<{ alerts: Array<{
          id: number;
          user_id: number;
          card_id: string;
          card_name: string;
          target_price: number;
          condition: 'above' | 'below';
          is_active: boolean;
          created_at: string;
        }> }>(buildApiUrl('/api/alerts'));
        return response.data.alerts.map(this._mapBackendAlert);
      } catch {
        // Fall back to localStorage
      }
    }
    return this._getAlertsLocal();
  }

  // Create price alert
  async createAlert(cardId: string, cardName: string, targetPrice: number, alertType: 'above' | 'below'): Promise<void> {
    if (this._isLoggedIn()) {
      try {
        const response = await axios.post<{ alert: {
          id: number;
          user_id: number;
          card_id: string;
          card_name: string;
          target_price: number;
          condition: 'above' | 'below';
          is_active: boolean;
          created_at: string;
        } }>(buildApiUrl('/api/alerts'), {
          cardId,
          cardName,
          targetPrice,
          condition: alertType,
        });
        const mapped = this._mapBackendAlert(response.data.alert);
        const alerts = this._getAlertsLocal().filter(a => a.cardId !== mapped.cardId || a.alertType !== mapped.alertType);
        alerts.push(mapped);
        this._setAlertsLocal(alerts);
        return;
      } catch {
        // Fall back to localStorage
      }
    }

    const alerts = this._getAlertsLocal();
    const alert: PriceAlert = {
      id: Date.now().toString(),
      cardId,
      cardName,
      targetPrice,
      alertType,
      isActive: true,
      createdAt: new Date().toISOString()
    };
    alerts.push(alert);
    this._setAlertsLocal(alerts);
  }

  // Delete alert
  async deleteAlert(alertId: string): Promise<void> {
    if (this._isLoggedIn()) {
      try {
        await axios.delete(buildApiUrl(`/api/alerts/${alertId}`));
        const alerts = this._getAlertsLocal();
        this._setAlertsLocal(alerts.filter(a => a.id !== alertId));
        return;
      } catch {
        // Fall back to localStorage
      }
    }

    const alerts = this._getAlertsLocal();
    const filtered = alerts.filter(a => a.id !== alertId);
    this._setAlertsLocal(filtered);
  }

  // Check alerts for a card
  checkAlerts(cardId: string, currentPrice: number): PriceAlert[] {
    const alerts = this._getAlertsLocal().filter(a => a.cardId === cardId && a.isActive);

    return alerts.filter(alert => {
      if (alert.alertType === 'above') {
        return currentPrice >= alert.targetPrice;
      } else {
        return currentPrice <= alert.targetPrice;
      }
    });
  }

  // Get statistics
  getStats(): {
    totalTracked: number;
    totalGainers: number;
    totalLosers: number;
    biggestGainer: { card: PokemonCard; change: number; changePercent: number } | null;
    biggestLoser: { card: PokemonCard; change: number; changePercent: number } | null;
    avgChange: number;
    totalAlerts: number;
  } {
    const tracked = this._getTrackedCardsLocal();

    if (tracked.length === 0) {
      return {
        totalTracked: 0,
        totalGainers: 0,
        totalLosers: 0,
        biggestGainer: null,
        biggestLoser: null,
        avgChange: 0,
        totalAlerts: this._getAlertsLocal().filter(a => a.isActive).length
      };
    }

    let totalChange = 0;
    let gainers = 0;
    let losers = 0;
    let biggestGainer: { card: PokemonCard; change: number; changePercent: number } | null = null;
    let biggestLoser: { card: PokemonCard; change: number; changePercent: number } | null = null;

    tracked.forEach(t => {
      const currentPrice = t.priceHistory[t.priceHistory.length - 1].price;
      const change = currentPrice - t.initialPrice;
      const changePercent = t.initialPrice > 0 ? (change / t.initialPrice) * 100 : 0;

      totalChange += changePercent;

      if (change > 0) {
        gainers++;
        if (!biggestGainer || changePercent > biggestGainer.changePercent) {
          biggestGainer = { card: t.card, change, changePercent };
        }
      } else if (change < 0) {
        losers++;
        if (!biggestLoser || changePercent < biggestLoser.changePercent) {
          biggestLoser = { card: t.card, change, changePercent };
        }
      }
    });

    return {
      totalTracked: tracked.length,
      totalGainers: gainers,
      totalLosers: losers,
      biggestGainer,
      biggestLoser,
      avgChange: totalChange / tracked.length,
      totalAlerts: this._getAlertsLocal().filter(a => a.isActive).length
    };
  }

  // Get top gainers and losers
  getTopMovers(): {
    gainers: Array<{ card: PokemonCard; change: number; changePercent: number; currentPrice: number }>;
    losers: Array<{ card: PokemonCard; change: number; changePercent: number; currentPrice: number }>;
  } {
    const tracked = this._getTrackedCardsLocal();

    const movers = tracked.map(t => {
      const currentPrice = t.priceHistory[t.priceHistory.length - 1].price;
      const change = currentPrice - t.initialPrice;
      const changePercent = t.initialPrice > 0 ? (change / t.initialPrice) * 100 : 0;

      return {
        card: t.card,
        change,
        changePercent,
        currentPrice
      };
    });

    const gainers = movers
      .filter(m => m.change > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 5);

    const losers = movers
      .filter(m => m.change < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 5);

    return { gainers, losers };
  }
}

export const priceTrackingService = new PriceTrackingService();
