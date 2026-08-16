import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { timeEntriesAPI } from '@/lib/supabase/api';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { mapDatabaseError } from '@/lib/errors';
import { TimeEntryFields, type TimeEntryProject } from '@/features/time-entries/TimeEntryFields';
import { useTimeEntryForm } from '@/features/time-entries/useTimeEntryForm';
import { PendingAttachments } from '@/features/time-entries/PendingAttachments';
import { uploadTimeEntryAttachments } from '@/features/time-entries/attachments';
import type { TimeEntryInput } from '@/schemas/time-entry';

interface TimeEntryFormProps {
  onSuccess?: () => void;
}

export function TimeEntryForm({ onSuccess }: TimeEntryFormProps) {
  const { user } = useAuthContext();
  const [projects, setProjects] = useState<TimeEntryProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const form = useTimeEntryForm();
  const {
    handleSubmit,
    reset,
    showLateReason,
    lateDays,
  } = form;

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

      const { data: created, error } = await timeEntriesAPI.create({
        project_id: data.projectId,
        professional_id: user.id,
        entry_date: data.entryDate,
        duration_minutes: data.durationMinutes,
        description: data.description,
        late_submission_reason: data.lateSubmissionReason?.trim() || null,
      });

      if (error) {
        throw error;
      }

      // Entry created — upload pending attachments (if any) to the new entry.
      // Partial failures are surfaced explicitly: the entry is kept, but the
      // user is told which attachments failed and that they can retry via edit.
      if (pendingFiles.length > 0 && created?.id) {
        const { succeeded, failed } = await uploadTimeEntryAttachments(
          created.id,
          user.id,
          pendingFiles
        );
        if (failed > 0) {
          setSubmitError(
            `Apontamento criado, mas ${failed} de ${pendingFiles.length} anexo(s) falhou/falharam. ` +
              `${succeeded} enviado(s). Tente adicionar os pendentes na edição do apontamento.`
          );
          // Keep the entry; clear pending files only for the ones that succeeded is complex,
          // so clear all and let the user re-add via edit. The entry itself is valid.
          setPendingFiles([]);
          reset();
          onSuccess?.();
          return;
        }
      }

      setPendingFiles([]);
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
          className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{submitError}</p>
        </div>
      )}

      {submitSuccess && (
        <div
          className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-green-800 dark:text-green-400">
            Apontamento registrado com sucesso!
          </p>
        </div>
      )}

      <TimeEntryFields
        form={form}
        showLateReason={showLateReason}
        lateDays={lateDays}
        projects={projects}
        projectsLoading={projectsLoading}
        projectsError={projectsError}
        onRetryProjects={handleRetryProjects}
        idPrefix="te"
        descriptionRows={5}
      />

      <PendingAttachments files={pendingFiles} onChange={setPendingFiles} disabled={loading} />

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
