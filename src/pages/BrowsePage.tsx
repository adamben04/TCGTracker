import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PokemonCard } from '../types/pokemon';
import { OnePieceCard } from '../types/onepiece';
import { SearchFilters } from '../features/cards/components/SearchAndSort';
import { CardGrid, CardViewMode, ViewModeToggle } from '../features/cards/components/CardGrid';
import { countActiveMarketplaceFilters } from '../utils/marketplaceFilters';
import { FilterSidebar, MarketplaceFilters } from '../features/cards/components/FilterSidebar';
import { LoadingGrid } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { EmptyState } from '../components/common/EmptyState';
import { useCards, isPokemonCard, isOnePieceCard, getCardPrice } from '../hooks/useCards';
import { useGame } from '../contexts/GameContext';
import { useCardModal } from '../contexts/CardModalContext';
import { markOnboardingStep } from '../components/common/onboarding';
import { formatCurrency, getRarityBadgeClass } from '../utils/cardDisplay';
import { BookPlus, Eye, LineChart } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Badge } from '../components/ui/Badge';
import { DataProvenance } from '../components/ui/DataProvenance';

const DEFAULT_FILTERS: MarketplaceFilters = {
  setName: 'all',
  rarity: 'all',
  priceRange: 'all',
  cardType: 'all',
};

export function BrowsePage() {
  const navigate = useNavigate();
  const { isPokemon, isOnePiece } = useGame();
  const { openCard } = useCardModal();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [cardViewMode, setCardViewMode] = useState<CardViewMode>('grid');
  const [marketplaceFilters, setMarketplaceFilters] = useState<MarketplaceFilters>(DEFAULT_FILTERS);

  const {
    cards,
    isLoading,
    error,
    searchQuery,
    sortBy,
    filterBy,
    setSearchQuery,
    setSortBy,
    setFilterBy,
    refetch,
  } = useCards();

  useEffect(() => {
    setSearchQuery(urlQuery);
  }, [urlQuery, setSearchQuery]);

  useEffect(() => {
    if (searchQuery.trim() && cards.length > 0 && !isLoading) {
      markOnboardingStep('browse');
    }
  }, [searchQuery, cards.length, isLoading]);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (query) params.set('q', query);
        else params.delete('q');
        return params;
      },
      { replace: true, preventScrollReset: true }
    );
  };

  const handleResetBrowseState = () => {
    handleSearchChange('');
    setFilterBy('all');
    setMarketplaceFilters(DEFAULT_FILTERS);
  };

  const handleAddToCollection = () => {
    navigate('/vault');
  };

  const cardSetOptions = Array.from(new Set(cards.map((card) => card.set.name))).sort();
  const rarityOptions = Array.from(
    new Set(cards.map((card) => card.rarity).filter(Boolean) as string[])
  ).sort();

  const typeOptions = Array.from(
    new Set(
      cards.flatMap((card) => {
        if (isPokemonCard(card)) {
          return card.types && card.types.length > 0 ? card.types : [];
        }
        if (isOnePieceCard(card)) {
          return card.cardColor ? [card.cardColor] : [];
        }
        return [];
      })
    )
  ).sort();

  const cardsWithMarketplaceFilters = cards.filter((card) => {
    if (marketplaceFilters.setName !== 'all' && card.set.name !== marketplaceFilters.setName) {
      return false;
    }
    if (marketplaceFilters.rarity !== 'all' && (card.rarity || '') !== marketplaceFilters.rarity) {
      return false;
    }
    if (marketplaceFilters.cardType !== 'all') {
      if (isPokemonCard(card)) {
        if (!(card.types || []).some((type) => type === marketplaceFilters.cardType)) return false;
      } else if (isOnePieceCard(card)) {
        if (card.cardColor !== marketplaceFilters.cardType) return false;
      }
    }
    if (marketplaceFilters.priceRange !== 'all') {
      const price = getCardPrice(card);
      if (marketplaceFilters.priceRange === '0-10' && !(price >= 0 && price < 10)) return false;
      if (marketplaceFilters.priceRange === '10-50' && !(price >= 10 && price < 50)) return false;
      if (marketplaceFilters.priceRange === '50-150' && !(price >= 50 && price < 150)) return false;
      if (marketplaceFilters.priceRange === '150+' && !(price >= 150)) return false;
    }
    return true;
  });

  const facetChips: { key: keyof MarketplaceFilters; label: string }[] = [];
  if (marketplaceFilters.setName !== 'all')
    facetChips.push({ key: 'setName', label: marketplaceFilters.setName });
  if (marketplaceFilters.rarity !== 'all')
    facetChips.push({ key: 'rarity', label: marketplaceFilters.rarity });
  if (marketplaceFilters.cardType !== 'all')
    facetChips.push({ key: 'cardType', label: marketplaceFilters.cardType });
  if (marketplaceFilters.priceRange !== 'all')
    facetChips.push({ key: 'priceRange', label: `$${marketplaceFilters.priceRange}` });

  const gameLabel = isPokemon ? 'Pokémon' : 'One Piece';

  return (
    <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Catalog"
        title={`Browse ${gameLabel} cards`}
        description="Search by card name, then narrow results by set, rarity, type, price, and market signal."
        meta={
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="accent">{gameLabel}</Badge>
            <DataProvenance
              source={isPokemon ? 'Pokémon TCG API + TCGplayer pricing' : 'OPTCG catalog feeds'}
              qualifier="Prices vary by finish and condition."
            />
          </div>
        }
        className="mb-6"
      />

      <SearchFilters
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        sortBy={sortBy}
        onSortChange={setSortBy}
        filterBy={filterBy}
        onFilterChange={setFilterBy}
        isLoading={isLoading}
        onOpenAdvancedFilters={() => setMobileFiltersOpen(true)}
        activeFilterCount={countActiveMarketplaceFilters(marketplaceFilters)}
        isOnePiece={isOnePiece}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ViewModeToggle viewMode={cardViewMode} onChange={setCardViewMode} />
      </div>

      {(searchQuery || facetChips.length > 0) &&
        !isLoading &&
        !error &&
        cardsWithMarketplaceFilters.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2" aria-live="polite">
            <p className="text-sm font-semibold text-ink-secondary">
              <span className="font-mono font-bold tabular-nums text-accent">
                {cardsWithMarketplaceFilters.length}
              </span>{' '}
              {cardsWithMarketplaceFilters.length === 1 ? 'result' : 'results'}
              {searchQuery && (
                <>
                  {' '}
                  for <span className="font-bold text-ink-primary">"{searchQuery}"</span>
                </>
              )}
            </p>
            {filterBy !== 'all' && (
              <span className="badge-gain border px-2.5 py-1 text-xs font-bold uppercase tracking-wider">
                {filterBy}
              </span>
            )}
            {facetChips.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setMarketplaceFilters({ ...marketplaceFilters, [key]: 'all' })}
                className="inline-flex items-center gap-1.5 border border-accent bg-accent-muted px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-accent transition-all hover:bg-accent/20 neon-flood"
              >
                {label}
                <span aria-hidden="true" className="text-accent ml-1">
                  ×
                </span>
                <span className="sr-only">Remove {label} filter</span>
              </button>
            ))}
            {facetChips.length > 0 && (
              <button
                type="button"
                onClick={handleResetBrowseState}
                className="border border-border-default bg-surface-raised px-3 py-1 text-xs font-bold uppercase tracking-wider text-ink-muted transition-all hover:border-accent hover:text-accent neon-flood"
              >
                Clear all
              </button>
            )}
          </div>
        )}

      <div className="grid min-h-96 min-w-0 gap-5 lg:grid-cols-[minmax(0,270px)_minmax(0,1fr)]">
        <FilterSidebar
          filters={marketplaceFilters}
          onFiltersChange={setMarketplaceFilters}
          sortBy={sortBy}
          onSortChange={setSortBy}
          setOptions={cardSetOptions}
          rarityOptions={rarityOptions}
          typeOptions={typeOptions}
          onReset={handleResetBrowseState}
          isMobileOpen={mobileFiltersOpen}
          onCloseMobile={() => setMobileFiltersOpen(false)}
          isOnePiece={isOnePiece}
        />

        <section className="min-w-0">
          {isOnePiece ? (
            isLoading ? (
              <LoadingGrid />
            ) : cardsWithMarketplaceFilters.length > 0 ? (
              <section className="animate-fade-in">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {cardsWithMarketplaceFilters.filter(isOnePieceCard).map((card) => (
                    <OnePieceCardItem key={card.id} card={card} onClick={() => openCard(card)} />
                  ))}
                </div>
              </section>
            ) : (
              <EmptyState
                hasSearchQuery={!!searchQuery}
                onResetFilters={handleResetBrowseState}
                onTrySearch={handleSearchChange}
              />
            )
          ) : error ? (
            <ErrorMessage message={error} onRetry={refetch} />
          ) : isLoading ? (
            <LoadingGrid />
          ) : cardsWithMarketplaceFilters.length > 0 ? (
            <CardGrid
              cards={cardsWithMarketplaceFilters as PokemonCard[]}
              viewMode={cardViewMode}
              onCardClick={(card) => openCard(card as PokemonCard)}
              onAddToCollection={handleAddToCollection}
              onViewPriceHistory={(card) => openCard(card as PokemonCard)}
            />
          ) : (
            <EmptyState
              hasSearchQuery={!!searchQuery || filterBy !== 'all'}
              onResetFilters={handleResetBrowseState}
              onTrySearch={handleSearchChange}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function OnePieceCardItem({ card, onClick }: { card: OnePieceCard; onClick: () => void }) {
  const price = card.marketPrice ?? 0;
  const imageUrl = card.images?.small || card.imageUrl;

  return (
    <article
      className={[
        'group relative overflow-hidden rounded-lg border border-border-default bg-surface-raised shadow-sm',
        'transition-colors duration-150 hover:border-border-strong',
      ].join(' ')}
    >
      <div
        className="relative aspect-[63/88] overflow-hidden bg-surface-inset cursor-pointer"
        onClick={onClick}
        onKeyDown={(event) => {
          if (
            event.currentTarget === event.target &&
            (event.key === 'Enter' || event.key === ' ')
          ) {
            event.preventDefault();
            onClick();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`View ${card.name}`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={card.name}
            className="relative z-0 h-full w-full object-contain p-2.5 transition-transform duration-300 ease-out group-hover:scale-[1.03]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-ink-muted">
            No image available
          </div>
        )}

        <div className="absolute bottom-2 left-2 right-2 z-20 grid grid-cols-3 gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-border-default bg-surface-overlay px-2 py-1 text-[11px] font-medium text-ink-primary hover:bg-surface-hover"
          >
            <Eye className="h-3.5 w-3.5" />
            View
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-border-default bg-surface-overlay px-2 py-1 text-[11px] font-medium text-ink-primary hover:bg-surface-hover"
          >
            <BookPlus className="h-3.5 w-3.5" />
            Add
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-border-default bg-surface-overlay px-2 py-1 text-[11px] font-medium text-ink-primary hover:bg-surface-hover"
          >
            <LineChart className="h-3.5 w-3.5" />
            History
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left"
        aria-label={`Open details for ${card.name}`}
      >
        <div className="space-y-1.5 px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3
              className="truncate text-[13px] font-semibold leading-tight text-ink-primary"
              title={card.name}
            >
              {card.name || 'Unknown Card'}
            </h3>
            <span className="shrink-0 font-mono text-[10px] text-ink-muted">
              #{card.number || '—'}
            </span>
          </div>
          <p className="truncate text-xs text-ink-muted" title={card.setName}>
            {card.setName || 'Unknown set'}
          </p>

          <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
            {card.rarity ? (
              <span
                className={`inline-flex max-w-[55%] items-center truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${getRarityBadgeClass(card.rarity)}`}
                title={card.rarity}
              >
                {card.rarity}
              </span>
            ) : (
              <span className="text-[10px] text-ink-muted">—</span>
            )}
            <span className="flex items-center gap-1.5">
              <span
                className={`font-mono text-sm font-bold tabular-nums ${price > 0 ? 'text-ink-primary' : 'text-ink-muted'}`}
              >
                {price > 0 ? formatCurrency(price) : 'Unpriced'}
              </span>
            </span>
          </div>

          {card.color && (
            <div className="pt-1">
              <span className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-ink-secondary">
                {card.color}
              </span>
            </div>
          )}
        </div>
      </button>
    </article>
  );
}
