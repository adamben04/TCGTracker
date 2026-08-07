import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  applyTheme,
  getStoredTheme,
  getSystemTheme,
  initTheme,
  resolveTheme,
  setThemePreference,
} from '../theme';

const STORAGE_KEY = 'tcg.theme';

function mockMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe('theme utilities', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    mockMatchMedia(false);
  });

  describe('getSystemTheme', () => {
    it('returns dark when the OS prefers dark mode', () => {
      mockMatchMedia(true);
      expect(getSystemTheme()).toBe('dark');
    });

    it('returns light when the OS prefers light mode', () => {
      mockMatchMedia(false);
      expect(getSystemTheme()).toBe('light');
    });
  });

  describe('getStoredTheme', () => {
    it('returns null when nothing is stored', () => {
      expect(getStoredTheme()).toBeNull();
    });

    it('returns the stored theme when valid', () => {
      localStorage.setItem(STORAGE_KEY, 'dark');
      expect(getStoredTheme()).toBe('dark');
    });

    it('ignores unrecognized stored values', () => {
      localStorage.setItem(STORAGE_KEY, 'not-a-theme');
      expect(getStoredTheme()).toBeNull();
    });

    it('returns null if localStorage access throws', () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('access denied');
      });
      expect(getStoredTheme()).toBeNull();
      spy.mockRestore();
    });
  });

  describe('resolveTheme', () => {
    it('prefers the stored preference over the system theme', () => {
      mockMatchMedia(true); // system says dark
      localStorage.setItem(STORAGE_KEY, 'light');
      expect(resolveTheme()).toBe('light');
    });

    it('falls back to the system theme when nothing is stored', () => {
      mockMatchMedia(true);
      expect(resolveTheme()).toBe('dark');
    });
  });

  describe('applyTheme / setThemePreference / initTheme', () => {
    it('applyTheme sets the data-theme attribute on the document root', () => {
      applyTheme('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      applyTheme('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('setThemePreference persists the choice and applies it', () => {
      setThemePreference('dark');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('initTheme applies the resolved theme before first render', () => {
      localStorage.setItem(STORAGE_KEY, 'dark');
      initTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });
});
