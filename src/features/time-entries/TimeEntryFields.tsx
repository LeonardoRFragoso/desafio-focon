import type { UseFormReturn } from 'react-hook-form';
import { maxEntryDate } from '@/features/time-entries/temporalRules';
import type { TimeEntryInput } from '@/schemas/time-entry';

export interface TimeEntryProject {
  id: string;
  name: string;
}

interface TimeEntryFieldsProps {
  /** Form methods from useTimeEntryForm. */
  form: UseFormReturn<TimeEntryInput>;
  /** Whether the late submission reason field should be shown. */
  showLateReason: boolean;
  /** Number of business days the current entry date is late. */
  lateDays: number;
  /** Projects available for selection. */
  projects: TimeEntryProject[];
  /** Whether projects are still loading (create form fetches its own). */
  projectsLoading?: boolean;
  /** Projects fetch error message (create form). */
  projectsError?: string | null;
  /** Retry handler for projects fetch error. */
  onRetryProjects?: () => void;
  /** Prefix for element ids to keep them unique across modals on the same page. */
  idPrefix: string;
  /** Textarea rows for the description field. */
  descriptionRows?: number;
  /** Label for the date field (e.g. "Nova data" for duplicate). */
  dateLabel?: string;
}

const INPUT_CLASS =
  'w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600 focus:border-transparent transition disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * Canonical time entry field set shared by create, edit and duplicate forms.
 *
 * Renders project, date, duration, description and the conditional
 * late-submission-reason (justificativa) using the single `timeEntrySchema`
 * validation. Every form that creates or edits a time entry MUST use these
 * fields so labels, types, temporal rules and validation stay consistent.
 */
export function TimeEntryFields({
  form,
  showLateReason,
  lateDays,
  projects,
  projectsLoading,
  projectsError,
  onRetryProjects,
  idPrefix,
  descriptionRows = 4,
  dateLabel = 'Data',
}: TimeEntryFieldsProps) {
  const {
    register,
    formState: { errors },
  } = form;

  const projectId = `${idPrefix}-projectId`;
  const entryDateId = `${idPrefix}-entryDate`;
  const durationId = `${idPrefix}-durationMinutes`;
  const descriptionId = `${idPrefix}-description`;
  const lateReasonId = `${idPrefix}-lateReason`;

  return (
    <div className="space-y-4">
      {/* Project */}
      <div>
        <label htmlFor={projectId} className="block text-sm font-medium text-app-secondary mb-2">
          Projeto *
        </label>
        {projectsError && (
          <div
            className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3"
            role="alert"
          >
            <p className="text-sm text-red-800 dark:text-red-400 mb-2">{projectsError}</p>
            {onRetryProjects && (
              <button
                type="button"
                onClick={onRetryProjects}
                className="text-sm font-medium text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200 underline"
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}
        <select
          {...register('projectId')}
          id={projectId}
          disabled={projectsLoading || projectsError !== null}
          aria-invalid={!!errors.projectId}
          aria-describedby={errors.projectId ? `${projectId}-error` : undefined}
          className={INPUT_CLASS}
        >
          {projectsLoading ? (
            <option value="">Carregando projetos...</option>
          ) : projects.length === 0 ? (
            <option value="">Nenhum projeto ativo disponível para apontamento.</option>
          ) : (
            <>
              <option value="">Selecione um projeto</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </>
          )}
        </select>
        {errors.projectId && (
          <p id={`${projectId}-error`} className="mt-1 text-sm text-red-600">
            {errors.projectId.message}
          </p>
        )}
      </div>

      {/* Date + Duration */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={entryDateId} className="block text-sm font-medium text-app-secondary mb-2">
            {dateLabel} *
          </label>
          <input
            {...register('entryDate')}
            id={entryDateId}
            type="date"
            max={maxEntryDate()}
            aria-invalid={!!errors.entryDate}
            aria-describedby={errors.entryDate ? `${entryDateId}-error` : undefined}
            className={INPUT_CLASS}
          />
          {errors.entryDate && (
            <p id={`${entryDateId}-error`} className="mt-1 text-sm text-red-600">
              {errors.entryDate.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={durationId} className="block text-sm font-medium text-app-secondary mb-2">
            Duração (minutos) *
          </label>
          <input
            {...register('durationMinutes', { valueAsNumber: true })}
            id={durationId}
            type="number"
            min="1"
            max="1440"
            placeholder="60"
            aria-invalid={!!errors.durationMinutes}
            aria-describedby={errors.durationMinutes ? `${durationId}-error` : undefined}
            className={INPUT_CLASS}
          />
          {errors.durationMinutes && (
            <p id={`${durationId}-error`} className="mt-1 text-sm text-red-600">
              {errors.durationMinutes.message}
            </p>
          )}
        </div>
      </div>

      {/* Description */}
      <div>
        <label htmlFor={descriptionId} className="block text-sm font-medium text-app-secondary mb-2">
          Descrição *
        </label>
        <textarea
          {...register('description')}
          id={descriptionId}
          rows={descriptionRows}
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? `${descriptionId}-error` : undefined}
          className={`${INPUT_CLASS} placeholder-slate-500 placeholder-input`}
          placeholder="Descreva o trabalho realizado..."
        />
        {errors.description && (
          <p id={`${descriptionId}-error`} className="mt-1 text-sm text-red-600">
            {errors.description.message}
          </p>
        )}
      </div>

      {/* Conditional late submission reason (justificativa) */}
      {showLateReason && (
        <div>
          <label htmlFor={lateReasonId} className="block text-sm font-medium text-app-secondary mb-2">
            Justificativa do lançamento retroativo *
          </label>
          <p className="text-sm text-app-muted mb-2">
            Este apontamento está sendo registrado com {lateDays} dias de atraso.
            Informe o motivo do lançamento retroativo.
          </p>
          <textarea
            {...register('lateSubmissionReason')}
            id={lateReasonId}
            rows={3}
            aria-invalid={!!errors.lateSubmissionReason}
            aria-describedby={errors.lateSubmissionReason ? `${lateReasonId}-error` : undefined}
            className={`${INPUT_CLASS} placeholder-slate-500 placeholder-input`}
            placeholder="Ex: Estava em campo durante a semana e não pude registrar no tempo adequado..."
          />
          {errors.lateSubmissionReason && (
            <p id={`${lateReasonId}-error`} className="mt-1 text-sm text-red-600">
              {errors.lateSubmissionReason.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
