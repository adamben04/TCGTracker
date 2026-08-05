import { useState, FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LogIn, Eye, EyeOff, AlertCircle } from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setIsSubmitting(true);
    try {
      await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-xl border border-border-default bg-surface-raised p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10">
            <LogIn className="h-7 w-7 text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-ink-primary">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-muted">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-sm text-loss">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-secondary">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full rounded-lg border border-border-default bg-surface-inset px-3 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink-secondary">Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                className="w-full rounded-lg border border-border-default bg-surface-inset px-3 py-2.5 pr-10 text-sm text-ink-primary placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink-primary"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary w-full justify-center py-2.5"
          >
            {isSubmitting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-accent hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
