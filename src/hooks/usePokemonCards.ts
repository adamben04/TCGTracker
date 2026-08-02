import { useState, useEffect, useCallback } from 'react';
import { PokemonCard, SortOption, FilterOption, CardInvestmentData } from '../types/pokemon';
import { pokemonApi } from '../services/pokemonApi';
import { sortCards } from '../utils/sorting';

interface UsePokemonCardsReturn {
  cards: PokemonCard[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  sortBy: SortOption;
  filterBy: FilterOption;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: SortOption) => void;
  setFilterBy: (filter: FilterOption) => void;
  refetch: () => void;
}

/** Generate basic investment data from a card's available information.
 *  This provides filter-compatible data when the full investment pipeline hasn't run. */
function computeBasicInvestmentData(card: PokemonCard): CardInvestmentData {
  const price = card.marketPrice ?? pokemonApi.extractCardPrice(card) ?? 0;
  const rarity = (card.rarity ?? '').toLowerCase();

  // Undervalued heuristic: price below $5 for holo/rare cards, or below $2 for commons
  const isUndervalued =
    (price > 0 && price < 5 && (rarity.includes('rare') || rarity.includes('holo'))) ||
    (price > 0 && price < 2);

  // Overvalued heuristic: high price for a common card
  const isOvervalued = price > 20 && !rarity.includes('rare') && !rarity.includes('holo') && !rarity.includes('ultra');

  // Bullish: higher-value cards with desirable rarities tend to appreciate
  const trend =
    price >= 20 && (rarity.includes('ultra') || rarity.includes('secret') || rarity.includes('rare'))
      ? ('BULLISH' as const)
      : price >= 10
        ? ('NEUTRAL' as const)
        : ('BEARISH' as const);

  // Low population: cards from older sets or special sets tend to be lower pop
  const setId = card.set.id ?? '';
  const isOldSet = /^(base1|base2|base3|base4|gym|neo)/.test(setId);
  const isSpecialSet = setId.includes('promo') || setId.includes('shining') || setId.includes('gold');
  const lowPop = isOldSet || isSpecialSet || (rarity.includes('secret') || rarity.includes('rainbow'));

  // Return rate: estimate from rarity
  const returnRate = rarity.includes('ultra') || rarity.includes('secret') ? 75 :
    rarity.includes('rare') || rarity.includes('holo') ? 60 : 40;

  return {
    marketAnalysis: {
      trend,
      volatility: price > 20 ? 0.15 : 0.08,
      priceChange30d: 0,
      priceChange90d: 0,
      priceChange1y: 0,
      isUndervalued,
      isOvervalued,
      fairValue: price,
      confidence: 30,
    },
    psaData: {
      population: { grade10: 0, grade9: 0, grade8: 0, grade7: 0, total: 0 },
      prices: { grade10: 0, grade9: 0, grade8: 0, raw: price },
      popReport: { lowPop, grade10Percentage: 0, totalSubmissions: 0 },
      returnRate,
    },
    priceHistory: [{ date: new Date().toISOString().slice(0, 10), price }],
    investmentScore: Math.round(50 + (isUndervalued ? 20 : 0) + (lowPop ? 15 : 0) + (trend === 'BULLISH' ? 15 : 0)),
    riskLevel: price > 30 ? 'HIGH' : price > 10 ? 'MEDIUM' : 'LOW',
    recommendation: isUndervalued ? 'BUY' : trend === 'BULLISH' ? 'HOLD' : 'WATCH',
  };
}

export const usePokemonCards = (): UsePokemonCardsReturn => {
  const [cards, setCards] = useState<PokemonCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('price-high');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  const loadCards = async (query?: string, _setId?: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get cards from Pokemon TCG API (with built-in retry logic)
      let pokemonCards = await pokemonApi.searchCards(query, _setId, 250);
      
      // If no cards returned, show helpful message
      if (pokemonCards.length === 0) {
        console.log(`No cards found for query: "${query}"`);
        setCards([]);
        setIsLoading(false);
        return;
      }
      
      // Use Pokemon TCG API prices directly (they're already accurate and card-specific)
      // The local database matching can be imprecise and match to wrong card variants
      console.log(`✅ Loaded ${pokemonCards.length} cards with Pokemon TCG API prices`);

      // Attach basic investment data so filters work
      const cardsWithData = pokemonCards.map(card => ({
        ...card,
        investmentData: card.investmentData ?? computeBasicInvestmentData(card),
      }));

      setCards(cardsWithData);
    } catch (err) {
      const errorMessage = (err as Error).message;
      console.error('Error loading cards:', err);
      
      // Provide helpful error messages based on error type
      if (errorMessage.includes('504') || errorMessage.includes('Gateway Timeout')) {
        setError('Pokemon TCG API is slow to respond. Please try again in a moment.');
      } else if (errorMessage.includes('429')) {
        setError('Too many requests. Please wait a moment and try again.');
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        setError('Network error. Please check your internet connection.');
      } else {
        setError('Failed to load Pokemon cards. Please try again.');
      }
      
      setCards([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (searchQuery.trim()) {
      loadCards(searchQuery);
    } else {
      setCards([]);
    }
  }, [searchQuery]);

  // Apply filters
  const filteredCards = cards.filter(card => {
    if (filterBy === 'all') return true;
    if (!card.investmentData) return false;

    switch (filterBy) {
      case 'undervalued':
        return card.investmentData.marketAnalysis.isUndervalued;
      case 'overvalued':
        return card.investmentData.marketAnalysis.isOvervalued;
      case 'low-pop':
        return card.investmentData.psaData.popReport.lowPop;
      case 'high-return':
        return card.investmentData.psaData.returnRate > 60;
      case 'bullish':
        return card.investmentData.marketAnalysis.trend === 'BULLISH';
      default:
        return true;
    }
  });

  const sortedCards = sortCards(filteredCards, sortBy);

  const refetch = useCallback(() => {
    if (searchQuery.trim()) {
      loadCards(searchQuery);
    }
  }, [searchQuery]);

  return {
    cards: sortedCards,
    isLoading,
    error,
    searchQuery,
    sortBy,
    filterBy,
    setSearchQuery,
    setSortBy,
    setFilterBy,
    refetch
  };
};