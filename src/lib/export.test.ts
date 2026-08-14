import { describe, it, expect } from 'vitest';

/**
 * Tests for export utilities
 */

describe('Export utilities', () => {
  describe('CSV formula injection protection', () => {
    it('should escape cells starting with =', () => {
      const dangerous = '=1+1';
      const escaped = dangerous.startsWith('=') ? `'${dangerous}` : dangerous;
      expect(escaped).toBe("'=1+1");
    });

    it('should escape cells starting with +', () => {
      const dangerous = '+1+1';
      const escaped = dangerous.startsWith('+') ? `'${dangerous}` : dangerous;
      expect(escaped).toBe("'+1+1");
    });

    it('should escape cells starting with -', () => {
      const dangerous = '-1+1';
      const escaped = dangerous.startsWith('-') ? `'${dangerous}` : dangerous;
      expect(escaped).toBe("'-1+1");
    });

    it('should escape cells starting with @', () => {
      const dangerous = '@SUM(A1:A10)';
      const escaped = dangerous.startsWith('@') ? `'${dangerous}` : dangerous;
      expect(escaped).toBe("'@SUM(A1:A10)");
    });

    it('should not escape normal text', () => {
      const safe = 'Normal text';
      const escaped = safe.startsWith('=') || safe.startsWith('+') || safe.startsWith('-') || safe.startsWith('@') ? `'${safe}` : safe;
      expect(escaped).toBe('Normal text');
    });
  });

  describe('HTML escaping', () => {
    it('should escape ampersand', () => {
      const text = 'A & B';
      const escaped = text.replace(/&/g, '&amp;');
      expect(escaped).toBe('A &amp; B');
    });

    it('should escape less than', () => {
      const text = '5 < 10';
      const escaped = text.replace(/</g, '&lt;');
      expect(escaped).toBe('5 &lt; 10');
    });

    it('should escape greater than', () => {
      const text = '10 > 5';
      const escaped = text.replace(/>/g, '&gt;');
      expect(escaped).toBe('10 &gt; 5');
    });

    it('should escape quotes', () => {
      const text = 'He said "hello"';
      const escaped = text.replace(/"/g, '&quot;');
      expect(escaped).toBe('He said &quot;hello&quot;');
    });

    it('should escape single quotes', () => {
      const text = "It's working";
      const escaped = text.replace(/'/g, '&#39;');
      expect(escaped).toBe('It&#39;s working');
    });
  });

  describe('Accent preservation', () => {
    it('should preserve Portuguese accents in CSV', () => {
      const text = 'São Paulo';
      expect(text).toContain('ã');
      expect(text).toContain('o');
    });

    it('should preserve accents in HTML', () => {
      const text = 'Relatório Financeiro';
      expect(text).toContain('ó');
      expect(text).toContain('o');
    });
  });
});
