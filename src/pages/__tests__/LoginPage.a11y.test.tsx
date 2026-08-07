import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { render } from '../../test/utils';
import { axe } from '../../test/axe';
import { LoginPage } from '../LoginPage';
import { AuthProvider } from '../../hooks/useAuth';

describe('LoginPage accessibility', () => {
  it('has no serious/critical axe violations in its default state', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: /welcome back/i });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
