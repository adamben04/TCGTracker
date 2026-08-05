import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Plus, Trash2, Search, Scale, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { PokemonCard } from '../../../types/pokemon';
import { pokemonApi } from '../../../services/pokemonApi';
import { PriceHistoryApi } from '../../../services/priceHistoryApi';
import { useGame } from '../../../contexts/GameContext';
import { SectionLabel } from '../../../components/common/SectionLabel';
import { formatCurrency } from '../../../utils/cardDisplay';
import { getCardImage, getCardPrice } from '../../../utils/cardPrice';

type Side = 'you' | 'them';

interface TradeSlot {
  card: PokemonCard;
  quantity: number;
  price: number;
}

export const TradeAnalyzer: React.FC = () => {
  const { isPokemon } = useGame();
  const [slots, setSlots] = useState<Record<Side, TradeSlot[]>>({ you: [], them: [] });
  const [activeSide, setActiveSide] = useState<Side>('you');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PokemonCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [pricing, setPricing] = useState<Set<string>>(new Set());
  const searchTimer = useRef<number | undefined>(undefined);

  const runSearch = (q: string) => {
    window.clearTimeout(searchTimer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    searchTimer.current = window.setTimeout(async () => {
      const cards = await pokemonApi.searchCards(q.trim(), undefined, 25);
      setResults(cards.slice(0, 12));
      setSearching(false);
    }, 350);
  };

  const addCard = async (side: Side, card: PokemonCard) => {
    const price = await lookupPrice(card);
    setSlots((prev) => ({
      ...prev,
      [side]: [...prev[side], { card, quantity: 1, price }],
    }));
    setQuery('');
    setResults([]);
  };

  const lookupPrice = async (card: PokemonCard): Promise<number> => {
    const cached = getCardPrice(card);
    if (cached && cached > 0) return cached;
    const id = card.id;
    setPricing((prev) => new Set(prev).add(id));
    try {
      const history = await PriceHistoryApi.getPokemonCardPriceHistory({
        id: card.id,
        name: card.name,
        set: card.set,
        number: card.number,
        rarity: card.rarity,
        productId: card.productId,
        variant: card.variant,
      });
      const last = history[history.length - 1];
      return last?.price ?? 0;
    } catch {
      return 0;
    } finally {
      setPricing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const updateQuantity = (side: Side, index: number, quantity: number) => {
    setSlots((prev) => {
      const next = { ...prev };
      next[side] = next[side].map((s, i) => (i === index ? { ...s, quantity: Math.max(1, quantity) } : s));
      return next;
    });
  };

  const removeSlot = (side: Side, index: number) => {
    setSlots((prev) => {
      const next = { ...prev };
      next[side] = next[side].filter((_, i) => i !== index);
      return next;
    });
  };

  const sideTotal = (side: Side) =>
    slots[side].reduce((sum, s) => sum + s.price * s.quantity, 0);

  const youTotal = sideTotal('you');
  const themTotal = sideTotal('them');
  const diff = youTotal - themTotal;

  const verdict = useMemo(() => {
    if (youTotal === 0 && themTotal === 0) return null;
    const ratio = youTotal === 0 ? Infinity : (themTotal - youTotal) / youTotal;
    if (Math.abs(diff) < Math.max(youTotal, themTotal) * 0.05 || (youTotal === themTotal)) {
      return { label: 'Fair trade', tone: 'text-emerald-400', icon: Minus };
    }
    if (diff < 0) {
      return { label: 'Their side is worth more', tone: 'text-amber-400', icon: TrendingUp };
    }
    return { label: 'Your side is worth more', tone: 'text-red-400', icon: TrendingDown };
  }, [youTotal, themTotal, diff]);

  const TotalChip: React.FC<{ side: Side }> = ({ side }) => {
    const total = sideTotal(side);
    return (
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          {side === 'you' ? 'Your side' : 'Their side'}
        </span>
        <span className="font-display text-lg font-bold text-ink-primary">
          {formatCurrency(total)}
          {total === 0 && <span className="text-xs font-normal text-ink-muted"> (no prices)</span>}
        </span>
      </div>
    );
  };

  const SidePanel: React.FC<{ side: Side }> = ({ side }) => (
    <div className="rounded-2xl border border-border-default bg-surface p-4">
      <TotalChip side={side} />
      {slots[side].length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border-default text-sm text-ink-muted">
          No cards yet - search below
        </div>
      ) : (
        <div className="space-y-2">
          {slots[side].map((slot, index) => (
            <div
              key={slot.card.id + index}
              className="flex items-center gap-3 rounded-xl border border-border-default bg-surface-inset/50 p-2"
            >
              <img
                src={getCardImage(slot.card)}
                alt={slot.card.name}
                className="h-14 w-10 rounded object-cover"
                loading="lazy"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink-primary">{slot.card.name}</div>
                <div className="text-xs text-ink-muted">
                  {slot.price > 0 ? formatCurrency(slot.price) : 'no price data'} each
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateQuantity(side, index, slot.quantity - 1)}
                  className="rounded-md border border-border-default px-1.5 py-0.5 text-xs text-ink-muted hover:text-ink-primary"
                  aria-label="Decrease"
                >
                  -
                </button>
                <span className="w-6 text-center text-sm font-semibold text-ink-primary">
                  {slot.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => updateQuantity(side, index, slot.quantity + 1)}
                  className="rounded-md border border-border-default px-1.5 py-0.5 text-xs text-ink-muted hover:text-ink-primary"
                  aria-label="Increase"
                >
                  +
                </button>
              </div>
              <div className="w-20 text-right text-sm font-semibold text-ink-primary">
                {formatCurrency(slot.price * slot.quantity)}
              </div>
              <button
                type="button"
                onClick={() => removeSlot(side, index)}
                className="rounded-lg p-1 text-ink-muted hover:bg-red-500/10 hover:text-red-400"
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const gameLabel = isPokemon ? 'Pokemon' : 'One Piece';

  return (
    <div className="section-stack">
      <div>
        <SectionLabel className="text-accent/90">Trade analyzer</SectionLabel>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink-primary">
          Trade Analyzer
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Add cards to both sides of a trade and compare fair market value.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SidePanel side="you" />
        <SidePanel side="them" />
      </div>

      <div className="flex items-center justify-center">
        {verdict && (
          <div
            className={`flex items-center gap-3 rounded-full border px-6 py-3 font-display text-lg font-bold ${
              verdict.tone === 'text-emerald-400'
                ? 'border-emerald-500/30 bg-emerald-500/10'
                : verdict.tone === 'text-amber-400'
                  ? 'border-amber-500/30 bg-amber-500/10'
                  : 'border-red-500/30 bg-red-500/10'
            } ${verdict.tone}`}
          >
            <verdict.icon className="h-5 w-5" />
            {verdict.label}
            <span className="text-sm font-medium opacity-80">
              {youTotal > 0 && themTotal > 0 && `diff ${formatCurrency(Math.abs(diff))}`}
            </span>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border-default bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-accent" />
            <h2 className="font-semibold text-ink-primary">Add cards</h2>
          </div>
          <div className="flex gap-1 rounded-lg border border-border-default p-0.5">
            {(['you', 'them'] as Side[]).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setActiveSide(side)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  activeSide === side
                    ? 'bg-accent-muted text-accent'
                    : 'text-ink-muted hover:text-ink-primary'
                }`}
              >
                {side === 'you' ? 'Your side' : 'Their side'}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              runSearch(e.target.value);
            }}
            placeholder={`Search ${gameLabel} cards to add to ${activeSide === 'you' ? 'your' : 'their'} side...`}
            className="w-full rounded-lg border border-border-default bg-surface-inset py-2 pl-9 pr-3 text-sm text-ink-primary placeholder:text-ink-muted focus:border-accent/50 focus:outline-none"
          />
        </div>

        {searching && (
          <div className="mt-3 py-2 text-center text-sm text-ink-muted">Searching...</div>
        )}

        {!searching && results.length > 0 && (
          <div className="mt-3 max-h-80 space-y-1 overflow-y-auto">
            {results.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => void addCard(activeSide, card)}
                className="flex w-full items-center gap-3 rounded-xl border border-transparent p-2 text-left transition-colors hover:border-accent/30 hover:bg-surface-inset/60"
              >
                <img
                  src={getCardImage(card)}
                  alt={card.name}
                  className="h-12 w-8 rounded object-cover"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-primary">{card.name}</div>
                  <div className="text-xs text-ink-muted">
                    {card.set?.name} {card.number ? `#${card.number}` : ''}
                    {card.rarity ? ` · ${card.rarity}` : ''}
                  </div>
                </div>
                <div className="text-sm font-semibold text-ink-secondary">
                  {getCardPrice(card) > 0 ? formatCurrency(getCardPrice(card)) : '? '}
                </div>
                <Plus className="h-4 w-4 text-accent" />
              </button>
            ))}
          </div>
        )}

        {!searching && query.length >= 2 && results.length === 0 && (
          <div className="mt-3 py-2 text-center text-sm text-ink-muted">
            No cards found for "{query}"
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <ArrowLeftRight className="h-4 w-4 text-accent" />
        Prices use the latest market data in the app; cards without price data show as $0.
      </div>
    </div>
  );
};
