import { Wallet, TrendingUp, TrendingDown, Layers3 } from 'lucide-react';
import { vaultService } from '../../services/vaultService';
import { formatCurrency } from '../../utils/cardDisplay';
import { Surface } from '../ui/Surface';

export const PortfolioSummary: React.FC = () => {
  const stats = vaultService.getVaultStats();
  const hasCards = stats.totalCards > 0;

  const items = [
    {
      icon: Layers3,
      label: 'Cards in vault',
      value: hasCards ? stats.totalCards.toLocaleString() : '0',
      helper: hasCards ? 'Across all holdings' : 'Add your first card',
      valueClass: 'text-ink-primary',
    },
    {
      icon: Wallet,
      label: 'Market value',
      value: hasCards ? formatCurrency(stats.currentValue) : '$0.00',
      helper: hasCards ? `Cost basis ${formatCurrency(stats.totalValue)}` : 'No cost basis yet',
      valueClass: 'text-ink-primary',
    },
    {
      icon: stats.profit >= 0 ? TrendingUp : TrendingDown,
      label: 'Profit / loss',
      value: hasCards
        ? `${stats.profit >= 0 ? '+' : ''}${stats.profitPercentage.toFixed(1)}%`
        : '—',
      helper: hasCards ? formatCurrency(stats.profit) : 'Waiting for holdings',
      valueClass: hasCards ? (stats.profit >= 0 ? 'text-gain' : 'text-loss') : 'text-ink-muted',
    },
  ];

  return (
    <section aria-label="Portfolio snapshot" className="grid gap-3 md:grid-cols-3">
      {items.map(({ icon: Icon, label, value, helper, valueClass }) => (
        <Surface key={label} className="flex min-h-28 items-start justify-between gap-4 p-4 sm:p-5">
          <div>
            <p className="text-xs font-medium text-ink-muted">{label}</p>
            <p
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight ${valueClass}`}
            >
              {value}
            </p>
            <p className="mt-1 text-xs text-ink-muted">{helper}</p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-inset text-ink-secondary">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        </Surface>
      ))}
    </section>
  );
};
