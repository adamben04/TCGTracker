import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dice5, Gem, TrendingUp, Info } from 'lucide-react';
import { PokemonSet } from '../../../types/pokemon';
import { pokemonApi } from '../../../services/pokemonApi';
import { buildApiUrl } from '../../../config/env';
import { SectionLabel } from '../../../components/common/SectionLabel';
import { formatCurrency } from '../../../utils/cardDisplay';

interface RarityStat {
  rarity: string;
  count: number;
  avgPrice: number | null;
}

interface EvBreakdownEntry {
  rarity: string;
  pullRate: number;
  avgPrice: number;
  expectedValue: number;
}

interface GradeOpportunity {
  uniqueIdentifier: string;
  cardName: string;
  rarity: string;
  rawPrice: number;
  psa10Price: number;
  uplift: number;
  upliftPercent: number;
}

interface RipGradeResult {
  setId: string;
  setName: string;
  totalCards: number;
  pricedCards: number;
  rarityStats: RarityStat[];
  evPerPack: number;
  evBreakdown: EvBreakdownEntry[];
  gradeOpportunities: GradeOpportunity[];
  packPrice?: number;
}

const RARITY_LABELS: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  holo: 'Holo',
  ultra: 'Ultra Rare',
  special: 'Special',
};

const TIER_BADGES: Record<string, string> = {
  common: 'bg-slate-500/10 text-slate-400',
  uncommon: 'bg-emerald-500/10 text-emerald-400',
  rare: 'bg-sky-500/10 text-sky-400',
  holo: 'bg-amber-500/10 text-amber-400',
  ultra: 'bg-orange-500/10 text-orange-400',
  special: 'bg-fuchsia-500/10 text-fuchsia-400',
};

export const RipGradeCalculator: React.FC = () => {
  const [sets, setSets] = useState<PokemonSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState('');
  const [packPrice, setPackPrice] = useState('4.99');
  const [result, setResult] = useState<RipGradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void pokemonApi.getSets().then(setSets);
  }, []);

  const analyze = useCallback(async (setId: string, price: string) => {
    if (!setId) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ setId });
      const response = await fetch(buildApiUrl(`/api/analysis/rip-grade?${params.toString()}`));
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${response.status})`);
      }
      const json = (await response.json()) as { success: boolean; data: RipGradeResult };
      if (!json?.success || !json?.data) throw new Error('Unexpected response');
      setResult(json.data);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to analyze set');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const onSetChange = (setId: string) => {
    setSelectedSetId(setId);
    void analyze(setId, packPrice);
  };

  const onPackPriceChange = (value: string) => {
    setPackPrice(value);
    if (result) {
      void analyze(selectedSetId, value);
    }
  };

  const ev = useMemo(() => result?.evPerPack ?? 0, [result]);
  const packCost = useMemo(() => Number(packPrice) || 0, [packPrice]);
  const evDelta = ev - packCost;
  const evPercent = packCost > 0 ? (evDelta / packCost) * 100 : 0;

  const maxTierLabel = (key: string) => RARITY_LABELS[key] ?? key;

  return (
    <div className="section-stack">
      <div>
        <SectionLabel className="text-accent/90">Rip &amp; grade calculator</SectionLabel>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink-primary">
          Rip &amp; Grade Calculator
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Estimate the expected value of a booster pack and see which cards are worth grading.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border-default bg-surface p-5">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Set
          </label>
          <select
            value={selectedSetId}
            onChange={(e) => onSetChange(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-sm text-ink-primary focus:border-accent/50 focus:outline-none"
          >
            <option value="">Select a set...</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.series})
              </option>
            ))}
          </select>

          <label className="mt-4 mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Pack price ($)
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={packPrice}
            onChange={(e) => onPackPriceChange(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-sm text-ink-primary focus:border-accent/50 focus:outline-none"
          />

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-border-default bg-surface-inset/50 p-3 text-xs text-ink-muted">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p>
              Expected value uses a simplified pull-rate model (commons x8, uncommons x3, rare slot x1)
              combined with each rarity tier's average market price. Real pull rates vary by set - treat
              this as a rough guide.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border-default bg-surface p-5">
          {loading ? (
            <div className="flex h-full items-center justify-center py-10 text-sm text-ink-muted">
              Crunching numbers...
            </div>
          ) : result ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-muted">Expected value / pack</span>
                <span className="font-display text-2xl font-bold text-ink-primary">
                  {formatCurrency(ev)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-muted">Pack cost</span>
                <span className="font-display text-2xl font-bold text-ink-primary">
                  {formatCurrency(packCost)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-muted">Edge</span>
                <span
                  className={`font-display text-2xl font-bold ${
                    evDelta >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {evDelta >= 0 ? '+' : ''}
                  {formatCurrency(evDelta)}
                  {packCost > 0 && (
                    <span className="ml-1 text-sm font-medium opacity-80">
                      ({evPercent >= 0 ? '+' : ''}
                      {evPercent.toFixed(1)}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-inset">
                <div
                  className={`h-full rounded-full transition-all ${
                    evDelta >= 0 ? 'bg-emerald-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.abs(evPercent))}%` }}
                />
              </div>
              <p className="text-xs text-ink-muted">
                Based on {result.pricedCards.toLocaleString()} of {result.totalCards.toLocaleString()}{' '}
                cards with pricing data.
              </p>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center py-10 text-center text-sm text-ink-muted">
              <Dice5 className="mr-2 h-5 w-5" />
              Pick a set to see pack EV
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="rounded-2xl border border-border-default bg-surface p-5">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-ink-primary">
              <Dice5 className="h-4 w-4 text-accent" />
              Pull value by rarity
            </h2>
            <div className="space-y-3">
              {result.evBreakdown
                .filter((b) => b.expectedValue > 0)
                .map((b) => (
                  <div key={b.rarity}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_BADGES[b.rarity] ?? 'bg-slate-500/10 text-slate-400'}`}
                        >
                          {maxTierLabel(b.rarity)}
                        </span>
                        <span className="text-xs text-ink-muted">
                          x{b.pullRate} · avg {formatCurrency(b.avgPrice)}
                        </span>
                      </span>
                      <span className="font-semibold text-ink-primary">
                        {formatCurrency(b.expectedValue)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-inset">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{
                          width: `${result.evPerPack > 0 ? (b.expectedValue / result.evPerPack) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border-default bg-surface p-5">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-ink-primary">
              <Gem className="h-4 w-4 text-accent" />
              Top grade opportunities
            </h2>
            {result.gradeOpportunities.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No graded price data available for this set yet.
              </p>
            ) : (
              <div className="space-y-2">
                {result.gradeOpportunities.map((card) => (
                  <div
                    key={card.uniqueIdentifier}
                    className="flex items-center gap-3 rounded-xl border border-border-default bg-surface-inset/40 p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink-primary">
                        {card.cardName}
                      </div>
                      <div className="text-xs text-ink-muted">
                        Raw {formatCurrency(card.rawPrice)}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="flex items-center gap-1 font-semibold text-ink-primary">
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                        PSA 10 {formatCurrency(card.psa10Price)}
                      </div>
                      <div className="text-xs font-semibold text-emerald-400">
                        +{formatCurrency(card.uplift)} (+{card.upliftPercent.toFixed(0)}%)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
