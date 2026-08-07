import { expect } from 'vitest';
import { axe, toHaveNoViolations, type JestAxeConfigureOptions } from 'jest-axe';

/**
 * jest-axe ships a `toHaveNoViolations` matcher written against Jest's
 * `expect` global, but its shape (an object of `{ toHaveNoViolations: fn }`)
 * is compatible with Vitest's `expect.extend`, which is the same contract
 * Jest uses. This module wires it up for Vitest and re-exports `axe` so
 * tests can do:
 *
 *   import { axe } from '../../test/axe';
 *   const results = await axe(container);
 *   expect(results).toHaveNoViolations();
 */
expect.extend(toHaveNoViolations);

// jest-axe's shipped types only augment Jest's `expect`. Augment Vitest's
// `Assertion` interface here so `expect(results).toHaveNoViolations()`
// type-checks for any test that imports this helper.
declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T extends Promise<unknown> ? Promise<void> : void;
  }
}

export { axe };
export type { JestAxeConfigureOptions };
