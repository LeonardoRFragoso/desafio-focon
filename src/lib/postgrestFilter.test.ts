import { describe, it, expect } from 'vitest';
import { sanitizePostgrestValue, buildIlikeOrFilter } from './postgrestFilter';

describe('sanitizePostgrestValue', () => {
  it('passes through plain alphanumeric text unchanged', () => {
    expect(sanitizePostgrestValue('john doe 123')).toBe('john doe 123');
  });

  it('escapes commas (condition separator)', () => {
    expect(sanitizePostgrestValue('foo,bar')).toBe('foo\\,bar');
  });

  it('escapes dots (column/operator separator)', () => {
    expect(sanitizePostgrestValue('foo.bar')).toBe('foo\\.bar');
  });

  it('escapes parentheses (nested filter syntax)', () => {
    expect(sanitizePostgrestValue('foo(bar)')).toBe('foo\\(bar\\)');
  });

  it('escapes backslashes first to avoid double-escaping', () => {
    expect(sanitizePostgrestValue('foo\\,bar')).toBe('foo\\\\\\,bar');
  });

  it('escapes all special characters together', () => {
    expect(sanitizePostgrestValue('a,b.c(d)e\\f')).toBe('a\\,b\\.c\\(d\\)e\\\\f');
  });

  it('handles empty string', () => {
    expect(sanitizePostgrestValue('')).toBe('');
  });

  it('neutralizes a filter injection attempt', () => {
    // A malicious search term that tries to inject an extra condition
    const malicious = 'foo,description.eq.bar';
    const sanitized = sanitizePostgrestValue(malicious);
    // The comma is escaped, so PostgREST will treat it as a literal value
    expect(sanitized).toBe('foo\\,description\\.eq\\.bar');
    // No unescaped comma remains
    expect(sanitized).not.toMatch(/(?<!\\),/);
  });
});

describe('buildIlikeOrFilter', () => {
  it('builds a single-column ilike filter', () => {
    expect(buildIlikeOrFilter('john', ['description'])).toBe('description.ilike.%john%');
  });

  it('builds a multi-column or filter', () => {
    expect(buildIlikeOrFilter('john', ['description', 'project.name'])).toBe(
      'description.ilike.%john%,project.name.ilike.%john%'
    );
  });

  it('sanitizes the search term in the filter', () => {
    const filter = buildIlikeOrFilter('foo,bar', ['description']);
    // The comma must be escaped so it doesn't split into two conditions
    expect(filter).toBe('description.ilike.%foo\\,bar%');
  });

  it('neutralizes filter injection in the built filter', () => {
    const malicious = 'foo,description.eq.bar';
    const filter = buildIlikeOrFilter(malicious, ['description', 'project.name']);
    // The result should have exactly one comma (the condition separator)
    // and all commas in the search term should be escaped.
    const unescapedCommas = filter.match(/(?<!\\),/g);
    expect(unescapedCommas).toHaveLength(1); // only the separator between conditions
  });

  it('handles empty columns array', () => {
    expect(buildIlikeOrFilter('john', [])).toBe('');
  });
});
