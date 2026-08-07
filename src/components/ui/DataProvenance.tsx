import { Clock3, Database } from 'lucide-react';
import { cn } from '../../utils/cn';

interface DataProvenanceProps {
  source: string;
  updatedAt?: string | Date | null;
  qualifier?: string;
  className?: string;
}

function formatFreshness(updatedAt: string | Date): string {
  const timestamp = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime();

  if (!Number.isFinite(timestamp)) return 'Update time unavailable';

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 1) return 'Updated just now';
  if (elapsedMinutes < 60) return `Updated ${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Updated ${elapsedHours}h ago`;

  return `Updated ${new Date(timestamp).toLocaleDateString()}`;
}

export function DataProvenance({ source, updatedAt, qualifier, className }: DataProvenanceProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted',
        className
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <Database className="h-3.5 w-3.5" aria-hidden="true" />
        {source}
      </span>
      {updatedAt ? (
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          {formatFreshness(updatedAt)}
        </span>
      ) : null}
      {qualifier ? <span>{qualifier}</span> : null}
    </div>
  );
}
