import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Smoke test: verify the HTML document declares the correct language.
 * The app is a Brazilian Portuguese (pt-BR) application.
 */
describe('index.html lang attribute', () => {
  it('declares lang="pt-BR"', () => {
    const htmlPath = resolve(__dirname, '../../index.html');
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('<html lang="pt-BR">');
  });
});
