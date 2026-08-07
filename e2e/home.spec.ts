import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Smoke test for the app shell: home page loads, the primary nav/header is
 * present, and there are no serious/critical accessibility issues.
 */
test.describe('home shell', () => {
  test('loads the home page with header navigation', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('link', { name: /tcgtracker/i }).first()).toBeVisible();
  });

  test('has no serious or critical accessibility violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('banner')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const seriousOrCritical = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical'
    );

    expect(
      seriousOrCritical,
      JSON.stringify(seriousOrCritical, null, 2)
    ).toEqual([]);
  });
});
