import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, LogIn, LogOut, Settings, Vault } from 'lucide-react';
import { authService, User as AuthUser } from '../../services/authService';

const menuItemClass =
  'flex w-full cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm text-ink-secondary outline-none hover:bg-surface-hover data-[highlighted]:bg-surface-hover';

export const UserMenu: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(authService.getUser());
  }, []);

  const displayName = user?.username ?? 'Collector';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md border border-border-default bg-surface-raised py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-surface-hover"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-muted text-xs font-bold text-accent">
            {initials}
          </span>
          <span className="hidden max-w-[100px] truncate text-sm font-medium text-ink-secondary sm:block">
            {displayName}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-52 overflow-hidden rounded-lg border border-border-default bg-surface-overlay py-1 shadow-popover animate-fade-in"
        >
          <div className="border-b border-border-subtle px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-ink-primary">{displayName}</p>
            <p className="truncate text-xs text-ink-muted">
              {user?.email ?? 'Guest · local session'}
            </p>
          </div>
          <DropdownMenu.Item onSelect={() => navigate('/vault')} className={menuItemClass}>
            <Vault className="h-4 w-4 text-accent" />
            My Vault
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItemClass}>
            <Settings className="h-4 w-4 text-ink-muted" />
            Settings
          </DropdownMenu.Item>
          {user && (
            <DropdownMenu.Item
              onSelect={() => {
                authService.logout();
                setUser(null);
              }}
              className="flex w-full cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm text-loss outline-none hover:bg-loss-muted data-[highlighted]:bg-loss-muted"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenu.Item>
          )}
          {!user && (
            <DropdownMenu.Item
              onSelect={() => navigate('/login')}
              className="flex w-full cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm text-accent outline-none hover:bg-surface-hover data-[highlighted]:bg-surface-hover"
            >
              <LogIn className="h-4 w-4" />
              Sign in
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
