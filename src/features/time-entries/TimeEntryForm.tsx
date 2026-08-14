import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { timeEntrySchema, type TimeEntryInput } from '@/schemas/time-entry';
import { supabase } from '@/lib/supabase/client';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { mapDatabaseError } from '@/lib/errors';

interface Project {
  id: string;
  name: string;
}

interface TimeEntryFormProps {
  onSuccess?: () => void;
}

export function TimeEntryForm({ onSuccess }: TimeEntryFormProps) {
  const { user } = useAuthContext();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TimeEntryInput>({
    resolver: zodResolver(timeEntrySchema),
  });

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setProjectsLoading(true);
        setProjectsError(null);
        const { data, error } = await supabase
          .from('projects')
          .select('id, name')
          .eq('status', 'active')
          .order('name');

        if (error) throw error;

        if (!data || data.length === 0) {
          setProjects([]);
        } else {
          setProjects(data);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar projetos';
        setProjectsError(message);
        console.error('Erro ao carregar projetos:', err);
      } finally {
        setProjectsLoading(false);
      }
    };

    fetchProjects();
  }, []);

  const handleRetryProjects = () => {
    setProjectsLoading(true);
    setProjectsError(null);
    const fetchProjects = async () => {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('id, name')
          .eq('status', 'active')
          .order('name');

        if (error) throw error;
        setProjects(data || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar projetos';
        setProjectsError(message);
        console.error('Erro ao carregar projetos:', err);
      } finally {
        setProjectsLoading(false);
      }
    };
    fetchProjects();
  };

  const onSubmit = async (data: TimeEntryInput) => {
    if (!user) return;

    try {
      setLoading(true);
      setSubmitError(null);
      setSubmitSuccess(false);

      // The hourly rate is determined by the database trigger
      // based on the professional's valid rate for the entry date
      const { error } = await supabase.from('time_entries').insert([
        {
          project_id: data.projectId,
          professional_id: user.id,
          entry_date: data.entryDate,
          duration_minutes: data.durationMinutes,
          description: data.description,
          approval_status: 'pending',
          applied_hourly_rate: 0, // Placeholder; trigger will set the actual rate
        },
      ]);

      if (error) {
        throw error;
      }

      setSubmitSuccess(true);
      reset();
      onSuccess?.();

      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? mapDatabaseError(err) : 'Erro ao registrar apontamento';
      setSubmitError(message);
    } finally {
      setLoading(false);
    }
  };

  const isSubmitDisabled = loading || projectsLoading || projectsError !== null || projects.length === 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {submitError && (
        <div
          className="rounded-lg bg-red-50 border border-red-200 p-4"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-sm font-medium text-red-800">{submitError}</p>
        </div>
      )}

      {submitSuccess && (
        <div
          className="rounded-lg bg-green-50 border border-green-200 p-4"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-green-800">
            Apontamento registrado com sucesso!
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label htmlFor="projectId" className="block text-sm font-medium text-slate-700 mb-2">
            Projeto *
          </label>
          {projectsError && (
            <div
              className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3"
              role="alert"
            >
              <p className="text-sm text-red-800 mb-2">{projectsError}</p>
              <button
                type="button"
                onClick={handleRetryProjects}
                className="text-sm font-medium text-red-700 hover:text-red-800 underline"
              >
                Tentar novamente
              </button>
            </div>
          )}
          <select
            {...register('projectId')}
            id="projectId"
            disabled={projectsLoading || projectsError !== null}
            aria-invalid={!!errors.projectId}
            aria-describedby={errors.projectId ? 'projectId-error' : undefined}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600 focus:border-transparent transition disabled:opacity-50 disabled:cursor-not-allowed"
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
            <p id="projectId-error" className="mt-1 text-sm text-red-600">{errors.projectId.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="entryDate" className="block text-sm font-medium text-slate-700 mb-2">
            Data *
          </label>
          <input
            {...register('entryDate')}
            id="entryDate"
            type="date"
            aria-invalid={!!errors.entryDate}
            aria-describedby={errors.entryDate ? 'entryDate-error' : undefined}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600 focus:border-transparent transition"
          />
          {errors.entryDate && (
            <p id="entryDate-error" className="mt-1 text-sm text-red-600">{errors.entryDate.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="durationMinutes" className="block text-sm font-medium text-slate-700 mb-2">
            Duração (minutos) *
          </label>
          <input
            {...register('durationMinutes', { valueAsNumber: true })}
            id="durationMinutes"
            type="number"
            min="1"
            aria-invalid={!!errors.durationMinutes}
            aria-describedby={errors.durationMinutes ? 'durationMinutes-error' : undefined}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600 focus:border-transparent transition"
            placeholder="60"
          />
          {errors.durationMinutes && (
            <p id="durationMinutes-error" className="mt-1 text-sm text-red-600">{errors.durationMinutes.message}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-2">
          Descrição *
        </label>
        <textarea
          {...register('description')}
          id="description"
          rows={5}
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? 'description-error' : undefined}
          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-focon-600 focus:border-transparent transition"
          placeholder="Descreva o trabalho realizado..."
        />
        {errors.description && (
          <p id="description-error" className="mt-1 text-sm text-red-600">{errors.description.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitDisabled}
        className="w-full sm:w-auto px-6 py-3 border border-transparent text-sm font-semibold rounded-lg text-white bg-focon-600 hover:bg-focon-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-focon-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {loading ? 'Registrando...' : 'Registrar Apontamento'}
      </button>
    </form>
  );
}
