/* eslint-disable react-refresh/only-export-components -- Testing Library re-exports are test-only. */
import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';

// Custom render function that can be extended with providers
const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) => {
  return render(ui, { ...options });
};

export * from '@testing-library/react';
export { customRender as render };
