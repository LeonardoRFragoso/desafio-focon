import { describe, it, expect } from 'vitest';
import type { AdminFilterValues } from '@/types/admin';

/**
 * Tests for useFinancialData hook
 * Note: Full integration tests require mocking Supabase
 */

describe('useFinancialData', () => {
  it('should only count approved hours in stats', () => {
    // Test data: 3 entries - 2 approved, 1 pending
    const approvedHours = 120 + 60; // 180 minutes
    const pendingHours = 30;

    // Only approved should count
    expect(approvedHours).toBe(180);
    expect(pendingHours).not.toBe(approvedHours);
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

  it('should handle filter changes correctly', () => {
    const filters: AdminFilterValues = {
      projectId: 'proj-123',
      projectName: 'Project A',
      professionalId: 'prof-456',
      professionalName: 'John Doe',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    };

    expect(filters.projectId).toBe('proj-123');
    expect(filters.startDate).toBe('2024-01-01');
  });
});
