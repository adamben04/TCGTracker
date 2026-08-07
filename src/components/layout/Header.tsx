import React from 'react';
import { Link } from 'react-router-dom';
import { Database, Moon, Search, Sun } from 'lucide-react';
import { UserMenu } from './UserMenu';
import { openCommandPalette } from '../common/commandPaletteEvents';
import { useTheme } from '../../hooks/useTheme';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.userAgent
  );

export const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface-base/95 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2.5 transition-opacity duration-150 md:hidden"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/40 bg-accent-muted">
            <span className="text-sm font-semibold tracking-tight text-accent">T</span>
          </div>
          <span className="text-base font-semibold tracking-tight text-ink-primary">
            TCGTracker
          </span>
        </Link>

        <Badge tone="neutral" className="hidden gap-1.5 md:inline-flex">
          <Database className="h-3.5 w-3.5" aria-hidden="true" />
          Local-first
        </Badge>

        <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3 md:flex-none">
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden h-10 w-72 items-center gap-2 rounded-lg border border-border-default bg-surface-inset px-3 text-sm text-ink-muted transition-colors duration-150 hover:border-border-strong hover:text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:flex"
            aria-label="Open command palette"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="flex-1 text-left font-medium">Search cards and tools</span>
            <kbd className="rounded border border-border-subtle bg-surface-raised px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink-secondary">
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>

          <Button
            onClick={openCommandPalette}
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Search"
          >
            <Search className="h-[18px] w-[18px]" />
          </Button>

          <Button
            onClick={toggleTheme}
            variant="ghost"
            size="icon"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span key={theme} className="flex">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </span>
          </Button>

          <UserMenu />
        </div>
      </div>
    </header>
  );
};
