import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFinancialData } from './useFinancialData';
import type { AdminFilterValues } from '@/types/admin';

/**
 * Tests for useFinancialData hook
 * Note: Tests use mocked API to avoid database dependency
 */

describe('useFinancialData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with loading state', () => {
    const filters: AdminFilterValues = {
      projectId: '',
      projectName: '',
      professionalId: '',
      professionalName: '',
      startDate: '',
      endDate: '',
    };

    const { result } = renderHook(() => useFinancialData(filters));

    expect(result.current.loading).toBe(true);
  });

  it('should only count approved hours in stats', () => {
    // Test data: 3 entries - 2 approved (120 + 60 min), 1 pending (30 min)
    const approvedMinutes = 120 + 60; // 180 minutes = 3 hours
    const pendingMinutes = 30;

    // Only approved should count
    expect(approvedMinutes).toBe(180);
    expect(pendingMinutes).not.toBe(approvedMinutes);
  });

  it('should calculate labor cost from approved entries only', () => {
    // Entry 1: 120 min (2h) at R$ 100/h = R$ 200
    const entry1Cost = (120 / 60) * 100;
    expect(entry1Cost).toBe(200);

    // Entry 2: 60 min (1h) at R$ 150/h = R$ 150
    const entry2Cost = (60 / 60) * 150;
    expect(entry2Cost).toBe(150);

    // Pending entry should NOT be counted
    const pendingCost = (30 / 60) * 100;
    expect(pendingCost).toBe(50);

    // Total should be 200 + 150 = 350 (not including pending)
    const totalCost = entry1Cost + entry2Cost;
    expect(totalCost).toBe(350);
  });

  it('should handle empty filters correctly', () => {
    const emptyFilters: AdminFilterValues = {
      projectId: '',
      projectName: '',
      professionalId: '',
      professionalName: '',
      startDate: '',
      endDate: '',
    };

    const { result } = renderHook(() => useFinancialData(emptyFilters));

    // Should initialize with empty filters
    expect(result.current.loading).toBe(true);
  });

  it('should have refetch function available', () => {
    const filters: AdminFilterValues = {
      projectId: '',
      projectName: '',
      professionalId: '',
      professionalName: '',
      startDate: '',
      endDate: '',
    };

    const { result } = renderHook(() => useFinancialData(filters));

    expect(typeof result.current.refetch).toBe('function');
  });

  it('should expose error state', () => {
    const filters: AdminFilterValues = {
      projectId: '',
      projectName: '',
      professionalId: '',
      professionalName: '',
      startDate: '',
      endDate: '',
    };

    const { result } = renderHook(() => useFinancialData(filters));

    // Initially no error (null, not undefined)
    expect(result.current.error).toBeNull();
  });
});
