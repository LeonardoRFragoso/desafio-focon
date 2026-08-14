import { useState, useEffect, useCallback } from 'react';
import type { AdminFilterValues } from '@/types/admin';

const STORAGE_KEY = 'foconflow_admin_filters';

/**
 * Custom hook for persisting admin filters to localStorage
 */
export function usePersistedFilters() {
  const [filters, setFiltersState] = useState<AdminFilterValues>({
    projectId: '',
    projectName: '',
    professionalId: '',
    professionalName: '',
    startDate: '',
    endDate: '',
  });

  // Load filters from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AdminFilterValues;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFiltersState(parsed);
      }
    } catch (err) {
      console.error('Failed to load persisted filters:', err);
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
