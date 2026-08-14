import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedFilters } from './usePersistedFilters';
import type { AdminFilterValues } from '@/types/admin';

/**
 * Tests for usePersistedFilters hook with real implementation
 */

describe('usePersistedFilters', () => {
  const STORAGE_KEY = 'foconflow_admin_filters';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should initialize with empty filters from localStorage', () => {
    const { result } = renderHook(() => usePersistedFilters());

    expect(result.current.filters.projectId).toBe('');
    expect(result.current.filters.professionalId).toBe('');
    expect(result.current.filters.startDate).toBe('');
    expect(result.current.filters.endDate).toBe('');
  });

  it('should persist filters to localStorage when setFilters is called', () => {
    const { result } = renderHook(() => usePersistedFilters());

    const newFilters: AdminFilterValues = {
      projectId: 'proj-123',
      projectName: 'Project A',
      professionalId: 'prof-456',
      professionalName: 'John Doe',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    };

    act(() => {
      result.current.setFilters(newFilters);
    });

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).toBeTruthy();

    const parsed = JSON.parse(stored!);
    expect(parsed.projectId).toBe('proj-123');
    expect(parsed.professionalId).toBe('prof-456');
  });

  it('should restore filters from localStorage on mount', () => {
    const savedFilters: AdminFilterValues = {
      projectId: 'proj-789',
      projectName: 'Project B',
      professionalId: 'prof-999',
      professionalName: 'Jane Smith',
      startDate: '2024-06-01',
      endDate: '2024-06-30',
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedFilters));

    const { result } = renderHook(() => usePersistedFilters());

    expect(result.current.filters.projectId).toBe('proj-789');
    expect(result.current.filters.professionalId).toBe('prof-999');
    expect(result.current.filters.startDate).toBe('2024-06-01');
  });

  it('should clear filters from localStorage when clearFilters is called', () => {
    const { result } = renderHook(() => usePersistedFilters());

    const newFilters: AdminFilterValues = {
      projectId: 'proj-123',
      projectName: 'Project A',
      professionalId: 'prof-456',
      professionalName: 'John Doe',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    };

    act(() => {
      result.current.setFilters(newFilters);
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();

    act(() => {
      result.current.clearFilters();
    });

    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;

    expect(parsed.projectId).toBe('');
    expect(parsed.professionalId).toBe('');
  });

  it('should handle invalid JSON gracefully and use defaults', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid json');

    const { result } = renderHook(() => usePersistedFilters());

    // Should fall back to empty filters
    expect(result.current.filters.projectId).toBe('');
    expect(result.current.filters.professionalId).toBe('');
  });

  it('should handle incomplete filters from old versions', () => {
    const incompleteFilters = { projectId: 'proj-123' };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(incompleteFilters));

    const { result } = renderHook(() => usePersistedFilters());

    // Should merge with defaults
    expect(result.current.filters.projectId).toBe('proj-123');
    expect(result.current.filters.professionalId).toBe('');
    expect(result.current.filters.startDate).toBe('');
  });
});
