import { describe, expect, it } from 'vitest';
import { getDocumentTitle, mobileDestinationOrder, navigationItems } from './navigation';

describe('navigation manifest', () => {
  it('keeps the four direct mobile destinations and exposes Binders in More', () => {
    const directMobileLabels = mobileDestinationOrder.map((destination) => {
      const item = navigationItems.find((navigationItem) => navigationItem.mobile === destination);
      return item?.label;
    });

    expect(directMobileLabels).toEqual(['Home', 'Browse', 'Scan', 'Vault']);
    expect(navigationItems.find((item) => item.path === '/binders')?.mobile).toBe('more');
  });

  it('uses distinct labels and icons for every navigable destination', () => {
    expect(new Set(navigationItems.map((item) => item.label)).size).toBe(navigationItems.length);
    expect(new Set(navigationItems.map((item) => item.icon)).size).toBe(navigationItems.length);
  });

  it('provides useful document titles for route and fallback pages', () => {
    expect(getDocumentTitle('/binders')).toBe('Binders · TCGTracker');
    expect(getDocumentTitle('/sets/base1')).toBe('Set details · TCGTracker');
    expect(getDocumentTitle('/does-not-exist')).toBe('Page not found · TCGTracker');
  });
});
