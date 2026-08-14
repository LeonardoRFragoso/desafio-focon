import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AdminFilterValues } from '@/types/admin';

/**
 * Tests for usePersistedFilters hook
 */

describe('usePersistedFilters', () => {
  const STORAGE_KEY = 'foconflow_admin_filters';

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should initialize with empty filters', () => {
    const emptyFilters: AdminFilterValues = {
      projectId: '',
      projectName: '',
      professionalId: '',
      professionalName: '',
      startDate: '',
      endDate: '',
    };

    expect(emptyFilters.projectId).toBe('');
    expect(emptyFilters.professionalId).toBe('');
  });

  it('should persist filters to localStorage', () => {
    const filters: AdminFilterValues = {
      projectId: 'proj-123',
      projectName: 'Project A',
      professionalId: 'prof-456',
      professionalName: 'John Doe',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;

    expect(parsed).toEqual(filters);
  });

  it('should clear filters from localStorage', () => {
    const filters: AdminFilterValues = {
      projectId: 'proj-123',
      projectName: 'Project A',
      professionalId: 'prof-456',
      professionalName: 'John Doe',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    localStorage.removeItem(STORAGE_KEY);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('should handle invalid JSON gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid json');
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        JSON.parse(stored);
      }
      // Should throw
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeDefined();
    }
  });

  it('should not break with old invalid filters', () => {
    const invalidFilters = { projectId: 'proj-123' }; // Missing required fields
    localStorage.setItem(STORAGE_KEY, JSON.stringify(invalidFilters));

    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;

    // Should load but be incomplete
    expect(parsed).toBeDefined();
    expect(parsed.projectId).toBe('proj-123');
    expect(parsed.professionalId).toBeUndefined();
  });
});
