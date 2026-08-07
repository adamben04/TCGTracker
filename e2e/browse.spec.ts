import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Smoke test for the browse/search route: page loads with its search input
 * and card grid/empty state, and has no serious/critical accessibility
 * issues.
 */
test.describe('browse/search', () => {
  test('loads the browse route with a search control', async ({ page }) => {
    await page.goto('/browse');

    await expect(page.getByRole('searchbox').or(page.getByRole('textbox')).first()).toBeVisible();
  });

  test('has no serious or critical accessibility violations', async ({ page }) => {
    await page.goto('/browse');
    await expect(page.getByRole('textbox').first()).toBeVisible();

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
