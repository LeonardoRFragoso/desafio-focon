import { z } from 'zod';

export const timeEntrySchema = z.object({
  projectId: z.string().uuid('Selecione um projeto válido.'),
  entryDate: z.string().date('Informe uma data válida.'),
  durationMinutes: z
    .number()
    .int('Informe a duração em minutos.')
    .min(1, 'A duração deve ser de pelo menos 1 minuto.')
    .max(1440, 'A duração não pode ultrapassar 24 horas.'),
  description: z
    .string()
    .min(10, 'A descrição deve ter pelo menos 10 caracteres.')
    .max(500, 'A descrição não pode ultrapassar 500 caracteres.'),
});

export type TimeEntryInput = z.infer<typeof timeEntrySchema>;
