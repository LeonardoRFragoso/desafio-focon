import { z } from 'zod';

export const timeEntrySchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  entryDate: z.string().date('Invalid date'),
  durationMinutes: z
    .number()
    .int('Duration must be in whole minutes')
    .min(1, 'Duration must be at least 1 minute')
    .max(1440, 'Duration cannot exceed 24 hours (1440 minutes)'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(500, 'Description cannot exceed 500 characters'),
});

export type TimeEntryInput = z.infer<typeof timeEntrySchema>;
