import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { render } from '../../../test/utils';
import { axe } from '../../../test/axe';
import { Header } from '../Header';
import { ThemeProvider } from '../../../hooks/useTheme';

// Smoke test for the app shell's top navigation bar: renders without a
// provider crash and has no serious/critical accessibility violations.
// (The full app shell also includes the 3D-heavy Sidebar/BottomTabBar,
// which are out of scope for a fast jsdom smoke test.)
describe('Header (app shell)', () => {
  it('renders the primary navigation controls', () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <Header />
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tcgtracker/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open command palette/i })).toBeInTheDocument();
  });

  it('has no serious/critical axe violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <ThemeProvider>
          <Header />
        </ThemeProvider>
      </MemoryRouter>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
