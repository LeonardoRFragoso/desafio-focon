import { useState, useEffect, useCallback } from 'react';
import type { AdminFilterValues } from '@/types/admin';

const STORAGE_KEY = 'foconflow_admin_filters';

const DEFAULT_FILTERS: AdminFilterValues = {
  projectId: '',
  projectName: '',
  professionalId: '',
  professionalName: '',
  startDate: '',
  endDate: '',
};

/**
 * Custom hook for persisting admin filters to localStorage
 */
export function usePersistedFilters() {
  const [filters, setFiltersState] = useState<AdminFilterValues>(DEFAULT_FILTERS);

  // Load filters from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<AdminFilterValues>;
        // Merge with defaults to handle incomplete data from old versions
        const merged = { ...DEFAULT_FILTERS, ...parsed };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFiltersState(merged);
      }
    } catch (err) {
      console.error('Failed to load persisted filters:', err);
      // Fall back to defaults on parse error
      setFiltersState(DEFAULT_FILTERS);
    }
  }, []);

  // Update filters and persist to localStorage
  const setFilters = useCallback((newFilters: AdminFilterValues) => {
    setFiltersState(newFilters);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newFilters));
    } catch (err) {
      console.error('Failed to persist filters:', err);
    }
  }, []);

  // Clear filters
  const clearFilters = useCallback(() => {
    const emptyFilters: AdminFilterValues = {
      projectId: '',
      projectName: '',
      professionalId: '',
      professionalName: '',
      startDate: '',
      endDate: '',
    };
    setFilters(emptyFilters);
  }, [setFilters]);

  return {
    filters,
    setFilters,
    clearFilters,
  };
}
