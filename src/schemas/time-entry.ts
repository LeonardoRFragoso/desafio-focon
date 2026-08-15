import { z } from 'zod';

const todayStr = () => new Date().toISOString().slice(0, 10);

const daysLate = (dateStr: string): number => {
  const entry = new Date(dateStr + 'T00:00:00');
  const today = new Date(todayStr() + 'T00:00:00');
  return Math.round((today.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24));
};

export const timeEntrySchema = z
  .object({
    projectId: z.string().uuid('Selecione um projeto válido.'),
    entryDate: z
      .string()
      .date('Informe uma data válida.')
      .refine((d) => d <= todayStr(), 'Não é possível registrar horas em uma data futura.'),
    durationMinutes: z
      .number()
      .int('Informe a duração em minutos.')
      .min(1, 'A duração deve ser de pelo menos 1 minuto.')
      .max(1440, 'A duração não pode ultrapassar 24 horas.'),
    description: z
      .string()
      .min(10, 'A descrição deve ter pelo menos 10 caracteres.')
      .max(500, 'A descrição não pode ultrapassar 500 caracteres.'),
    lateSubmissionReason: z
      .string()
      .max(500, 'A justificativa não pode ultrapassar 500 caracteres.')
      .optional()
      .or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    const late = daysLate(data.entryDate);
    if (late >= 3) {
      const reason = data.lateSubmissionReason?.trim() ?? '';
      if (reason.length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lateSubmissionReason'],
          message: `Este apontamento está sendo registrado com ${late} dias de atraso. Informe o motivo do lançamento retroativo (mínimo 10 caracteres).`,
        });
      }
    }
  });

export type TimeEntryInput = z.infer<typeof timeEntrySchema>;
