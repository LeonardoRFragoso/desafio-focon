// Mark the test environment as a React act environment BEFORE importing
// React or testing-library. This is the recommended setup for vitest +
// React 18 + @testing-library/react.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
