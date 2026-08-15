import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Silence React act() warnings in the console output. These warnings
    // come from async state updates (promise resolutions, setTimeout
    // callbacks) that complete after fireEvent's internal act() scope.
    // The tests are correct (they use waitFor to assert on the final
    // state); the warnings are noise from React's scheduler. Fixing every
    // test to wrap every async callback in act() would be a large
    // mechanical change with no functional benefit.
    onConsoleLog(log: string) {
      if (log.includes('not wrapped in act(')) return false;
      return true;
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        // Barrel re-export — no logic to test.
        'src/lib/supabase/api/index.ts',
        // Type-only files — no runtime code.
        'src/types/**',
        // Entry points (main.tsx, App.tsx) — tested via E2E, not unit tests.
        'src/main.tsx',
        'src/App.tsx',
        // Route configuration — tested via integration/E2E.
        'src/routes/**',
      ],
      thresholds: {
        // Set slightly below current levels to prevent regression without
        // blocking the initial rollout. Raise incrementally as tests improve.
        lines: 55,
        functions: 45,
        branches: 45,
        statements: 55,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
