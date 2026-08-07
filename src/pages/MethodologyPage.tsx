import { Cloud, Database, LineChart, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Surface } from '../components/ui/Surface';

const sections = [
  {
    title: 'Market prices',
    icon: LineChart,
    body: 'Card prices are aggregated from external catalog and marketplace feeds. A displayed market price is an estimate for a specific printing and finish—not a guaranteed sale price. Condition, grading, fees, taxes, and liquidity can materially change realized value.',
  },
  {
    title: 'Predictions and grading',
    icon: ShieldCheck,
    body: 'Prediction, investment, and grading outputs are decision-support estimates. They can be incomplete or wrong and should not replace recent comparable sales, professional grading, or independent research.',
  },
  {
    title: 'Local-first data',
    icon: Database,
    body: 'Anonymous collection data is stored on this device. Export important local collections regularly. Account-backed features may synchronize with the API when you are signed in.',
  },
  {
    title: 'Cloud availability',
    icon: Cloud,
    body: 'The free-tier API and scanner can sleep when idle, so the first request may be slower. The interface preserves local data and surfaces failures rather than treating unavailable cloud services as successful.',
  },
];

export function MethodologyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow="Trust and methodology"
        title="How TCGTracker handles data"
        description="A plain-language guide to price estimates, model output, persistence, and service availability."
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {sections.map(({ title, icon: Icon, body }) => (
          <Surface key={title} className="p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-muted text-accent">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-base font-semibold text-ink-primary">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-secondary">{body}</p>
          </Surface>
        ))}
      </div>

      <Surface tone="inset" className="mt-6 p-5">
        <h2 className="text-base font-semibold text-ink-primary">Data sources</h2>
        <p className="mt-2 text-sm leading-6 text-ink-secondary">
          Pokémon catalog data is sourced from the Pokémon TCG API and marketplace pricing feeds.
          One Piece catalog data comes from configured OPTCG providers. Source freshness varies by
          endpoint; screens identify estimates and local-only data where it matters.
        </p>
      </Surface>
    </div>
  );
}
