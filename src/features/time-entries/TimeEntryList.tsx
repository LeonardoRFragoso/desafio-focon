import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase/client';
import { timeEntriesAPI } from '@/lib/supabase/api';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { mapDatabaseError } from '@/lib/errors';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { timeEntrySchema, type TimeEntryInput } from '@/schemas/time-entry';

interface TimeEntry {
  id: string;
  project_id: string;
  project_name: string;
  entry_date: string;
  duration_minutes: number;
  description: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  rejected_by_profile?: { full_name: string } | null;
  rejected_at: string | null;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
}

type DialogState =
  | { kind: 'details'; entry: TimeEntry }
  | { kind: 'edit'; entry: TimeEntry }
  | { kind: 'duplicate'; entry: TimeEntry }
  | { kind: 'delete'; entry: TimeEntry }
  | null;

export function TimeEntryList() {
  const { user } = useAuthContext();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await timeEntriesAPI.getByUser(user.id);
      if (err) throw err;

      interface RawTimeEntry {
        id: string;
        project_id: string;
        projects: { name: string } | null;
        entry_date: string;
        duration_minutes: number;
        description: string;
        approval_status: 'pending' | 'approved' | 'rejected';
        rejection_reason: string | null;
        rejected_by_profile: { full_name: string } | null;
        rejected_at: string | null;
        created_at: string;
      }

      const formatted = ((data as unknown as RawTimeEntry[]) || []).map((entry) => ({
        id: entry.id,
        project_id: entry.project_id,
        project_name: entry.projects?.name || 'Projeto desconhecido',
        entry_date: entry.entry_date,
        duration_minutes: entry.duration_minutes,
        description: entry.description,
        approval_status: entry.approval_status,
        rejection_reason: entry.rejection_reason,
        rejected_by_profile: entry.rejected_by_profile,
        rejected_at: entry.rejected_at,
        created_at: entry.created_at,
      }));
      setEntries(formatted);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar apontamentos';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchProjects = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('projects')
        .select('id, name')
        .in('status', ['active', 'planned'])
        .order('name');
      if (err) throw err;
      setProjects((data as Project[]) || []);
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEntries();
    fetchProjects();
  }, [fetchEntries, fetchProjects]);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR');
  const formatDateTime = (date: string) =>
    new Date(date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  const getStatusBadge = (status: TimeEntry['approval_status']) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    const labels: Record<string, string> = {
      pending: 'Pendente',
      approved: 'Aprovado',
      rejected: 'Rejeitado',
    };
    return (
      <span
        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${styles[status] || styles['pending']}`}
      >
        {labels[status] || status}
      </span>
    );
  };

  const canEditOrDelete = (status: TimeEntry['approval_status']) => status === 'pending';

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
          <p className="text-sm text-slate-600">Carregando apontamentos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-4" role="alert">
        <p className="text-sm font-medium text-red-800 mb-3">{error}</p>
        <button
          onClick={fetchEntries}
          className="text-sm font-medium text-red-700 hover:text-red-800 underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 p-12 text-center bg-slate-50">
        <p className="text-slate-600 mb-2">Nenhum apontamento registrado</p>
        <p className="text-sm text-slate-500">Registre suas horas usando o formulário acima</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {actionError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3" role="alert">
          <p className="text-sm text-red-800">{actionError}</p>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full">
          <caption className="sr-only">Histórico de apontamentos de horas</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100">
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900" scope="col">Projeto</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900" scope="col">Data</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900" scope="col">Duração</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900" scope="col">Descrição</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900" scope="col">Status</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900" scope="col">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {entries.map((entry) => {
              const editable = canEditOrDelete(entry.approval_status);
              return (
                <tr
                  key={entry.id}
                  onClick={() => setDialog({ kind: 'details', entry })}
                  className="hover:bg-slate-50 transition cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setDialog({ kind: 'details', entry });
                  }}
                >
                  <td className="px-4 py-3 text-sm text-slate-900">{entry.project_name}</td>
                  <td className="px-4 py-3 text-sm text-slate-900 whitespace-nowrap">{formatDate(entry.entry_date)}</td>
                  <td className="px-4 py-3 text-sm text-slate-900 whitespace-nowrap">{formatDuration(entry.duration_minutes)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 min-w-[200px] max-w-[320px] truncate">
                    {entry.description}
                  </td>
                  <td className="px-4 py-3 text-sm">{getStatusBadge(entry.approval_status)}</td>
                  <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setDialog({ kind: 'edit', entry })}
                        disabled={!editable}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-disabled={!editable}
                        title={editable ? 'Editar apontamento' : 'Edição indisponível (não pendente)'}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setDialog({ kind: 'delete', entry })}
                        disabled={!editable}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-red-300 text-red-700 hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-disabled={!editable}
                        title={editable ? 'Excluir apontamento' : 'Exclusão indisponível (não pendente)'}
                      >
                        Excluir
                      </button>
                      <button
                        onClick={() => setDialog({ kind: 'duplicate', entry })}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-focon-300 text-focon-700 hover:bg-focon-50 transition"
                        title={entry.approval_status === 'rejected' ? 'Corrigir criando novo apontamento' : 'Duplicar apontamento'}
                      >
                        {entry.approval_status === 'rejected' ? 'Corrigir' : 'Duplicar'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dialog?.kind === 'details' && (
        <DetailsModal entry={dialog.entry} onClose={() => setDialog(null)} formatDuration={formatDuration} formatDate={formatDate} formatDateTime={formatDateTime} />
      )}

      {dialog?.kind === 'edit' && (
        <EditEntryModal
          entry={dialog.entry}
          projects={projects}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            fetchEntries();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {dialog?.kind === 'duplicate' && (
        <DuplicateEntryModal
          entry={dialog.entry}
          projects={projects}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            fetchEntries();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          open
          title="Excluir apontamento"
          destructive
          confirmLabel="Excluir"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            if (!user) return;
            const { error: err } = await timeEntriesAPI.delete(dialog.entry.id);
            if (err) {
              setActionError(mapDatabaseError(err));
              return;
            }
            await fetchEntries();
          }}
          message={
            <>
              <p className="mb-2">Tem certeza que deseja excluir este apontamento?</p>
              <p className="font-medium">
                {dialog.entry.project_name} — {formatDate(dialog.entry.entry_date)} —{' '}
                {formatDuration(dialog.entry.duration_minutes)}
              </p>
              <p className="mt-3 text-red-700">
                Esta operação não poderá ser desfeita.
              </p>
            </>
          }
        />
      )}
    </div>
  );
}

interface DetailsModalProps {
  entry: TimeEntry;
  onClose: () => void;
  formatDuration: (m: number) => string;
  formatDate: (d: string) => string;
  formatDateTime: (d: string) => string;
}

function DetailsModal({ entry, onClose, formatDuration, formatDate, formatDateTime }: DetailsModalProps) {
  return (
    <Modal open onClose={onClose} title="Detalhes do Apontamento" maxWidth="max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-2">Projeto</label>
          <p className="text-lg font-semibold text-slate-900">{entry.project_name}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-2">Data</label>
          <p className="text-lg font-semibold text-slate-900">{formatDate(entry.entry_date)}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-2">Duração</label>
          <p className="text-lg font-semibold text-slate-900">{formatDuration(entry.duration_minutes)}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-2">Status</label>
          <p className="text-lg font-semibold text-slate-900 capitalize">{entry.approval_status}</p>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-600 mb-2">Descrição</label>
          <p className="text-slate-900 whitespace-pre-wrap break-words">{entry.description}</p>
        </div>
      </div>

      {entry.approval_status === 'rejected' && entry.rejection_reason && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm font-semibold text-red-800 mb-1">Rejeitado</p>
          <p className="text-sm text-red-700">
            <span className="font-medium">Motivo:</span> {entry.rejection_reason}
          </p>
          {entry.rejected_by_profile?.full_name && (
            <p className="text-sm text-red-700 mt-1">
              <span className="font-medium">Rejeitado por:</span> {entry.rejected_by_profile.full_name}
            </p>
          )}
          {entry.rejected_at && (
            <p className="text-sm text-red-700 mt-1">
              <span className="font-medium">Data:</span> {formatDateTime(entry.rejected_at)}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

interface EditEntryModalProps {
  entry: TimeEntry;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function EditEntryModal({ entry, projects, onClose, onSaved, onError }: EditEntryModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TimeEntryInput>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: {
      projectId: entry.project_id,
      entryDate: entry.entry_date,
      durationMinutes: entry.duration_minutes,
      description: entry.description,
    },
  });

  const onSubmit = async (data: TimeEntryInput) => {
    setSubmitting(true);
    try {
      const { error: err } = await timeEntriesAPI.update(entry.id, {
        project_id: data.projectId,
        entry_date: data.entryDate,
        duration_minutes: data.durationMinutes,
        description: data.description,
      });
      if (err) throw err;
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao atualizar apontamento');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar Apontamento"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="edit-entry-form"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50"
          >
            {submitting ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="edit-entry-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-projectId" className="block text-sm font-medium text-slate-700 mb-2">
            Projeto *
          </label>
          <select
            {...register('projectId')}
            id="edit-projectId"
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {errors.projectId && <p className="mt-1 text-sm text-red-600">{errors.projectId.message}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="edit-entryDate" className="block text-sm font-medium text-slate-700 mb-2">
              Data *
            </label>
            <input
              {...register('entryDate')}
              id="edit-entryDate"
              type="date"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
            {errors.entryDate && <p className="mt-1 text-sm text-red-600">{errors.entryDate.message}</p>}
          </div>
          <div>
            <label htmlFor="edit-durationMinutes" className="block text-sm font-medium text-slate-700 mb-2">
              Duração (minutos) *
            </label>
            <input
              {...register('durationMinutes', { valueAsNumber: true })}
              id="edit-durationMinutes"
              type="number"
              min="1"
              max="1440"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
            {errors.durationMinutes && (
              <p className="mt-1 text-sm text-red-600">{errors.durationMinutes.message}</p>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="edit-description" className="block text-sm font-medium text-slate-700 mb-2">
            Descrição *
          </label>
          <textarea
            {...register('description')}
            id="edit-description"
            rows={3}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600"
          />
          {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
        </div>
        <p className="text-xs text-slate-500">
          Apenas apontamentos pendentes podem ser editados. O valor/hora é recalculado
          automaticamente pelo sistema ao alterar a data.
        </p>
      </form>
    </Modal>
  );
}

interface DuplicateEntryModalProps {
  entry: TimeEntry;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function DuplicateEntryModal({ entry, projects, onClose, onSaved, onError }: DuplicateEntryModalProps) {
  const { user } = useAuthContext();
  const [submitting, setSubmitting] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TimeEntryInput>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: {
      projectId: entry.project_id,
      entryDate: today,
      durationMinutes: entry.duration_minutes,
      description: entry.description,
    },
  });

  const onSubmit = async (data: TimeEntryInput) => {
    if (!user) return;
    setSubmitting(true);
    try {
      const { error: err } = await timeEntriesAPI.duplicate({
        project_id: data.projectId,
        professional_id: user.id,
        duration_minutes: data.durationMinutes,
        description: data.description,
        entry_date: data.entryDate,
      });
      if (err) throw err;
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao duplicar apontamento');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={entry.approval_status === 'rejected' ? 'Corrigir Apontamento' : 'Duplicar Apontamento'}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="duplicate-entry-form"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50"
          >
            {submitting ? 'Criando...' : 'Criar'}
          </button>
        </>
      }
    >
      <form id="duplicate-entry-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-sm text-slate-600">
          Um novo apontamento <strong>pendente</strong> será criado copiando projeto, duração e
          descrição. A data pode ser ajustada abaixo. O valor/hora será definido pelo sistema.
        </p>
        <div>
          <label htmlFor="dup-projectId" className="block text-sm font-medium text-slate-700 mb-2">
            Projeto *
          </label>
          <select
            {...register('projectId')}
            id="dup-projectId"
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {errors.projectId && <p className="mt-1 text-sm text-red-600">{errors.projectId.message}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="dup-entryDate" className="block text-sm font-medium text-slate-700 mb-2">
              Nova data *
            </label>
            <input
              {...register('entryDate')}
              id="dup-entryDate"
              type="date"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
            {errors.entryDate && <p className="mt-1 text-sm text-red-600">{errors.entryDate.message}</p>}
          </div>
          <div>
            <label htmlFor="dup-durationMinutes" className="block text-sm font-medium text-slate-700 mb-2">
              Duração (minutos) *
            </label>
            <input
              {...register('durationMinutes', { valueAsNumber: true })}
              id="dup-durationMinutes"
              type="number"
              min="1"
              max="1440"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
            {errors.durationMinutes && (
              <p className="mt-1 text-sm text-red-600">{errors.durationMinutes.message}</p>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="dup-description" className="block text-sm font-medium text-slate-700 mb-2">
            Descrição *
          </label>
          <textarea
            {...register('description')}
            id="dup-description"
            rows={3}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600"
          />
          {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
        </div>
      </form>
    </Modal>
  );
}
