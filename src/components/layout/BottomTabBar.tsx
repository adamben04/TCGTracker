import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CircleDot, LockKeyhole, MoreHorizontal, Swords, X, type LucideIcon } from 'lucide-react';
import {
  isNavigationItemActive,
  mobileDestinationOrder,
  navigationItems,
  type NavigationItem,
} from '../../config/navigation';
import { useGame, GameType } from '../../contexts/GameContext';

const GAME_OPTIONS: { value: GameType; label: string; icon: LucideIcon }[] = [
  { value: 'pokemon', label: 'Pokémon', icon: CircleDot },
  { value: 'onepiece', label: 'One Piece', icon: Swords },
];

const mobileTabs = mobileDestinationOrder.map((destination) => {
  const item = navigationItems.find((navigationItem) => navigationItem.mobile === destination);
  if (!item) throw new Error(`Missing mobile destination: ${destination}`);
  return item;
});
const moreItems = navigationItems.filter((item) => item.mobile === 'more');

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex h-full min-w-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-150 ${
    isActive ? 'text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'
  }`;

const TabIndicator = ({ isActive }: { isActive: boolean }) => (
  <span
    className={`absolute top-0 h-0.5 w-8 rounded-b bg-accent transition-opacity duration-150 ${
      isActive ? 'opacity-100' : 'opacity-0'
    }`}
    aria-hidden="true"
  />
);

export const BottomTabBar = () => {
  const [moreOpen, setMoreOpen] = useState(false);
  const { game, setGame } = useGame();
  const location = useLocation();
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;

    const trigger = moreTriggerRef.current;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMoreOpen(false);
        return;
      }

      if (event.key !== 'Tab') return;
      const focusableElements = sheetRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusableElements?.length) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      trigger?.focus();
    };
  }, [moreOpen]);

  const moreActive = moreItems.some((item) => isNavigationItemActive(item, location.pathname));
  const renderMobileTab = (item: NavigationItem) => {
    const Icon = item.icon;
    if (item.mobile === 'scan') {
      return (
        <NavLink
          key={item.path}
          to={item.path}
          aria-label={item.title}
          className={({ isActive }) =>
            `relative -mt-2 flex flex-col items-center justify-start gap-1 text-[11px] font-medium ${
              isActive ? 'text-ink-primary' : 'text-ink-muted'
            }`
          }
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/50 bg-accent text-[color:var(--accent-foreground)] shadow-md transition-transform duration-150 active:scale-95">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          {item.label}
        </NavLink>
      );
    }

    return (
      <NavLink key={item.path} to={item.path} end={item.end} className={tabClass}>
        {({ isActive }) => (
          <>
            <TabIndicator isActive={isActive} />
            <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
            {item.label}
          </>
        )}
      </NavLink>
    );
  };

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] md:hidden"
          onMouseDown={() => setMoreOpen(false)}
          aria-hidden="true"
        />
      )}

      {moreOpen && (
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="more-destinations-title"
          className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 animate-slide-up overflow-hidden rounded-2xl border border-border-strong bg-surface-overlay shadow-elevated md:hidden"
        >
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <h2 id="more-destinations-title" className="text-base font-semibold text-ink-primary">
              More destinations
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setMoreOpen(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink-primary"
              aria-label="Close more destinations"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="m-3 flex rounded-lg border border-border-default bg-surface-inset p-1">
            {GAME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setGame(value)}
                aria-pressed={game === value}
                className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${
                  game === value
                    ? 'bg-surface-raised text-ink-primary shadow-xs'
                    : 'text-ink-muted hover:text-ink-primary'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[55vh] overflow-y-auto py-1">
            {moreItems.map(({ path, label, icon: Icon, end, requiresAuth }) => (
              <NavLink
                key={path}
                to={path}
                end={end}
                className={({ isActive }) =>
                  `mx-2 flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent-muted text-ink-primary'
                      : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
                  }`
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="min-w-0 flex-1">{label}</span>
                {requiresAuth && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted">
                    <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">Sign-in required</span>
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <nav
        aria-label="Mobile"
        className="fixed inset-x-0 bottom-0 z-50 h-16 border-t border-border-subtle bg-surface-base/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div className="mx-auto flex h-16 max-w-md items-stretch justify-around px-2">
          {mobileTabs.map(renderMobileTab)}

          <button
            ref={moreTriggerRef}
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className={`relative flex h-full min-w-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-150 ${
              moreActive || moreOpen
                ? 'text-ink-primary'
                : 'text-ink-muted hover:text-ink-secondary'
            }`}
          >
            <TabIndicator isActive={moreActive || moreOpen} />
            <MoreHorizontal className="h-[22px] w-[22px]" aria-hidden="true" />
            More
          </button>
        </div>
      </nav>
    </>
  );
};
