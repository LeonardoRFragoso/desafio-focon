import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { TimeEntryApproval } from './TimeEntryApproval';
import * as usePendingTimeEntriesModule from '@/hooks/usePendingTimeEntries';

/**
 * Real tests for TimeEntryApproval component.
 * Validates approve/reject (with required reason), batch selection, and
 * callback behavior with real user interactions.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockEntry: any = {
  id: 'entry-1',
  professional_id: 'prof-1',
  project_id: 'proj-1',
  entry_date: '2024-01-15',
  duration_minutes: 120,
  description: 'Test work description',
  approval_status: 'pending',
  applied_hourly_rate: 100,
  rejection_reason: null,
  rejected_by: null,
  rejected_at: null,
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  professional: { id: 'prof-1', full_name: 'John Doe', role: 'member' },
  project: { id: 'proj-1', name: 'Project A' },
};

function makeHookMock(overrides: Partial<ReturnType<typeof usePendingTimeEntriesModule.usePendingTimeEntries>> = {}) {
  return {
    entries: [mockEntry],
    loading: false,
    error: null,
    actionLoading: null,
    successMessage: null,
    approve: vi.fn().mockResolvedValue(true),
    reject: vi.fn().mockResolvedValue(true),
    batchApprove: vi.fn().mockResolvedValue([]),
    batchReject: vi.fn().mockResolvedValue([]),
    refetch: vi.fn(),
    ...overrides,
  };
}

describe('TimeEntryApproval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Approve button behavior', () => {
    it('should call onStatusChanged when approve returns true', async () => {
      const onStatusChanged = vi.fn();
      const mockApprove = vi.fn().mockResolvedValue(true);
      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue(
        makeHookMock({ approve: mockApprove })
      );

      render(<TimeEntryApproval onStatusChanged={onStatusChanged} />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click the row approve button — opens confirmation dialog
      const approveButton = screen.getByText('Aprovar');
      await fireEvent.click(approveButton);

      // Confirm in the dialog
      await waitFor(() => {
        expect(screen.getByText('Aprovar Apontamento')).toBeInTheDocument();
      });
      const dialog = document.querySelector('[role="dialog"]');
      const footerBtns = dialog?.querySelectorAll('button') ?? [];
      const confirmBtn = Array.from(footerBtns).find(
        (b) => b.textContent?.trim() === 'Aprovar'
      );
      if (!confirmBtn) throw new Error('confirm button not found');
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      await waitFor(() => {
        expect(mockApprove).toHaveBeenCalledWith('entry-1');
      });
      expect(onStatusChanged).toHaveBeenCalledTimes(1);
    });

    it('should not call onStatusChanged when approve returns false', async () => {
      const onStatusChanged = vi.fn();
      const mockApprove = vi.fn().mockResolvedValue(false);
      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue(
        makeHookMock({ approve: mockApprove })
      );

      render(<TimeEntryApproval onStatusChanged={onStatusChanged} />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click the row approve button — opens confirmation dialog
      await fireEvent.click(screen.getByText('Aprovar'));

      // Confirm in the dialog
      await waitFor(() => {
        expect(screen.getByText('Aprovar Apontamento')).toBeInTheDocument();
      });
      const dialog = document.querySelector('[role="dialog"]');
      const footerBtns = dialog?.querySelectorAll('button') ?? [];
      const confirmBtn = Array.from(footerBtns).find(
        (b) => b.textContent?.trim() === 'Aprovar'
      );
      if (!confirmBtn) throw new Error('confirm button not found');
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      await waitFor(() => {
        expect(mockApprove).toHaveBeenCalledWith('entry-1');
      });
      expect(onStatusChanged).not.toHaveBeenCalled();
    });
  });

  describe('Reject button behavior', () => {
    it('should open reason modal and call reject with reason on confirm', async () => {
      const onStatusChanged = vi.fn();
      const mockReject = vi.fn().mockResolvedValue(true);
      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue(
        makeHookMock({ reject: mockReject })
      );

      render(<TimeEntryApproval onStatusChanged={onStatusChanged} />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click reject opens the reason modal (does not call reject yet)
      await fireEvent.click(screen.getByText('Rejeitar'));
      expect(screen.getByText('Rejeitar Apontamento')).toBeInTheDocument();
      expect(mockReject).not.toHaveBeenCalled();

      // Type a valid reason and confirm
      const textarea = screen.getByLabelText('Motivo da rejeição');
      await fireEvent.change(textarea, { target: { value: 'Descrição insuficiente para aprovação' } });
      // The modal footer confirm button shows "Rejeitar" (not "Rejeitando...")
      const dialog = document.querySelector('[role="dialog"]');
      const footerBtns = dialog?.querySelectorAll('button') ?? [];
      const confirmBtn = Array.from(footerBtns).find(
        (b) => b.textContent?.trim() === 'Rejeitar'
      );
      if (!confirmBtn) throw new Error('modal confirm button not found');
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      await waitFor(() => {
        expect(mockReject).toHaveBeenCalledWith('entry-1', 'Descrição insuficiente para aprovação');
      });
      expect(onStatusChanged).toHaveBeenCalledTimes(1);
    });

    it('should not call reject when reason is too short', async () => {
      const onStatusChanged = vi.fn();
      const mockReject = vi.fn().mockResolvedValue(true);
      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue(
        makeHookMock({ reject: mockReject })
      );

      render(<TimeEntryApproval onStatusChanged={onStatusChanged} />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      await fireEvent.click(screen.getByText('Rejeitar'));
      const textarea = screen.getByLabelText('Motivo da rejeição');
      await fireEvent.change(textarea, { target: { value: 'curto' } });
      // The confirm button is the second "Rejeitar" button in the modal footer
      const buttons = screen.getAllByText('Rejeitar');
      const confirmBtn = buttons.find((b) => b.tagName === 'BUTTON' && b.closest('[role="dialog"]'));
      if (!confirmBtn) throw new Error('confirm button not found');
      await fireEvent.click(confirmBtn);

      // Should show validation error, not call reject
      await waitFor(() => {
        expect(screen.getByText('Informe um motivo com pelo menos 10 caracteres.')).toBeInTheDocument();
      });
      expect(mockReject).not.toHaveBeenCalled();
    });
  });

  describe('Batch approval', () => {
    it('should select all and call batchApprove with selected ids', async () => {
      const onStatusChanged = vi.fn();
      const mockBatchApprove = vi.fn().mockResolvedValue([{ entry_id: 'entry-1', status: 'approved', error: null }]);
      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue(
        makeHookMock({ batchApprove: mockBatchApprove })
      );

      render(<TimeEntryApproval onStatusChanged={onStatusChanged} />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Select all
      await fireEvent.click(screen.getByLabelText('Selecionar todos visíveis'));
      // Click batch approve
      await fireEvent.click(screen.getByText('Aprovar em lote'));
      // Confirm in modal
      expect(screen.getByText('Aprovar em lote', { selector: 'h2' })).toBeInTheDocument();
      const confirmBtns = screen.getAllByText('Aprovar 1');
      const confirmBtn = confirmBtns[0];
      if (!confirmBtn) throw new Error('confirm button not found');
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      await waitFor(() => {
        expect(mockBatchApprove).toHaveBeenCalledWith(['entry-1']);
      });
      expect(onStatusChanged).toHaveBeenCalled();
    });
  });

  describe('Initial render', () => {
    it('should not call onStatusChanged on mount', async () => {
      const onStatusChanged = vi.fn();
      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue(
        makeHookMock({ approve: vi.fn().mockResolvedValue(false), reject: vi.fn().mockResolvedValue(false) })
      );

      render(<TimeEntryApproval onStatusChanged={onStatusChanged} />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
      expect(onStatusChanged).not.toHaveBeenCalled();
    });

    it('should disable approve button when actionLoading contains entry ID', async () => {
      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue(
        makeHookMock({ actionLoading: 'entry-1' })
      );

      render(<TimeEntryApproval />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
      // Approve button shows '...' and is disabled when loading
      const approveBtn = screen.getByText('...');
      expect(approveBtn).toBeDisabled();
    });
  });

  describe('Empty state', () => {
    it('should show empty message when no pending entries', async () => {
      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue(
        makeHookMock({ entries: [] })
      );

      render(<TimeEntryApproval />);

      await waitFor(() => {
        expect(screen.getByText('Nenhum apontamento pendente de aprovação')).toBeInTheDocument();
      });
    });
  });

  describe('Error state', () => {
    it('should display error message', async () => {
      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue(
        makeHookMock({ entries: [], error: 'Falha ao carregar' })
      );

      render(<TimeEntryApproval />);

      await waitFor(() => {
        expect(screen.getByText('Falha ao carregar')).toBeInTheDocument();
      });
    });
  });

  describe('Future legacy entry behavior', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const futureEntry: any = {
      ...mockEntry,
      id: 'entry-future',
      entry_date: '2099-12-31',
      description: 'Future legacy entry for testing',
    };

    it('shows DATA FUTURA badge for future entry', async () => {
      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue(
        makeHookMock({ entries: [futureEntry] })
      );

      render(<TimeEntryApproval />);

      await waitFor(() => {
        expect(screen.getByText('DATA FUTURA')).toBeInTheDocument();
      });
    });

    it('disables approve button for future entry', async () => {
      const mockApprove = vi.fn().mockResolvedValue(true);
      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue(
        makeHookMock({ entries: [futureEntry], approve: mockApprove })
      );

      render(<TimeEntryApproval />);

      await waitFor(() => {
        expect(screen.getByText('DATA FUTURA')).toBeInTheDocument();
      });

      // The approve button should be disabled
      const approveBtn = screen.getByText('Aprovar');
      expect(approveBtn).toBeDisabled();
      expect(approveBtn).toHaveAttribute('title', 'Apontamentos com data futura não podem ser aprovados.');
    });

    it('keeps reject button enabled for future entry', async () => {
      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue(
        makeHookMock({ entries: [futureEntry] })
      );

      render(<TimeEntryApproval />);

      await waitFor(() => {
        expect(screen.getByText('DATA FUTURA')).toBeInTheDocument();
      });

      const rejectBtn = screen.getByText('Rejeitar');
      expect(rejectBtn).not.toBeDisabled();
    });

    it('does not call approve when approve button is disabled (future)', async () => {
      const mockApprove = vi.fn().mockResolvedValue(true);
      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue(
        makeHookMock({ entries: [futureEntry], approve: mockApprove })
      );

      render(<TimeEntryApproval />);

      await waitFor(() => {
        expect(screen.getByText('DATA FUTURA')).toBeInTheDocument();
      });

      const approveBtn = screen.getByText('Aprovar');
      fireEvent.click(approveBtn);
      expect(mockApprove).not.toHaveBeenCalled();
    });

    it('shows future legacy count indicator', async () => {
      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue(
        makeHookMock({ entries: [futureEntry, mockEntry] })
      );

      render(<TimeEntryApproval />);

      await waitFor(() => {
        expect(screen.getByText(/1 com data futura/)).toBeInTheDocument();
      });
    });

    it('excludes future entries from batch approve', async () => {
      const mockBatchApprove = vi.fn().mockResolvedValue([
        { entry_id: 'entry-1', status: 'approved', error: null },
      ]);
      vi.spyOn(usePendingTimeEntriesModule, 'usePendingTimeEntries').mockReturnValue(
        makeHookMock({ entries: [futureEntry, mockEntry], batchApprove: mockBatchApprove })
      );

      render(<TimeEntryApproval />);

      await waitFor(() => {
        expect(screen.getByText('DATA FUTURA')).toBeInTheDocument();
      });

      // Select all
      await fireEvent.click(screen.getByLabelText('Selecionar todos visíveis'));
      // Click batch approve
      await fireEvent.click(screen.getByText('Aprovar em lote'));
      // Confirm in modal
      expect(screen.getByText('Aprovar em lote', { selector: 'h2' })).toBeInTheDocument();
      const confirmBtns = screen.getAllByText('Aprovar 2');
      const confirmBtn = confirmBtns[0];
      if (!confirmBtn) throw new Error('confirm button not found');
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      await waitFor(() => {
        // Should only call batchApprove with the non-future entry
        expect(mockBatchApprove).toHaveBeenCalledWith(['entry-1']);
      });
    });
  });
});
