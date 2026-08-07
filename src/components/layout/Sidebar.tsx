import { NavLink } from 'react-router-dom';
import { CircleDot, LockKeyhole, Swords, type LucideIcon } from 'lucide-react';
import { navigationGroups, navigationItems } from '../../config/navigation';
import { useGame, GameType } from '../../contexts/GameContext';

const GAME_OPTIONS: { value: GameType; label: string; icon: LucideIcon }[] = [
  { value: 'pokemon', label: 'Pokémon', icon: CircleDot },
  { value: 'onepiece', label: 'One Piece', icon: Swords },
];

export const Sidebar = () => {
  const { game, setGame } = useGame();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-border-subtle bg-surface-raised md:flex md:flex-col">
      <div className="flex h-16 items-center border-b border-border-subtle px-4">
        <NavLink to="/" className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-accent/40 bg-accent-muted">
            <span className="text-sm font-semibold tracking-tight text-accent">T</span>
          </div>
          <span className="text-base font-semibold tracking-tight text-ink-primary">
            TCGTracker
          </span>
        </NavLink>
      </div>

      <div className="relative px-3 py-3">
        <div className="flex rounded-lg border border-border-default bg-surface-inset p-1">
          {GAME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setGame(value)}
              aria-pressed={game === value}
              className={`flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${
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
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 pb-4">
        {navigationGroups.map((group, groupIndex) => {
          const items = navigationItems.filter((item) => item.group === group);
          return (
            <div key={group}>
              {groupIndex > 0 && (
                <div className="mx-2 my-4 h-px bg-border-subtle" aria-hidden="true" />
              )}
              <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                {group}
              </p>
              <ul className="space-y-0.5">
                {items.map(({ path, label, icon: Icon, end, requiresAuth }) => (
                  <li key={path}>
                    <NavLink
                      to={path}
                      end={end}
                      className={({ isActive }) =>
                        `group relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                          isActive
                            ? 'bg-accent-muted text-ink-primary'
                            : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
                        }`
                      }
                    >
                      <Icon
                        className="h-4 w-4 shrink-0 text-ink-muted transition-colors duration-150 group-hover:text-ink-primary"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      {requiresAuth && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted">
                          <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="sr-only">Sign-in required</span>
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border-subtle px-3 py-3">
        <div className="text-xs text-ink-muted">Local-first workspace · v2.0</div>
      </div>
    </aside>
  );
};
