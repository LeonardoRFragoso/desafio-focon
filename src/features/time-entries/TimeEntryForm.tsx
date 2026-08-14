import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { timeEntrySchema, type TimeEntryInput } from '@/schemas/time-entry';
import { supabase } from '@/lib/supabase/client';
import { useAuthContext } from '@/features/auth/useAuthContext';

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
        const { data, error } = await supabase
          .from('projects')
          .select('id, name')
          .eq('status', 'active')
          .order('name');

        if (error) throw error;
        setProjects(data || []);
      } catch (err) {
        console.error('Erro ao carregar projetos:', err);
      }
    };

    fetchProjects();
  }, []);

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

      if (error) throw error;

      setSubmitSuccess(true);
      reset();
      onSuccess?.();

      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao registrar apontamento';
      setSubmitError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {submitError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm font-medium text-red-800">{submitError}</p>
        </div>
      )}

      {submitSuccess && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4">
          <p className="text-sm font-medium text-green-800">
            Apontamento registrado com sucesso!
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="projectId" className="block text-sm font-medium text-slate-700 mb-1">
            Projeto *
          </label>
          <select
            {...register('projectId')}
            id="projectId"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
          >
            <option value="">Selecione um projeto</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {errors.projectId && (
            <p className="mt-1 text-sm text-red-600">{errors.projectId.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="entryDate" className="block text-sm font-medium text-slate-700 mb-1">
            Data *
          </label>
          <input
            {...register('entryDate')}
            id="entryDate"
            type="date"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
          />
          {errors.entryDate && (
            <p className="mt-1 text-sm text-red-600">{errors.entryDate.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="durationMinutes" className="block text-sm font-medium text-slate-700 mb-1">
            Duração (minutos) *
          </label>
          <input
            {...register('durationMinutes', { valueAsNumber: true })}
            id="durationMinutes"
            type="number"
            min="1"
            step="15"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
            placeholder="60"
          />
          {errors.durationMinutes && (
            <p className="mt-1 text-sm text-red-600">{errors.durationMinutes.message}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">
          Descrição *
        </label>
        <textarea
          {...register('description')}
          id="description"
          rows={4}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
          placeholder="Descreva o trabalho realizado..."
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {loading ? 'Registrando...' : 'Registrar Apontamento'}
      </button>
    </form>
  );
}
