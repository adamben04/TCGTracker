export type OnboardingStep = 'browse' | 'scan' | 'vault' | 'track';

const STORAGE_KEY = 'tcg.onboarding';

export function readCompletedOnboardingSteps(): Set<OnboardingStep> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as OnboardingStep[]);
  } catch {
    return new Set();
  }
}

export function writeCompletedOnboardingSteps(steps: Set<OnboardingStep>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...steps]));
}

export function markOnboardingStep(step: OnboardingStep) {
  const completed = readCompletedOnboardingSteps();
  if (completed.has(step)) return;
  completed.add(step);
  writeCompletedOnboardingSteps(completed);
  window.dispatchEvent(new CustomEvent('tcg:onboarding-update'));
}
