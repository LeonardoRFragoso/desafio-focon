// Enable React's act() test environment. This is NOT a warning suppression —
// it tells React that we are in a test environment so act() warnings are
// EMITTED (not silenced). Without this, React logs a different warning:
// "The current testing environment is not configured to support act(...)".
// All act() warnings have been fixed at the source in the individual tests.
// Reference: https://github.com/testing-library/react-testing-library/issues/1061
(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;

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
