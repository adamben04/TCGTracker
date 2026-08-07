import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render } from '../../test/utils';
import { server } from '../../test/msw/server';
import { http, HttpResponse } from 'msw';
import { LoginPage } from '../LoginPage';
import { AuthProvider } from '../../hooks/useAuth';
import { TEST_USER } from '../../test/msw/handlers';

function HomeStub() {
  return <div data-testid="home-page">Home</div>;
}

function renderLoginPage(initialPath = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<HomeStub />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('logs in successfully and redirects to home', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await screen.findByRole('heading', { name: /welcome back/i });

    await user.type(screen.getByLabelText(/email/i), TEST_USER.email);
    await user.type(screen.getByLabelText(/^password$/i), 'correct-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });

    expect(localStorage.getItem('tcgtracker_user')).toContain(TEST_USER.email);
  });

  it('shows an error message and stays on the page for invalid credentials', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await screen.findByRole('heading', { name: /welcome back/i });

    await user.type(screen.getByLabelText(/email/i), TEST_USER.email);
    await user.type(screen.getByLabelText(/^password$/i), 'totally-wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/request failed with status code 401/i)).toBeInTheDocument();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  });

  it('shows a validation message when fields are left empty', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await screen.findByRole('heading', { name: /welcome back/i });
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/please fill in all fields/i)).toBeInTheDocument();
  });

  it('surfaces a server error message from the login endpoint', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ message: 'Account temporarily locked' }, { status: 423 })
      )
    );
    const user = userEvent.setup();
    renderLoginPage();

    await screen.findByRole('heading', { name: /welcome back/i });
    await user.type(screen.getByLabelText(/email/i), TEST_USER.email);
    await user.type(screen.getByLabelText(/^password$/i), 'correct-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/request failed with status code 423/i)).toBeInTheDocument();
  });
});
