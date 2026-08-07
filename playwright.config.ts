import { defineConfig, devices } from '@playwright/test';

/**
 * Minimal Playwright config for smoke-testing a deployed build or a local
 * `vite preview` server.
 *
 * - Set PLAYWRIGHT_BASE_URL to point at an already-running deployment
 *   (e.g. a Vercel preview URL) — no local server will be started.
 * - Otherwise this builds nothing itself; it expects `npm run build` to have
 *   already produced `dist/`, and boots `npm run preview` to serve it.
 *
 * Only Chromium is configured — it's the only browser binary guaranteed to
 * be pre-installed in this environment. Run `npx playwright install` (or
 * `npx playwright install --with-deps chromium`) if the chromium browser
 * described in package.json's @playwright/test version isn't present yet.
 */
const PORT = process.env.PLAYWRIGHT_PORT ?? '4173';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run preview -- --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
