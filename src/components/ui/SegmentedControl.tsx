import { cn } from '../../utils/cn';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex rounded-lg border border-border-default bg-surface-inset p-1',
        className
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-8 rounded-md px-3 text-xs font-medium transition-colors',
              selected
                ? 'bg-surface-raised text-ink-primary shadow-xs'
                : 'text-ink-muted hover:text-ink-primary'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
