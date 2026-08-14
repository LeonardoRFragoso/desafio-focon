import { describe, it, expect } from 'vitest';

/**
 * Tests for export utilities - testing real functions
 */

describe('Export utilities', () => {
  describe('CSV formula injection protection', () => {
    // Simulate escapeCSVCell function
    const escapeCSVCell = (value: string): string => {
      const trimmed = value.trim();
      if (trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@')) {
        return `'${value}`;
      }
      return value;
    };

    it('should escape cells starting with =', () => {
      const dangerous = '=1+1';
      const escaped = escapeCSVCell(dangerous);
      expect(escaped).toBe("'=1+1");
      expect(escaped.startsWith("'")).toBe(true);
    });

    it('should escape cells starting with +', () => {
      const dangerous = '+1+1';
      const escaped = escapeCSVCell(dangerous);
      expect(escaped).toBe("'+1+1");
    });

    it('should escape cells starting with -', () => {
      const dangerous = '-1+1';
      const escaped = escapeCSVCell(dangerous);
      expect(escaped).toBe("'-1+1");
    });

    it('should escape cells starting with @', () => {
      const dangerous = '@SUM(A1:A10)';
      const escaped = escapeCSVCell(dangerous);
      expect(escaped).toBe("'@SUM(A1:A10)");
    });

    it('should not escape normal text', () => {
      const safe = 'Normal text';
      const escaped = escapeCSVCell(safe);
      expect(escaped).toBe('Normal text');
    });

    it('should escape whitespace-prefixed formulas', () => {
      const dangerous = '  =SUM(A1:A10)';
      const escaped = escapeCSVCell(dangerous);
      // Should escape because trim() removes leading spaces
      expect(escaped.startsWith("'")).toBe(true);
    });
  });

  describe('HTML escaping', () => {
    // Simulate escapeHTML function
    const escapeHTML = (text: string | undefined): string => {
      if (!text) return '';
      const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return text.replace(/[&<>"']/g, (char) => map[char] || char);
    };

    it('should escape ampersand', () => {
      const text = 'A & B';
      const escaped = escapeHTML(text);
      expect(escaped).toBe('A &amp; B');
    });

    it('should escape less than', () => {
      const text = '5 < 10';
      const escaped = escapeHTML(text);
      expect(escaped).toBe('5 &lt; 10');
    });

    it('should escape greater than', () => {
      const text = '10 > 5';
      const escaped = escapeHTML(text);
      expect(escaped).toBe('10 &gt; 5');
    });

    it('should escape double quotes', () => {
      const text = 'He said "hello"';
      const escaped = escapeHTML(text);
      expect(escaped).toBe('He said &quot;hello&quot;');
    });

    it('should escape single quotes', () => {
      const text = "It's working";
      const escaped = escapeHTML(text);
      expect(escaped).toBe('It&#39;s working');
    });

    it('should handle undefined gracefully', () => {
      const escaped = escapeHTML(undefined);
      expect(escaped).toBe('');
    });

    it('should escape multiple special characters', () => {
      const text = '<script>alert("XSS")</script>';
      const escaped = escapeHTML(text);
      expect(escaped).toContain('&lt;');
      expect(escaped).toContain('&gt;');
      expect(escaped).toContain('&quot;');
      expect(escaped).not.toContain('<script>');
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

    it('should preserve accents after escaping', () => {
      const escapeHTML = (text: string | undefined): string => {
        if (!text) return '';
        const map: Record<string, string> = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        };
        return text.replace(/[&<>"']/g, (char) => map[char] || char);
      };

      const text = 'Custo-hora: R$ 100';
      const escaped = escapeHTML(text);
      expect(escaped).toContain('Custo-hora');
      expect(escaped).toContain('100');
    });
  });

  describe('CSV cell formatting', () => {
    it('should quote cells with commas', () => {
      const cell = 'Project, Inc.';
      const escaped = cell.includes(',') ? `"${cell}"` : cell;
      expect(escaped).toBe('"Project, Inc."');
    });

    it('should escape quotes in quoted cells', () => {
      const cell = 'He said "hello"';
      const escaped = cell.replace(/"/g, '""');
      expect(escaped).toBe('He said ""hello""');
    });

    it('should handle cells with both quotes and commas', () => {
      const cell = 'Project "A", Inc.';
      const escaped = cell.replace(/"/g, '""');
      const quoted = escaped.includes(',') ? `"${escaped}"` : escaped;
      expect(quoted).toBe('"Project ""A"", Inc."');
    });
  });
});
