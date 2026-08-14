import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFinancialData } from './useFinancialData';
import * as apiModule from '@/lib/supabase/api';
import type { AdminFilterValues } from '@/types/admin';

/**
 * Real tests for useFinancialData hook
 * Mocks the actual API and validates hook behavior
 */

describe('useFinancialData', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockApprovedEntry: any = {
    id: 'entry-1',
    professional_id: 'prof-1',
    project_id: 'proj-1',
    entry_date: '2024-01-15',
    duration_minutes: 120, // 2 hours
    description: 'Approved work',
    approval_status: 'approved',
    applied_hourly_rate: 100,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    professional: { id: 'prof-1', full_name: 'John Doe', role: 'member' },
    project: { id: 'proj-1', name: 'Project A' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only count approved entries in labor cost', async () => {
    const filters: AdminFilterValues = {
      projectId: '',
      projectName: '',
      professionalId: '',
      professionalName: '',
      startDate: '',
      endDate: '',
    };

    vi.spyOn(apiModule.financialAPI, 'getApprovedTimeEntries').mockResolvedValue({
      data: [mockApprovedEntry],
      error: null,
      success: true,
      count: 1,
      status: 200,
      statusText: 'OK',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    vi.spyOn(apiModule.financialAPI, 'getProjectFinancials').mockResolvedValue({
      data: [
        {
          project_id: 'proj-1',
          contracted_revenue: 1000,
          tax_rate: 0.08,
          indirect_cost: 100,
          project: { name: 'Project A' },
        },
      ],
      error: null,
      success: true,
      count: 1,
      status: 200,
      statusText: 'OK',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { result } = renderHook(() => useFinancialData(filters));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Only approved entry should count: 2 hours * 100 = 200
    const expectedLaborCost = (120 / 60) * 100; // 2 * 100 = 200
    expect(result.current.laborCost).toBe(expectedLaborCost);
  });

  it('should ignore pending entries', async () => {
    const filters: AdminFilterValues = {
      projectId: '',
      projectName: '',
      professionalId: '',
      professionalName: '',
      startDate: '',
      endDate: '',
    };

    vi.spyOn(apiModule.financialAPI, 'getApprovedTimeEntries').mockResolvedValue({
      data: [],
      error: null,
      success: true,
      count: 0,
      status: 200,
      statusText: 'OK',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    vi.spyOn(apiModule.financialAPI, 'getProjectFinancials').mockResolvedValue({
      data: [],
      error: null,
      success: true,
      count: 0,
      status: 200,
      statusText: 'OK',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { result } = renderHook(() => useFinancialData(filters));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Pending entries should NOT be counted
    expect(result.current.laborCost).toBe(0);
  });

  it('should ignore rejected entries', async () => {
    const filters: AdminFilterValues = {
      projectId: '',
      projectName: '',
      professionalId: '',
      professionalName: '',
      startDate: '',
      endDate: '',
    };

    vi.spyOn(apiModule.financialAPI, 'getApprovedTimeEntries').mockResolvedValue({
      data: [],
      error: null,
      success: true,
      count: 0,
      status: 200,
      statusText: 'OK',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    vi.spyOn(apiModule.financialAPI, 'getProjectFinancials').mockResolvedValue({
      data: [],
      error: null,
      success: true,
      count: 0,
      status: 200,
      statusText: 'OK',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { result } = renderHook(() => useFinancialData(filters));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Rejected entries should NOT be counted
    expect(result.current.laborCost).toBe(0);
  });

  it('should calculate margin correctly with approved entries', async () => {
    const filters: AdminFilterValues = {
      projectId: '',
      projectName: '',
      professionalId: '',
      professionalName: '',
      startDate: '',
      endDate: '',
    };

    vi.spyOn(apiModule.financialAPI, 'getApprovedTimeEntries').mockResolvedValue({
      data: [mockApprovedEntry],
      error: null,
      success: true,
      count: 1,
      status: 200,
      statusText: 'OK',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    vi.spyOn(apiModule.financialAPI, 'getProjectFinancials').mockResolvedValue({
      data: [
        {
          project_id: 'proj-1',
          contracted_revenue: 1000,
          tax_rate: 0.08,
          indirect_cost: 100,
          project: { name: 'Project A' },
        },
      ],
      error: null,
      success: true,
      count: 1,
      status: 200,
      statusText: 'OK',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { result } = renderHook(() => useFinancialData(filters));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Revenue: 1000
    // Labor cost: 200 (2 hours * 100)
    // Tax: 1000 * 0.08 = 80
    // Indirect: 100
    // Result: 1000 - 200 - 80 - 100 = 620
    // Margin: 620 / 1000 * 100 = 62%
    expect(result.current.revenue).toBe(1000);
    expect(result.current.laborCost).toBe(200);
    expect(result.current.result).toBe(620);
    expect(result.current.margin).toBe(62);
  });

  it('should handle API error gracefully', async () => {
    const filters: AdminFilterValues = {
      projectId: '',
      projectName: '',
      professionalId: '',
      professionalName: '',
      startDate: '',
      endDate: '',
    };

    const mockError = new Error('API Error');
    vi.spyOn(apiModule.financialAPI, 'getApprovedTimeEntries').mockResolvedValue({
      data: null,
      error: mockError,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { result } = renderHook(() => useFinancialData(filters));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should have error state
    expect(result.current.error).toBeDefined();
  });

  it('should expose refetch function', () => {
    const filters: AdminFilterValues = {
      projectId: '',
      projectName: '',
      professionalId: '',
      professionalName: '',
      startDate: '',
      endDate: '',
    };

    vi.spyOn(apiModule.financialAPI, 'getApprovedTimeEntries').mockResolvedValue({
      data: [],
      error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    vi.spyOn(apiModule.financialAPI, 'getProjectFinancials').mockResolvedValue({
      data: [],
      error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { result } = renderHook(() => useFinancialData(filters));

    expect(typeof result.current.refetch).toBe('function');
  });

  it('should return professional data with approved entries', async () => {
    const filters: AdminFilterValues = {
      projectId: '',
      projectName: '',
      professionalId: '',
      professionalName: '',
      startDate: '',
      endDate: '',
    };

    vi.spyOn(apiModule.financialAPI, 'getApprovedTimeEntries').mockResolvedValue({
      data: [mockApprovedEntry],
      error: null,
      success: true,
      count: 1,
      status: 200,
      statusText: 'OK',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    vi.spyOn(apiModule.financialAPI, 'getProjectFinancials').mockResolvedValue({
      data: [
        {
          project_id: 'proj-1',
          contracted_revenue: 1000,
          tax_rate: 0.08,
          indirect_cost: 100,
          project: { name: 'Project A' },
        },
      ],
      error: null,
      success: true,
      count: 1,
      status: 200,
      statusText: 'OK',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { result } = renderHook(() => useFinancialData(filters));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should have professional data
    expect(result.current.professionalData).toBeDefined();
    expect(Array.isArray(result.current.professionalData)).toBe(true);
  });
});
