import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * Shared MSW server instance for Vitest. Wired into the global lifecycle in
 * `src/test/setup.ts` (listen/resetHandlers/close). Import `server` directly
 * in a test to call `server.use(...)` for a one-off handler override — it is
 * automatically reset after each test via `resetHandlers()`.
 */
export const server = setupServer(...handlers);
