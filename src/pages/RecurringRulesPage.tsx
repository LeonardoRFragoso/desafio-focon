import { useState, useEffect, useCallback } from 'react';
import { recurringRulesAPI, projectsAPI } from '@/lib/supabase/api';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { mapDatabaseError } from '@/lib/errors';
import { businessTodayStr, formatBusinessDate } from '@/lib/businessDate';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { maxEntryDate } from '@/features/time-entries/temporalRules';
import type { RecurringTimeEntryRule, Project, RecurringFrequency } from '@/types/database';

export function RecurringRulesPage() {
  const { user } = useAuthContext();
  const [rules, setRules] = useState<RecurringTimeEntryRule[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RecurringTimeEntryRule | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await recurringRulesAPI.list();
      if (err) throw err;
      setRules((data as RecurringTimeEntryRule[]) || []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar regras');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const { data } = await projectsAPI.listActive();
      setProjects((data as Project[]) || []);
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRules();
     
    fetchProjects();
  }, [fetchRules, fetchProjects]);

  const toggleActive = async (rule: RecurringTimeEntryRule) => {
    const { error: err } = await recurringRulesAPI.update(rule.id, { is_active: !rule.is_active });
    if (err) {
      setActionError(mapDatabaseError(err));
      return;
    }
    await fetchRules();
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const formatDuration = (m: number) => {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${h}h ${min}m`;
  };

  const freqLabels: Record<string, string> = {
    daily: 'Diária',
    weekly: 'Semanal',
    monthly: 'Mensal',
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-app-primary">Regras Recorrentes</h2>
          <p className="text-app-muted">Automatize a criação de apontamentos repetitivos</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition"
        >
          Nova Regra
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}
      {actionError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{actionError}</p>
        </div>
      )}

      {rules.length === 0 ? (
        <div className="rounded-xl border border-app-primary p-12 text-center bg-surface-secondary/50">
          <p className="text-app-secondary">Nenhuma regra recorrente configurada</p>
          <p className="text-sm text-app-muted mt-2">Crie uma regra para automatizar apontamentos repetitivos</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-app-primary shadow-sm">
          <table className="w-full">
            <thead className="bg-surface-secondary border-b border-app-primary">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Projeto</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Descrição</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Frequência</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Duração</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Próxima execução</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-table-divider">
              {rules.map((r) => (
                <tr key={r.id} className="hover:bg-hover-surface transition">
                  <td className="px-4 py-3 text-sm text-app-primary font-medium">{r.project?.name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-app-secondary max-w-[200px] truncate">{r.description}</td>
                  <td className="px-4 py-3 text-sm text-app-secondary">{freqLabels[r.frequency] || r.frequency}</td>
                  <td className="px-4 py-3 text-sm text-app-secondary">{formatDuration(r.duration_minutes)}</td>
                  <td className="px-4 py-3 text-sm text-app-secondary">{formatDate(r.next_run_date)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${r.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-700 bg-surface-secondary text-app-secondary'}`}>
                      {r.is_active ? 'Ativa' : 'Pausada'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm space-x-2">
                    <button
                      onClick={() => toggleActive(r)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium border border-app-strong text-app-secondary hover:bg-hover-surface transition"
                    >
                      {r.is_active ? 'Pausar' : 'Ativar'}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(r)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && user && (
        <RuleFormModal
          userId={user.id}
          projects={projects}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            fetchRules();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title="Excluir regra recorrente"
          destructive
          confirmLabel="Excluir"
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            const { error: err } = await recurringRulesAPI.remove(deleteTarget.id);
            if (err) {
              setActionError(mapDatabaseError(err));
              return;
            }
            await fetchRules();
          }}
          message={
            <p>
              Excluir a regra recorrente <strong>{deleteTarget.description}</strong>? Apontamentos já criados não serão afetados.
            </p>
          }
        />
      )}
    </div>
  );
}

interface RuleFormModalProps {
  userId: string;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function RuleFormModal({ userId, projects, onClose, onSaved, onError }: RuleFormModalProps) {
  const [projectId, setProjectId] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('60');
  const [frequency, setFrequency] = useState<RecurringFrequency>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [startDate, setStartDate] = useState(businessTodayStr());
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !description.trim() || !duration || !startDate) {
      onError('Preencha todos os campos obrigatórios.');
      return;
    }
    if (startDate > maxEntryDate()) {
      onError('A data de início não pode ser uma data futura.');
      return;
    }
    const dur = parseInt(duration, 10);
    if (isNaN(dur) || dur <= 0 || dur > 1440) {
      onError('Duração inválida (1-1440 minutos).');
      return;
    }

    // Calculate next_run_date based on frequency
    const start = new Date(startDate);
    let nextRun = start;
    if (frequency === 'weekly' && dayOfWeek) {
      const targetDay = parseInt(dayOfWeek, 10);
      const currentDay = start.getDay();
      let diff = targetDay - currentDay;
      if (diff < 0) diff += 7;
      if (diff === 0 && start < new Date()) diff = 7;
      nextRun = new Date(start);
      nextRun.setDate(start.getDate() + diff);
    }

    setSubmitting(true);
    try {
      const { error: err } = await recurringRulesAPI.create({
        professional_id: userId,
        project_id: projectId,
        description: description.trim(),
        duration_minutes: dur,
        frequency,
        day_of_week: frequency === 'weekly' ? parseInt(dayOfWeek, 10) : null,
        day_of_month: frequency === 'monthly' ? start.getDate() : null,
        start_date: startDate,
        end_date: endDate || null,
        next_run_date: formatBusinessDate(nextRun),
      });
      if (err) throw err;
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao criar regra');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nova Regra Recorrente"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" form="rule-form" disabled={submitting} className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50">
            {submitting ? 'Salvando...' : 'Criar'}
          </button>
        </>
      }
    >
      <form id="rule-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Projeto *</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
            <option value="">Selecione...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Descrição *</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Duração (min) *</label>
            <input type="number" min="1" max="1440" value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
          </div>
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Frequência *</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
              <option value="daily">Diária</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
            </select>
          </div>
        </div>
        {frequency === 'weekly' && (
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Dia da semana *</label>
            <select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
              <option value="0">Domingo</option>
              <option value="1">Segunda</option>
              <option value="2">Terça</option>
              <option value="3">Quarta</option>
              <option value="4">Quinta</option>
              <option value="5">Sexta</option>
              <option value="6">Sábado</option>
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Início *</label>
            <input type="date" value={startDate} max={maxEntryDate()} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
          </div>
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Fim (opcional)</label>
            <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
          </div>
        </div>
        <p className="text-xs text-app-muted">
          A regra criará apontamentos pendentes automaticamente nas datas programadas.
          Períodos fechados são pulados automaticamente.
        </p>
      </form>
    </Modal>
  );
}
