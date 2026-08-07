import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

type SurfaceTone = 'raised' | 'inset' | 'accent';

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  tone?: SurfaceTone;
  interactive?: boolean;
}

const toneClasses: Record<SurfaceTone, string> = {
  raised: 'border-border-default bg-surface-raised',
  inset: 'border-border-subtle bg-surface-inset',
  accent: 'border-accent/25 bg-accent-muted',
};

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, tone = 'raised', interactive = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border shadow-xs',
        toneClasses[tone],
        interactive && 'transition-colors duration-150 hover:border-border-strong',
        className
      )}
      {...props}
    />
  )
);

Surface.displayName = 'Surface';
