import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TimeEntryApproval } from './TimeEntryApproval';
import * as usePendingTimeEntriesModule from '@/hooks/usePendingTimeEntries';

/**
 * Real tests for TimeEntryApproval component
 * Renders the actual component and validates callback behavior with real user interactions
 */

describe('TimeEntryApproval', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockEntry: any = {
    id: 'entry-1',
    professional_id: 'prof-1',
    project_id: 'proj-1',
    entry_date: '2024-01-15',
    duration_minutes: 120,
    description: 'Test work',
    approval_status: 'pending',
    applied_hourly_rate: 100,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    professional: { id: 'prof-1', full_name: 'John Doe', role: 'member' },
    project: { id: 'proj-1', name: 'Project A' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Approve button behavior', () => {
    it('should call onStatusChanged when approve returns true', async () => {
      const onStatusChanged = vi.fn();
      const mockApprove = vi.fn().mockResolvedValue(true);
      const mockReject = vi.fn().mockResolvedValue(false);

      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue({
        entries: [mockEntry],
        loading: false,
        error: null,
        actionLoading: null,
        successMessage: null,
        approve: mockApprove,
        reject: mockReject,
        refetch: vi.fn(),
      });

      render(<TimeEntryApproval onStatusChanged={onStatusChanged} />);

      // Wait for component to render with entry
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click the approve button
      const approveButton = screen.getByText('Aprovar');
      await fireEvent.click(approveButton);

      // Wait for approve to be called
      await waitFor(() => {
        expect(mockApprove).toHaveBeenCalledWith('entry-1');
      });

      // Callback should be called because approve returned true
      expect(onStatusChanged).toHaveBeenCalledTimes(1);
    });

    it('should not call onStatusChanged when approve returns false', async () => {
      const onStatusChanged = vi.fn();
      const mockApprove = vi.fn().mockResolvedValue(false);
      const mockReject = vi.fn().mockResolvedValue(false);

      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue({
        entries: [mockEntry],
        loading: false,
        error: null,
        actionLoading: null,
        successMessage: null,
        approve: mockApprove,
        reject: mockReject,
        refetch: vi.fn(),
      });

      render(<TimeEntryApproval onStatusChanged={onStatusChanged} />);

      // Wait for component to render with entry
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click the approve button
      const approveButton = screen.getByText('Aprovar');
      await fireEvent.click(approveButton);

      // Wait for approve to be called
      await waitFor(() => {
        expect(mockApprove).toHaveBeenCalledWith('entry-1');
      });

      // Callback should NOT be called because approve returned false
      expect(onStatusChanged).not.toHaveBeenCalled();
    });
  });

  describe('Reject button behavior', () => {
    it('should call onStatusChanged when reject returns true', async () => {
      const onStatusChanged = vi.fn();
      const mockApprove = vi.fn().mockResolvedValue(false);
      const mockReject = vi.fn().mockResolvedValue(true);

      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue({
        entries: [mockEntry],
        loading: false,
        error: null,
        actionLoading: null,
        successMessage: null,
        approve: mockApprove,
        reject: mockReject,
        refetch: vi.fn(),
      });

      render(<TimeEntryApproval onStatusChanged={onStatusChanged} />);

      // Wait for component to render with entry
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click the reject button
      const rejectButton = screen.getByText('Rejeitar');
      await fireEvent.click(rejectButton);

      // Wait for reject to be called
      await waitFor(() => {
        expect(mockReject).toHaveBeenCalledWith('entry-1');
      });

      // Callback should be called because reject returned true
      expect(onStatusChanged).toHaveBeenCalledTimes(1);
    });

    it('should not call onStatusChanged when reject returns false', async () => {
      const onStatusChanged = vi.fn();
      const mockApprove = vi.fn().mockResolvedValue(false);
      const mockReject = vi.fn().mockResolvedValue(false);

      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue({
        entries: [mockEntry],
        loading: false,
        error: null,
        actionLoading: null,
        successMessage: null,
        approve: mockApprove,
        reject: mockReject,
        refetch: vi.fn(),
      });

      render(<TimeEntryApproval onStatusChanged={onStatusChanged} />);

      // Wait for component to render with entry
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click the reject button
      const rejectButton = screen.getByText('Rejeitar');
      await fireEvent.click(rejectButton);

      // Wait for reject to be called
      await waitFor(() => {
        expect(mockReject).toHaveBeenCalledWith('entry-1');
      });

      // Callback should NOT be called because reject returned false
      expect(onStatusChanged).not.toHaveBeenCalled();
    });
  });

  describe('Initial render', () => {
    it('should not call onStatusChanged on mount', async () => {
      const onStatusChanged = vi.fn();
      const mockApprove = vi.fn().mockResolvedValue(false);
      const mockReject = vi.fn().mockResolvedValue(false);

      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue({
        entries: [mockEntry],
        loading: false,
        error: null,
        actionLoading: null,
        successMessage: null,
        approve: mockApprove,
        reject: mockReject,
        refetch: vi.fn(),
      });

      render(<TimeEntryApproval onStatusChanged={onStatusChanged} />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Callback should NOT be called on mount
      expect(onStatusChanged).not.toHaveBeenCalled();
    });

    it('should disable button when actionLoading contains entry ID', async () => {
      const mockApprove = vi.fn().mockResolvedValue(false);
      const mockReject = vi.fn().mockResolvedValue(false);

      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue({
        entries: [mockEntry],
        loading: false,
        error: null,
        actionLoading: 'entry-1', // Entry is being processed
        successMessage: null,
        approve: mockApprove,
        reject: mockReject,
        refetch: vi.fn(),
      });

      render(<TimeEntryApproval />);

      // When actionLoading is set, both buttons show "Processando..." and are disabled
      const processandoButtons = screen.getAllByText('Processando...');
      expect(processandoButtons.length).toBe(2); // Both approve and reject
      expect(processandoButtons[0]).toBeDisabled();
      expect(processandoButtons[1]).toBeDisabled();
    });
  });

  describe('Component rendering', () => {
    it('should display entry details', async () => {
      const mockApprove = vi.fn();
      const mockReject = vi.fn();

      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue({
        entries: [mockEntry],
        loading: false,
        error: null,
        actionLoading: null,
        successMessage: null,
        approve: mockApprove,
        reject: mockReject,
        refetch: vi.fn(),
      });

      render(<TimeEntryApproval />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Project A')).toBeInTheDocument();
      });
    });

    it('should show error message when present', async () => {
      const mockApprove = vi.fn();
      const mockReject = vi.fn();
      const errorMessage = 'Erro ao carregar apontamentos';

      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue({
        entries: [],
        loading: false,
        error: errorMessage,
        actionLoading: null,
        successMessage: null,
        approve: mockApprove,
        reject: mockReject,
        refetch: vi.fn(),
      });

      render(<TimeEntryApproval />);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('should show loading state', () => {
      const mockApprove = vi.fn();
      const mockReject = vi.fn();

      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue({
        entries: [],
        loading: true,
        error: null,
        actionLoading: null,
        successMessage: null,
        approve: mockApprove,
        reject: mockReject,
        refetch: vi.fn(),
      });

      render(<TimeEntryApproval />);

      // Should show loading spinner (div with animate-spin class)
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });
});
