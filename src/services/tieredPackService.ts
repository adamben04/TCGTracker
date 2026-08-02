import { Pack, PackPull, PokemonCard, PackOpeningHistory, ValueRange } from '../types/pokemon';
import { pokemonApi } from './pokemonApi';
import { env } from '../config/env';
import { onepieceApi } from './onepieceApi';
import { OnePieceCard } from '../types/onepiece';

const PACK_HISTORY_KEY = 'tcg_tiered_pack_history';

const ONE_PIECE_PACKS: Pack[] = [
  {
    id: 'op-standard',
    name: 'One Piece Booster Pack',
    tier: 'common',
    price: 4.99,
    averageValue: 5.50,
    cardsPerPack: 5,
    imageUrl: '',
    description: 'Standard One Piece TCG booster pack. 5 random cards.',
    valueRanges: [
      { min: 0, max: 1, probability: 15, label: '$0-1' },
      { min: 1, max: 3, probability: 35, label: '$1-3' },
      { min: 3, max: 8, probability: 30, label: '$3-8' },
      { min: 8, max: 20, probability: 15, label: '$8-20' },
      { min: 20, max: 100, probability: 5, label: '$20-100' },
    ],
    tcg: 'onepiece',
  },
  {
    id: 'op-premium',
    name: 'One Piece Premium Pack',
    tier: 'rare',
    price: 14.99,
    averageValue: 16.00,
    cardsPerPack: 8,
    imageUrl: '',
    description: 'Premium One Piece pack with 8 cards including guaranteed rare.',
    valueRanges: [
      { min: 0, max: 3, probability: 10, label: '$0-3' },
      { min: 3, max: 8, probability: 25, label: '$3-8' },
      { min: 8, max: 20, probability: 35, label: '$8-20' },
      { min: 20, max: 50, probability: 20, label: '$20-50' },
      { min: 50, max: 200, probability: 10, label: '$50-200' },
    ],
    tcg: 'onepiece',
  },
  {
    id: 'op-starter',
    name: 'One Piece Starter Deck',
    tier: 'uncommon',
    price: 9.99,
    averageValue: 11.00,
    cardsPerPack: 6,
    imageUrl: '',
    description: 'One Piece starter deck cards. Guaranteed leader card.',
    valueRanges: [
      { min: 0, max: 2, probability: 10, label: '$0-2' },
      { min: 2, max: 5, probability: 30, label: '$2-5' },
      { min: 5, max: 12, probability: 35, label: '$5-12' },
      { min: 12, max: 25, probability: 20, label: '$12-25' },
      { min: 25, max: 80, probability: 5, label: '$25-80' },
    ],
    tcg: 'onepiece',
  },
  {
    id: 'op-secret',
    name: 'One Piece Secret Rare Hunt',
    tier: 'secret-rare',
    price: 29.99,
    averageValue: 35.00,
    cardsPerPack: 10,
    imageUrl: '',
    description: 'High-value One Piece pack. 10 cards with boosted SR/SEC odds.',
    valueRanges: [
      { min: 0, max: 5, probability: 5, label: '$0-5' },
      { min: 5, max: 15, probability: 15, label: '$5-15' },
      { min: 15, max: 40, probability: 30, label: '$15-40' },
      { min: 40, max: 100, probability: 30, label: '$40-100' },
      { min: 100, max: 500, probability: 20, label: '$100-500' },
    ],
    tcg: 'onepiece',
  },
];

class TieredPackService {
  private cardPoolCache: PokemonCard[] | null = null;
  private onePieceCardPoolCache: OnePieceCard[] | null = null;

  // Define tiered packs with GameStop-style odds
  private tieredPacks: Pack[] = [
    {
      id: 'starter-25',
      name: 'Starter Pack',
      tier: 'starter',
      price: 25,
      averageValue: 25,
      cardsPerPack: 1,
      description: 'Perfect for beginners',
      imageUrl: 'https://images.pokemontcg.io/base1/logo.png',
      valueRanges: [
        { min: 12, max: 19, probability: 40.6, label: '$12-19' },
        { min: 19, max: 25, probability: 30.6, label: '$19-25' },
        { min: 25, max: 50, probability: 25.4, label: '$25-50' },
        { min: 50, max: 100, probability: 3, label: '$50-100' },
        { min: 100, max: 250, probability: 0.3, label: '$100-250' },
        { min: 250, max: 500, probability: 0.1, label: '$250-500' }
      ]
    },
    {
      id: 'bronze-50',
      name: 'Bronze Pack',
      tier: 'bronze',
      price: 50,
      averageValue: 50,
      cardsPerPack: 1,
      description: 'Step up your collection',
      imageUrl: 'https://images.pokemontcg.io/base1/logo.png',
      valueRanges: [
        { min: 25, max: 38, probability: 40, label: '$25-38' },
        { min: 38, max: 50, probability: 30, label: '$38-50' },
        { min: 50, max: 100, probability: 25, label: '$50-100' },
        { min: 100, max: 200, probability: 4, label: '$100-200' },
        { min: 200, max: 500, probability: 0.8, label: '$200-500' },
        { min: 500, max: 1000, probability: 0.2, label: '$500-1000' }
      ]
    },
    {
      id: 'silver-100',
      name: 'Silver Pack',
      tier: 'silver',
      price: 100,
      averageValue: 100,
      cardsPerPack: 1,
      description: 'Premium cards await',
      imageUrl: 'https://images.pokemontcg.io/base1/logo.png',
      valueRanges: [
        { min: 50, max: 75, probability: 38, label: '$50-75' },
        { min: 75, max: 100, probability: 32, label: '$75-100' },
        { min: 100, max: 200, probability: 25, label: '$100-200' },
        { min: 200, max: 400, probability: 4, label: '$200-400' },
        { min: 400, max: 1000, probability: 0.8, label: '$400-1000' },
        { min: 1000, max: 2000, probability: 0.2, label: '$1000-2000' }
      ]
    },
    {
      id: 'gold-500',
      name: 'Gold Pack',
      tier: 'gold',
      price: 500,
      averageValue: 500,
      cardsPerPack: 1,
      description: 'High-value pulls',
      imageUrl: 'https://images.pokemontcg.io/base1/logo.png',
      valueRanges: [
        { min: 250, max: 375, probability: 35, label: '$250-375' },
        { min: 375, max: 500, probability: 35, label: '$375-500' },
        { min: 500, max: 1000, probability: 25, label: '$500-1000' },
        { min: 1000, max: 2000, probability: 4, label: '$1000-2000' },
        { min: 2000, max: 5000, probability: 0.8, label: '$2000-5000' },
        { min: 5000, max: 10000, probability: 0.2, label: '$5000-10000' }
      ]
    },
    {
      id: 'platinum-1000',
      name: 'Platinum Pack',
      tier: 'platinum',
      price: 1000,
      averageValue: 1000,
      cardsPerPack: 1,
      description: 'Ultimate gambling experience',
      imageUrl: 'https://images.pokemontcg.io/base1/logo.png',
      valueRanges: [
        { min: 400, max: 600, probability: 35, label: '$400-600' },
        { min: 600, max: 800, probability: 35, label: '$600-800' },
        { min: 800, max: 1000, probability: 20, label: '$800-1000' },
        { min: 1000, max: 1500, probability: 8, label: '$1000-1500' },
        { min: 1500, max: 2500, probability: 1.5, label: '$1500-2500' },
        { min: 2500, max: 5000, probability: 0.5, label: '$2500-5000' }
      ]
    }
  ];


  // Get all available tiered packs
  getAvailablePacks(tcg?: 'pokemon' | 'onepiece'): Pack[] {
    const allPacks = [...this.tieredPacks, ...ONE_PIECE_PACKS];
    if (tcg) {
      return allPacks.filter(pack => {
        if (tcg === 'pokemon') return !pack.tcg || pack.tcg === 'pokemon';
        return pack.tcg === tcg;
      });
    }
    return allPacks;
  }

  // Get only One Piece packs
  getOnePiecePacks(): Pack[] {
    return ONE_PIECE_PACKS;
  }

  // Open a tiered pack
  async openPack(pack: Pack): Promise<PackPull> {
    try {
      let cardPool: any[];
      
      if (pack.tcg === 'onepiece') {
        const onePieceCards = await this.fetchOnePieceCardPool();
        cardPool = onePieceCards.map(card => ({
          ...card,
          marketPrice: card.marketPrice || onepieceApi.extractCardPrice(card),
        }));
      } else {
        cardPool = await this.fetchCardPool();
      }

      console.log("cardPool: ", cardPool);
      if (cardPool.length === 0) {
        throw new Error('Unable to fetch cards. Please check your connection.');
      }

      const cardsPerPack = pack.cardsPerPack || 1;
      const selectedCards: any[] = [];
      const seenIds = new Set<string>();

      for (let i = 0; i < cardsPerPack; i++) {
        const card = this.selectCardFromRange(cardPool, pack.valueRanges, seenIds);
        if (!card) break;
        seenIds.add(card.id);
        selectedCards.push(card);
      }

      if (selectedCards.length === 0) {
        throw new Error('No suitable card found in the pool for this value range.');
      }

      // Backend handles images (stored -> deterministic)
      // If no images available, card.images will be undefined

      const totalValue = selectedCards.reduce((sum, card) => sum + (
        card.marketPrice ||
        (pack.tcg === 'onepiece' ? onepieceApi.extractCardPrice(card) : pokemonApi.extractCardPrice(card))
      ), 0);
      const profit = totalValue - pack.price;

      const packPull: PackPull = {
        pack,
        cards: selectedCards,
        totalValue,
        profit,
        openedAt: new Date().toISOString()
      };

      this.addToHistory(packPull);
      return packPull;
    } catch (error) {
      console.error('Error opening pack:', error);
      throw error;
    }
  }

  // Select which VALUE RANGE bracket based on probabilities
  private selectValueRange(ranges: ValueRange[]): ValueRange {
    const rand = Math.random() * 100;
    let cumulative = 0;

    for (const range of ranges) {
      cumulative += range.probability;
      if (rand <= cumulative) {
        return range;
      }
    }

    // Fallback to first range
    return ranges[0];
  }

  private async fetchCardPool(): Promise<PokemonCard[]> {
    if (this.cardPoolCache) {
      return this.cardPoolCache;
    }

    const resp = await fetch(`${env.apiUrl}/api/cards/pool?limit=10000`);
    
    if (!resp.ok) {
      throw new Error(`Failed to fetch card pool: ${resp.status}`);
    }
    
    const json = await resp.json();
    const allCards = json.data || [];
    
    if (allCards.length === 0) {
      throw new Error('No cards returned from database');
    }
    
    const cardsWithPrices = allCards.filter((card: PokemonCard) => {
      const price = card.marketPrice || pokemonApi.extractCardPrice(card);
      return price > 0 && price < 10000;
    });
    
    if (cardsWithPrices.length === 0) {
      throw new Error('No cards with valid prices found');
    }

    const prices = cardsWithPrices.map((card: PokemonCard) => card.marketPrice || pokemonApi.extractCardPrice(card));
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    console.log(`📊 Card pool stats: ${cardsWithPrices.length} cards, price range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`);

    this.cardPoolCache = this.shuffleArray([...cardsWithPrices]);
    return this.cardPoolCache;
  }

  // Shuffle array for randomness
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Select a random card from the pool based on rolled value range
  private selectCardFromRange(
    cardPool: PokemonCard[],
    ranges: ValueRange[],
    excludeIds: Set<string> = new Set()
  ): PokemonCard | null {
    const rolledRange = this.selectValueRange(ranges);
    
    // Filter cards to this specific range
    let candidates = cardPool.filter(card => {
      const price = card.marketPrice || pokemonApi.extractCardPrice(card);
      return price >= rolledRange.min && price <= rolledRange.max;
    });

    // Remove duplicates using card.id (not collapsed identifier)
    // This prevents cards from different sets with same name/number from collapsing
    const seenIds = new Set<string>();
    candidates = candidates.filter(card => {
      // Use the most specific stable identifier available for duplicate removal.
      const cardId = card.id || 
        (card as PokemonCard & { uniqueIdentifier?: string }).uniqueIdentifier ||
        `${card.set?.id || 'unknown'}-${card.number || 'unknown'}-${card.name || 'unknown'}`;
      
      if (seenIds.has(cardId) || excludeIds.has(cardId)) return false;
      seenIds.add(cardId);
      return true;
    });

    if (candidates.length === 0) {
      return null;
    }

    const shuffled = this.shuffleArray(candidates);
    const randomIndex = typeof crypto !== 'undefined' && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(1))[0] % shuffled.length
      : Math.floor(Math.random() * shuffled.length);
    
    return shuffled[randomIndex];
  }

  // Get pack opening history
  getHistory(): PackOpeningHistory {
    try {
      const stored = localStorage.getItem(PACK_HISTORY_KEY);
      if (!stored) {
        return {
          pulls: [],
          totalSpent: 0,
          totalValue: 0,
          totalProfit: 0,
          packsOpened: 0
        };
      }

      const pulls: PackPull[] = JSON.parse(stored);
      const totalSpent = pulls.reduce((sum, pull) => sum + pull.pack.price, 0);
      const totalValue = pulls.reduce((sum, pull) => sum + pull.totalValue, 0);
      const totalProfit = totalValue - totalSpent;

      return {
        pulls,
        totalSpent,
        totalValue,
        totalProfit,
        packsOpened: pulls.length
      };
    } catch (error) {
      console.error('Error loading pack history:', error);
      return {
        pulls: [],
        totalSpent: 0,
        totalValue: 0,
        totalProfit: 0,
        packsOpened: 0
      };
    }
  }

  // Add pack pull to history
  private addToHistory(packPull: PackPull): void {
    try {
      const history = this.getHistory();
      history.pulls.unshift(packPull);
      
      // Keep only last 100 pulls
      if (history.pulls.length > 100) {
        history.pulls = history.pulls.slice(0, 100);
      }

      localStorage.setItem(PACK_HISTORY_KEY, JSON.stringify(history.pulls));
    } catch (error) {
      console.error('Error saving pack history:', error);
    }
  }

  // Clear history
  clearHistory(): void {
    localStorage.removeItem(PACK_HISTORY_KEY);
  }

  clearCache(): void {
    this.cardPoolCache = null;
  }

  // Fetch One Piece card pool from API
  async fetchOnePieceCardPool(): Promise<OnePieceCard[]> {
    if (this.onePieceCardPoolCache) {
      return this.onePieceCardPoolCache;
    }

    const cards = await onepieceApi.getAllCards();
    const cardsWithPrices = cards.filter((card: OnePieceCard) => {
      const price = card.marketPrice || onepieceApi.extractCardPrice(card);
      return price > 0 && price < 10000;
    });

    if (cardsWithPrices.length === 0) {
      throw new Error('No One Piece cards with valid prices found');
    }

    this.onePieceCardPoolCache = this.shuffleArray([...cardsWithPrices]);
    return this.onePieceCardPoolCache;
  }

  clearOnePieceCache(): void {
    this.onePieceCardPoolCache = null;
  }
}

export const tieredPackService = new TieredPackService();

