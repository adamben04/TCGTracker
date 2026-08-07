import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Camera,
  GraduationCap,
  PackageOpen,
  Search,
  SwatchBook,
  TrendingUp,
  Vault,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PokemonCard } from '../../types/pokemon';
import type { AppView } from '../../types/ui';
import { pokemonApi } from '../../services/pokemonApi';
import { browseSearchPath } from '../../utils/routes';
import { proxyImageUrl } from '../../utils/cardDisplay';
import { useCardModal } from '../../contexts/CardModalContext';
import { Button } from '../ui/Button';
import { DataProvenance } from '../ui/DataProvenance';
import { PageHeader } from '../ui/PageHeader';
import { Surface } from '../ui/Surface';
import { PortfolioSummary } from './PortfolioSummary';
import { TopMovers } from './TopMovers';

interface HeroSectionProps {
  onStartSearch: (query: string) => void;
  onViewChange: (view: AppView) => void;
}

const quickSearches = ['Charizard', 'Pikachu', 'Umbreon', 'Gengar'];

const workflows: Array<{
  label: string;
  description: string;
  view: AppView;
  icon: typeof SwatchBook;
}> = [
  {
    label: 'Browse cards',
    description: 'Search printings, compare variants, and inspect current prices.',
    view: 'cards',
    icon: SwatchBook,
  },
  {
    label: 'Manage your vault',
    description: 'Track cost basis, market value, grading, and collection performance.',
    view: 'vault',
    icon: Vault,
  },
  {
    label: 'Watch the market',
    description: 'Build a watchlist, monitor movers, and create target-price alerts.',
    view: 'tracking',
    icon: TrendingUp,
  },
  {
    label: 'Scan a card',
    description: 'Identify a physical card from a photo, then add it to your workflow.',
    view: 'scanner',
    icon: Camera,
  },
  {
    label: 'Estimate a grade',
    description: 'Review centering and visible defects before deciding to submit.',
    view: 'grading',
    icon: GraduationCap,
  },
  {
    label: 'Open a pack',
    description: 'Use the simulator for collection discovery—not real-world odds.',
    view: 'packs',
    icon: PackageOpen,
  },
];

export const HeroSection: React.FC<HeroSectionProps> = ({ onStartSearch, onViewChange }) => {
  const navigate = useNavigate();
  const { openCard } = useCardModal();
  const [searchValue, setSearchValue] = useState('');
  const [spotlightCards, setSpotlightCards] = useState<PokemonCard[]>([]);

  useEffect(() => {
    let mounted = true;

    pokemonApi
      .searchCards('charizard', undefined, 4)
      .then((cards) => {
        if (mounted) setSpotlightCards(cards.slice(0, 4));
      })
      .catch((error) => {
        console.error('Unable to load homepage card spotlight', error);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchValue.trim();
    if (query) onStartSearch(query);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow="Collection overview"
        title="Know what you own—and what it is worth."
        description="Search the catalog, manage holdings, and monitor market movement from one focused workspace."
        actions={
          <>
            <Button variant="secondary" onClick={() => onViewChange('scanner')}>
              <Camera className="h-4 w-4" aria-hidden="true" />
              Scan a card
            </Button>
            <Button variant="primary" onClick={() => onViewChange('cards')}>
              Browse cards
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </>
        }
      />

      <section aria-labelledby="catalog-search-title">
        <Surface className="overflow-hidden p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <h2 id="catalog-search-title" className="text-base font-semibold text-ink-primary">
                Search the card catalog
              </h2>
              <p className="mt-1 text-sm text-ink-secondary">
                Include a set name or card number to distinguish between printings.
              </p>
              <form onSubmit={handleSubmit} className="mt-4">
                <label htmlFor="home-card-search" className="sr-only">
                  Search by card name, set, or number
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted"
                    aria-hidden="true"
                  />
                  <input
                    id="home-card-search"
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder="Try “Charizard 151” or “Pikachu promo”"
                    className="h-12 w-full rounded-lg border border-border-default bg-surface-inset pl-12 pr-4 text-sm text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
                  />
                </div>
              </form>
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
              {quickSearches.map((query) => (
                <Button
                  key={query}
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(browseSearchPath(query))}
                >
                  {query}
                </Button>
              ))}
            </div>
          </div>
        </Surface>
      </section>

      <PortfolioSummary />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
        <Surface className="min-w-0 p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                Market pulse
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink-primary">
                Cards moving now
              </h2>
            </div>
            <DataProvenance
              source="TCG market feeds"
              qualifier="Prices are estimates and may vary by condition."
            />
          </div>
          <TopMovers onCardClick={openCard} />
        </Surface>

        <section aria-labelledby="quick-workflows-title">
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
              Workflows
            </p>
            <h2 id="quick-workflows-title" className="mt-1 text-xl font-semibold text-ink-primary">
              Continue with a task
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {workflows.map(({ label, description, view, icon: Icon }) => (
              <button
                key={view}
                type="button"
                onClick={() => onViewChange(view)}
                className="group flex min-h-20 items-start gap-3 rounded-xl border border-border-default bg-surface-raised p-3.5 text-left transition-colors hover:border-border-strong hover:bg-surface-hover"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent">
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink-primary">{label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-ink-muted">
                    {description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {spotlightCards.length > 0 ? (
        <section aria-labelledby="spotlight-title">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                Catalog spotlight
              </p>
              <h2 id="spotlight-title" className="mt-1 text-xl font-semibold text-ink-primary">
                Popular Charizard printings
              </h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(browseSearchPath('Charizard'))}
            >
              View all
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {spotlightCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => openCard(card)}
                className="group overflow-hidden rounded-xl border border-border-default bg-surface-raised text-left transition-colors hover:border-border-strong"
              >
                <img
                  src={proxyImageUrl(card.images.small)}
                  alt=""
                  loading="lazy"
                  className="aspect-[63/88] w-full bg-surface-inset object-cover"
                />
                <span className="block p-3">
                  <span className="line-clamp-2 block text-sm font-semibold text-ink-primary">
                    {card.name}
                  </span>
                  <span className="mt-1 block text-xs text-ink-muted">
                    {card.set.name} · #{card.number}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};
