import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '../../../test/utils';
import { UserMenu } from '../UserMenu';
import { authService } from '../../../services/authService';

vi.mock('../../../services/authService', () => ({
  authService: {
    getUser: vi.fn(),
    logout: vi.fn(),
  },
}));

const mockedAuthService = vi.mocked(authService);

function renderMenu() {
  return render(
    <MemoryRouter>
      <UserMenu />
    </MemoryRouter>
  );
}

describe('UserMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAuthService.getUser.mockReturnValue({
      id: 1,
      username: 'trainer',
      email: 'trainer@example.com',
      created_at: '',
      updated_at: '',
    });
  });

  it('opens the menu on click and shows the expected actions', async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole('button', { name: /trainer/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');

    await user.click(trigger);

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /my vault/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
  });

  it('moves focus between items with arrow keys and activates the focused item with Enter', async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole('button', { name: /trainer/i });
    trigger.focus();
    await user.keyboard('{ArrowDown}');

    const vaultItem = await screen.findByRole('menuitem', { name: /my vault/i });
    expect(vaultItem).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /settings/i })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(mockedAuthService.logout).toHaveBeenCalledTimes(1);
  });

  it('closes the menu on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole('button', { name: /trainer/i });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('shows a sign-in action instead of sign-out for guests', async () => {
    mockedAuthService.getUser.mockReturnValue(null);
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /collector/i }));

    expect(screen.getByRole('menuitem', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument();
  });
});
