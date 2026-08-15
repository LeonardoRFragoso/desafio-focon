import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/Modal';
import { CommentsPanel } from '@/features/time-entries/CommentsPanel';
import { AttachmentsPanel } from '@/features/time-entries/AttachmentsPanel';
import { timeEntriesAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';

export interface TimeEntryDetail {
  id: string;
  project_id: string;
  professional_id: string;
  entry_date: string;
  duration_minutes: number;
  description: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  applied_hourly_rate: number | null;
  rejection_reason: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string | null;
  phase_id: string | null;
  task_id: string | null;
  project?: { name: string } | null;
  professional?: { full_name: string } | null;
  phase?: { name: string } | null;
  task?: { title: string } | null;
  rejected_by_profile?: { full_name: string } | null;
}

interface ApprovalHistoryEntry {
  id: string;
  previous_status: string;
  new_status: string;
  reason: string | null;
  changed_by: string;
  created_at: string;
  changed_by_profile?: { full_name: string } | null;
}

interface TimeEntryDetailsModalProps {
  entry: TimeEntryDetail;
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  /** Optional: show approve/reject actions for pending entries (admin only) */
  onApprove?: (entryId: string) => Promise<void>;
  onReject?: (entryId: string, reason: string) => Promise<void>;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('pt-BR');
}

function formatDateTime(date: string): string {
  return new Date(date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatCurrency(value: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function TimeEntryDetailsModal({
  entry,
  isOpen,
  onClose,
  isAdmin,
  onApprove,
  onReject,
}: TimeEntryDetailsModalProps) {
  const navigate = useNavigate();
  const [history, setHistory] = useState<ApprovalHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!isAdmin) return;
    setHistoryLoading(true);
    try {
      const { data, error: err } = await timeEntriesAPI.getHistory(entry.id);
      if (err) throw err;
      setHistory((data as ApprovalHistoryEntry[]) || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [entry.id, isAdmin]);

  useEffect(() => {
    if (isOpen && isAdmin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchHistory();
    }
  }, [isOpen, isAdmin, fetchHistory]);

  const handleApprove = async () => {
    if (!onApprove) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await onApprove(entry.id);
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao aprovar');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!onReject || !rejectReason.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await onReject(entry.id, rejectReason.trim());
      setShowRejectForm(false);
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao rejeitar');
    } finally {
      setActionLoading(false);
    }
  };

  const computedCost =
    entry.applied_hourly_rate != null
      ? (entry.applied_hourly_rate / 60) * entry.duration_minutes
      : null;

  const canApproveReject = isAdmin && entry.approval_status === 'pending' && (onApprove || onReject);

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Detalhes do Apontamento"
      maxWidth="max-w-2xl"
      footer={
        canApproveReject ? (
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              onClick={onClose}
              disabled={actionLoading}
              className="px-4 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition disabled:opacity-50"
            >
              Fechar
            </button>
            {onApprove && !showRejectForm && (
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition disabled:opacity-50"
              >
                {actionLoading ? 'Aprovando...' : 'Aprovar'}
              </button>
            )}
            {onReject && !showRejectForm && (
              <button
                onClick={() => setShowRejectForm(true)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50"
              >
                Rejeitar
              </button>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {actionError && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3" role="alert">
            <p className="text-sm text-red-800 dark:text-red-400">{actionError}</p>
          </div>
        )}

        {/* Core details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-app-muted mb-1">Projeto</label>
            <p className="text-sm font-semibold text-app-primary">
              {entry.project?.name || 'Projeto desconhecido'}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-app-muted mb-1">Data</label>
            <p className="text-sm font-semibold text-app-primary">{formatDate(entry.entry_date)}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-app-muted mb-1">Duração</label>
            <p className="text-sm font-semibold text-app-primary">{formatDuration(entry.duration_minutes)}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-app-muted mb-1">Status</label>
            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[entry.approval_status] || STATUS_COLORS['pending']}`}>
              {STATUS_LABELS[entry.approval_status] || entry.approval_status}
            </span>
          </div>
          {entry.phase?.name && (
            <div>
              <label className="block text-xs font-medium text-app-muted mb-1">Fase</label>
              <p className="text-sm font-semibold text-app-primary">{entry.phase.name}</p>
            </div>
          )}
          {entry.task?.title && (
            <div>
              <label className="block text-xs font-medium text-app-muted mb-1">Tarefa</label>
              <p className="text-sm font-semibold text-app-primary">{entry.task.title}</p>
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-app-muted mb-1">Descrição</label>
          <p className="text-sm text-app-primary whitespace-pre-wrap break-words">{entry.description}</p>
        </div>

        {/* Timestamps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-app-muted">
          <div>
            <span className="font-medium">Criado em:</span> {formatDateTime(entry.created_at)}
          </div>
          {entry.updated_at && (
            <div>
              <span className="font-medium">Atualizado em:</span> {formatDateTime(entry.updated_at)}
            </div>
          )}
        </div>

        {/* Rejection details */}
        {entry.approval_status === 'rejected' && entry.rejection_reason && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
            <p className="text-sm font-semibold text-red-800 dark:text-red-400 mb-1">Rejeitado</p>
            <p className="text-sm text-red-700 dark:text-red-400">
              <span className="font-medium">Motivo:</span> {entry.rejection_reason}
            </p>
            {entry.rejected_by_profile?.full_name && (
              <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                <span className="font-medium">Rejeitado por:</span> {entry.rejected_by_profile.full_name}
              </p>
            )}
            {entry.rejected_at && (
              <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                <span className="font-medium">Data:</span> {formatDateTime(entry.rejected_at)}
              </p>
            )}
          </div>
        )}

        {/* Reject form (inline) */}
        {showRejectForm && onReject && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 p-4 space-y-3">
            <label className="block text-sm font-medium text-red-800 dark:text-red-400">Motivo da rejeição *</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              minLength={10}
              maxLength={1000}
              placeholder="Informe o motivo (mínimo 10 caracteres)..."
              className="w-full px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowRejectForm(false)}
                disabled={actionLoading}
                className="px-3 py-1.5 rounded-lg border border-app-strong text-app-secondary text-sm transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || rejectReason.trim().length < 10}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm transition disabled:opacity-50"
              >
                {actionLoading ? 'Rejeitando...' : 'Confirmar Rejeição'}
              </button>
            </div>
          </div>
        )}

        {/* Admin-only: financial details */}
        {isAdmin && (
          <div className="border-t border-app-primary pt-4">
            <h4 className="text-sm font-semibold text-app-secondary mb-3">Detalhes Administrativos</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-app-muted mb-1">Profissional</label>
                <p className="text-sm text-app-primary">{entry.professional?.full_name || '—'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-app-muted mb-1">Custo/Hora</label>
                <p className="text-sm text-app-primary">{formatCurrency(entry.applied_hourly_rate)}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-app-muted mb-1">Custo Total</label>
                <p className="text-sm text-app-primary">{formatCurrency(computedCost)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Admin-only: approval history */}
        {isAdmin && (
          <div className="border-t border-app-primary pt-4">
            <h4 className="text-sm font-semibold text-app-secondary mb-3">Histórico de Aprovação</h4>
            {historyLoading ? (
              <p className="text-sm text-app-muted">Carregando histórico...</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-app-muted">Nenhum histórico de aprovação registrado.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((h) => (
                  <li key={h.id} className="text-sm border-l-2 border-app-strong pl-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[h.new_status] || STATUS_COLORS['pending']}`}>
                        {STATUS_LABELS[h.new_status] || h.new_status}
                      </span>
                      <span className="text-xs text-slate-400">{formatDateTime(h.created_at)}</span>
                    </div>
                    {h.changed_by_profile?.full_name && (
                      <p className="text-xs text-app-muted mt-0.5">
                        Por: {h.changed_by_profile.full_name}
                      </p>
                    )}
                    {h.reason && (
                      <p className="text-xs text-app-muted mt-0.5">{h.reason}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Comments and Attachments */}
        <div className="border-t border-app-primary pt-4 space-y-6">
          <CommentsPanel entryId={entry.id} isAdmin={isAdmin} />
          <AttachmentsPanel entryId={entry.id} />
        </div>

        {/* Admin: link to full history page */}
        {isAdmin && (
          <div className="border-t border-app-primary pt-4">
            <button
              onClick={() => navigate(`/admin/time-entries?entry=${entry.id}`)}
              className="text-sm text-focon-600 dark:text-focon-400 hover:underline"
            >
              Ver no histórico de apontamentos →
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
