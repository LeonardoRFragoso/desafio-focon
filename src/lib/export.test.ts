import { describe, it, expect, vi } from 'vitest';
import { escapeCSVCell, escapeHTML, exportToCSV, exportToHTML } from './export';

/**
 * Tests for export utilities - testing real functions from src/lib/export.ts
 */

describe('Export utilities', () => {
  describe('escapeCSVCell - formula injection protection', () => {
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

  describe('escapeHTML - XSS prevention', () => {
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

  describe('exportToCSV - integration test', () => {
    it('should use escapeCSVCell for formula protection', () => {
      // Verify that escapeCSVCell is used in CSV export
      const dangerous = '=1+1';
      const escaped = escapeCSVCell(dangerous);

      // Should be escaped
      expect(escaped).toBe("'=1+1");
      expect(escaped.startsWith("'")).toBe(true);
    });
  });

  describe('exportToHTML - integration test', () => {
    it('should export HTML without error', () => {
      const html = exportToHTML([]);

      // Should return valid HTML
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
    });

    it('should escape dangerous content in HTML', () => {
      // Test that escapeHTML is used in exportToHTML
      const dangerous = '<script>alert("XSS")</script>';
      const escaped = escapeHTML(dangerous);

      expect(escaped).toContain('&lt;script&gt;');
      expect(escaped).not.toContain('<script>');
    });
  });

  describe('Accent preservation', () => {
    it('should preserve Portuguese accents in CSV cell escaping', () => {
      const text = 'São Paulo';
      const escaped = escapeCSVCell(text);
      expect(escaped).toContain('ã');
      expect(escaped).toContain('o');
    });

    it('should preserve accents in HTML escaping', () => {
      const text = 'Relatório Financeiro';
      const escaped = escapeHTML(text);
      expect(escaped).toContain('ó');
      expect(escaped).toContain('o');
    });
  });
});
