import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import { OnboardingChecklist, markOnboardingStep } from '../OnboardingChecklist';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('OnboardingChecklist', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('renders the checklist', () => {
    render(
      <MemoryRouter>
        <OnboardingChecklist />
      </MemoryRouter>
    );
    expect(screen.getByText('Getting started')).toBeTruthy();
  });

  it('marks steps when called', () => {
    markOnboardingStep('browse');
    const stored = JSON.parse(localStorageMock.getItem('tcg.onboarding') || '[]');
    expect(stored).toContain('browse');
  });
});
