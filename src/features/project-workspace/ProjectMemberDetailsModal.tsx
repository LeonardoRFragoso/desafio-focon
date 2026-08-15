import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Modal } from '@/components/Modal';
import type { ProjectMember, ProjectRole } from '@/types/database';

interface MemberStats {
  totalMinutes: number;
  approvedMinutes: number;
  pendingMinutes: number;
  rejectedMinutes: number;
  entryCount: number;
}

interface AllocationInfo {
  totalAllocatedMinutes: number;
  weeklyCapacityMinutes: number | null;
  allocations: Array<{
    id: string;
    start_date: string;
    end_date: string;
    allocated_minutes: number;
    allocation_type: string;
  }>;
}

interface ProjectMemberDetailsModalProps {
  member: ProjectMember | null;
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

const ROLE_LABELS: Record<ProjectRole, string> = {
  manager: 'Gerente',
  technical_lead: 'Líder Técnico',
  professional: 'Profissional',
  observer: 'Observador',
};

const ROLE_COLORS: Record<ProjectRole, string> = {
  manager: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  technical_lead: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  professional: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  observer: 'bg-slate-100 text-slate-600 bg-surface-secondary text-app-muted',
};

function formatDuration(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('pt-BR');
}

export function ProjectMemberDetailsModal({ member, projectId, isOpen, onClose }: ProjectMemberDetailsModalProps) {
  const [stats, setStats] = useState<MemberStats | null>(null);
  const [allocation, setAllocation] = useState<AllocationInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDetails = useCallback(async () => {
    if (!member) return;
    setLoading(true);
    try {
      // Fetch time entry stats for this member on this project
      const { data: entries } = await supabase
        .from('time_entries')
        .select('id, duration_minutes, approval_status')
        .eq('project_id', projectId)
        .eq('professional_id', member.professional_id);

      const entryList = entries || [];
      const totalMinutes = entryList.reduce((s, e) => s + e.duration_minutes, 0);
      const approvedMinutes = entryList
        .filter((e) => e.approval_status === 'approved')
        .reduce((s, e) => s + e.duration_minutes, 0);
      const pendingMinutes = entryList
        .filter((e) => e.approval_status === 'pending')
        .reduce((s, e) => s + e.duration_minutes, 0);
      const rejectedMinutes = entryList
        .filter((e) => e.approval_status === 'rejected')
        .reduce((s, e) => s + e.duration_minutes, 0);

      setStats({
        totalMinutes,
        approvedMinutes,
        pendingMinutes,
        rejectedMinutes,
        entryCount: entryList.length,
      });

      // Fetch capacity rule + allocations
      const { data: capacityRule } = await supabase
        .from('professional_capacity_rules')
        .select('weekly_capacity_minutes')
        .eq('professional_id', member.professional_id)
        .maybeSingle();

      const { data: allocations } = await supabase
        .from('project_allocations')
        .select('id, start_date, end_date, allocated_minutes, allocation_type')
        .eq('project_id', projectId)
        .eq('professional_id', member.professional_id)
        .order('start_date', { ascending: false });

      const allocList = (allocations as AllocationInfo['allocations']) || [];
      const totalAllocatedMinutes = allocList.reduce(
        (s, a) => s + a.allocated_minutes,
        0
      );

      setAllocation({
        totalAllocatedMinutes,
        weeklyCapacityMinutes: capacityRule?.weekly_capacity_minutes ?? null,
        allocations: allocList,
      });
    } catch {
      setStats(null);
      setAllocation(null);
    } finally {
      setLoading(false);
    }
  }, [member, projectId]);

  useEffect(() => {
    if (isOpen && member) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchDetails();
    }
  }, [isOpen, member, fetchDetails]);

  if (!member) return null;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Detalhes do Membro"
      maxWidth="max-w-2xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition"
        >
          Fechar
        </button>
      }
    >
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Member header */}
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-app-primary">
                {member.professional?.full_name ?? '—'}
              </h3>
              <p className="text-sm text-app-muted mt-0.5">
                {member.professional?.role === 'admin' ? 'Administrador' : 'Profissional'}
              </p>
            </div>
            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[member.project_role] || ROLE_COLORS['professional']}`}>
              {ROLE_LABELS[member.project_role] || member.project_role}
            </span>
          </div>

          {/* Time entry stats */}
          {stats && (
            <div>
              <h4 className="text-sm font-semibold text-app-secondary mb-3">Horas no Projeto</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-app-primary p-3 bg-surface-secondary/50">
                  <p className="text-xs text-app-muted">Total</p>
                  <p className="text-lg font-semibold text-app-primary">{formatDuration(stats.totalMinutes)}</p>
                  <p className="text-xs text-app-muted">{stats.entryCount} apontamento(s)</p>
                </div>
                <div className="rounded-lg border border-green-200 dark:border-green-800 p-3 bg-green-50 dark:bg-green-900/10">
                  <p className="text-xs text-green-700 dark:text-green-400">Aprovado</p>
                  <p className="text-lg font-semibold text-green-800 dark:text-green-400">{formatDuration(stats.approvedMinutes)}</p>
                </div>
                <div className="rounded-lg border border-yellow-200 dark:border-yellow-800 p-3 bg-yellow-50 dark:bg-yellow-900/10">
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">Pendente</p>
                  <p className="text-lg font-semibold text-yellow-800 dark:text-yellow-400">{formatDuration(stats.pendingMinutes)}</p>
                </div>
                <div className="rounded-lg border border-red-200 dark:border-red-800 p-3 bg-red-50 dark:bg-red-900/10">
                  <p className="text-xs text-red-700 dark:text-red-400">Rejeitado</p>
                  <p className="text-lg font-semibold text-red-800 dark:text-red-400">{formatDuration(stats.rejectedMinutes)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Allocation info */}
          {allocation && (
            <div>
              <h4 className="text-sm font-semibold text-app-secondary mb-3">Alocação e Capacidade</h4>
              {allocation.allocations.length === 0 ? (
                <p className="text-sm text-app-muted">
                  Nenhuma alocação semanal definida para este projeto.
                </p>
              ) : (
                <div className="space-y-2">
                  {allocation.allocations.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border border-app-primary p-3 bg-surface-secondary/50">
                      <div>
                        <p className="text-sm text-app-primary font-medium">
                          {formatDuration(a.allocated_minutes)} {a.allocation_type === 'weekly' ? '/semana' : ''}
                        </p>
                        <p className="text-xs text-app-muted">
                          {formatDate(a.start_date)} — {a.end_date ? formatDate(a.end_date) : 'em andamento'}
                        </p>
                      </div>
                    </div>
                  ))}
                  {allocation.weeklyCapacityMinutes && (
                    <p className="text-xs text-app-muted mt-2">
                      Capacidade semanal total: {formatDuration(allocation.weeklyCapacityMinutes)}.
                      Alocado neste projeto: {formatDuration(allocation.totalAllocatedMinutes)}/semana
                      ({Math.round((allocation.totalAllocatedMinutes / allocation.weeklyCapacityMinutes) * 100)}% da capacidade).
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Metadata */}
          <div className="border-t border-app-primary pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-app-muted">
              <div>
                <span className="font-medium">Adicionado em:</span> {formatDate(member.created_at)}
              </div>
              {member.updated_at && member.updated_at !== member.created_at && (
                <div>
                  <span className="font-medium">Atualizado em:</span> {formatDate(member.updated_at)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
