import { describe, it, expect } from 'vitest';

/**
 * Smoke test: verify the HTML document declares the correct language.
 * The app is a Brazilian Portuguese (pt-BR) application.
 *
 * Uses Vite's import.meta.glob to read index.html at test time without
 * requiring Node.js types (which are not available in tsconfig.app.json).
 */
const htmlFiles = import.meta.glob('/index.html', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('index.html lang attribute', () => {
  it('declares lang="pt-BR"', () => {
    const html = htmlFiles['/index.html'] as string;
    expect(html).toBeDefined();
    expect(html).toContain('<html lang="pt-BR">');
  });
});
