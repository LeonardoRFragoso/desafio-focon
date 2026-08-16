import { useForm, useWatch, type UseFormProps, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { timeEntrySchema, type TimeEntryInput } from '@/schemas/time-entry';
import { requiresLateReason, daysLate } from '@/features/time-entries/temporalRules';

interface UseTimeEntryFormOptions extends UseFormProps<TimeEntryInput> {
  /** When true, the late-reason watch is disabled (e.g. timer always creates for today). */
  disableLateReasonWatch?: boolean;
}

interface UseTimeEntryFormReturn extends UseFormReturn<TimeEntryInput> {
  /** Whether the late submission reason field should be shown for the current entry date. */
  showLateReason: boolean;
  /** Number of business days the current entry date is late. */
  lateDays: number;
}

/**
 * Canonical time entry form hook shared by create, edit and duplicate flows.
 *
 * Wraps react-hook-form with the single `timeEntrySchema` (zod) and derives the
 * conditional late-submission-reason signal so every form applies the same
 * temporal rules (America/Sao_Paulo, 3+ business days late → justificativa
 * required).
 */
export function useTimeEntryForm(options: UseTimeEntryFormOptions = {}): UseTimeEntryFormReturn {
  const { disableLateReasonWatch, ...formProps } = options;
  const form = useForm<TimeEntryInput>({
    resolver: zodResolver(timeEntrySchema),
    ...formProps,
  });
  const { control } = form;

  const entryDate = useWatch({ control, name: 'entryDate' });
  const showLateReason = disableLateReasonWatch
    ? false
    : entryDate
      ? requiresLateReason(entryDate)
      : false;
  const lateDays = entryDate ? daysLate(entryDate) : 0;

  return { ...form, showLateReason, lateDays };
}
