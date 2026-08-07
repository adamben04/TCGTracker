import type { HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

type BadgeTone = 'neutral' | 'accent' | 'gain' | 'loss' | 'warning';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'border-border-default bg-surface-inset text-ink-secondary',
  accent: 'border-accent/30 bg-accent-muted text-accent',
  gain: 'border-gain/30 bg-gain-muted text-gain',
  loss: 'border-loss/30 bg-loss-muted text-loss',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
};

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
