import { http, HttpResponse } from 'msw';

/**
 * Default MSW v2 request handlers shared across component/unit tests.
 *
 * These cover the auth flow (register/login/logout/me/update/change-password)
 * plus a few "core" read endpoints (`/api/cards/*`, `/api/portfolio`) that
 * are hit incidentally by app code during auth (e.g. vault sync on login).
 *
 * Handlers use relative paths so they match regardless of the resolved
 * origin (`buildApiUrl` in `src/config/env.ts` targets `window.location.origin`
 * in dev/test builds). Individual tests can override any handler for a
 * single test with `server.use(...)` — see `src/test/msw/server.ts`.
 */

export const TEST_USER = {
  id: 1,
  username: 'testcollector',
  email: 'collector@example.com',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

export const authHandlers = [
  http.post('/api/auth/register', () =>
    HttpResponse.json({ user: TEST_USER, token: 'test-token' }, { status: 201 })
  ),

  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    if (body?.email === TEST_USER.email && body?.password === 'correct-password') {
      return HttpResponse.json({ user: TEST_USER, token: 'test-token' }, { status: 200 });
    }
    return HttpResponse.json({ message: 'Invalid email or password' }, { status: 401 });
  }),

  http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })),

  http.get('/api/auth/me', () => HttpResponse.json({ user: null }, { status: 200 })),

  http.put('/api/auth/update', () => HttpResponse.json({ user: TEST_USER }, { status: 200 })),

  http.post('/api/auth/change-password', () => new HttpResponse(null, { status: 204 })),
];

export const coreApiHandlers = [
  http.get('/api/cards/pokemon', () => HttpResponse.json({ data: [], totalCount: 0 })),
  http.get('/api/cards/sets', () => HttpResponse.json({ data: [] })),
  http.get('/api/cards/search', () => HttpResponse.json({ data: [] })),
  http.get('/api/portfolio', () => HttpResponse.json({ success: true, data: { collection: [] } })),
  http.post('/api/portfolio/sync', () => HttpResponse.json({ success: true, data: { synced: 0 } })),
];

export const handlers = [...authHandlers, ...coreApiHandlers];
