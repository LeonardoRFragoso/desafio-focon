import { useState, useEffect, useCallback } from 'react';
import { projectMembersAPI, profilesAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { ProjectMember, ProjectRole, Profile } from '@/types/database';

interface ProjectTeamTabProps {
  projectId: string;
  isAdmin: boolean;
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

export function ProjectTeamTab({ projectId, isAdmin }: ProjectTeamTabProps) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [professionals, setProfessionals] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectMember | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await projectMembersAPI.listByProject(projectId);
      if (err) throw err;
      setMembers((data as ProjectMember[]) || []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar equipe');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMembers();
    if (isAdmin) {
      profilesAPI.list().then(({ data }) => {
        if (data) setProfessionals(data as Profile[]);
      });
    }
  }, [fetchMembers, isAdmin]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-app-primary">Equipe do Projeto</h3>
        {isAdmin && (
          <button
            onClick={() => setAddOpen(true)}
            className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition text-sm"
          >
            Adicionar Membro
          </button>
        )}
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

      {members.length === 0 ? (
        <div className="rounded-xl border border-app-primary p-12 text-center bg-surface-secondary/50">
          <p className="text-app-muted">Nenhum membro na equipe</p>
          <p className="text-sm text-app-muted mt-1">
            Adicione profissionais para definir responsabilidades do projeto.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-app-primary shadow-sm">
          <table className="w-full">
            <thead className="bg-surface-secondary border-b border-app-primary">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Profissional</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Role Global</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Role no Projeto</th>
                {isAdmin && <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-table-divider">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-hover-surface transition">
                  <td className="px-4 py-3 text-sm text-app-primary font-medium">
                    {m.professional?.full_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-app-secondary">
                    {m.professional?.role === 'admin' ? 'Administrador' : 'Profissional'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {isAdmin ? (
                      <select
                        value={m.project_role}
                        onChange={async (e) => {
                          const { error: err } = await projectMembersAPI.update(m.id, {
                            project_role: e.target.value,
                          });
                          if (err) {
                            setActionError(mapDatabaseError(err));
                            return;
                          }
                          fetchMembers();
                        }}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border-0 cursor-pointer ${ROLE_COLORS[m.project_role] || ROLE_COLORS['professional']}`}
                      >
                        {Object.entries(ROLE_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[m.project_role] || ROLE_COLORS['professional']}`}>
                        {ROLE_LABELS[m.project_role] || m.project_role}
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => setDeleteTarget(m)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                      >
                        Remover
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <AddMemberModal
          projectId={projectId}
          professionals={professionals}
          existingMemberIds={members.map((m) => m.professional_id)}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            fetchMembers();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title="Remover Membro"
          destructive
          confirmLabel="Remover"
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            const { error: err } = await projectMembersAPI.remove(deleteTarget.id);
            if (err) {
              setActionError(mapDatabaseError(err));
              return;
            }
            setDeleteTarget(null);
            await fetchMembers();
          }}
          message={
            <p>
              Tem certeza que deseja remover <strong>{deleteTarget.professional?.full_name}</strong> da equipe?
            </p>
          }
        />
      )}
    </div>
  );
}

interface AddMemberModalProps {
  projectId: string;
  professionals: Profile[];
  existingMemberIds: string[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function AddMemberModal({ projectId, professionals, existingMemberIds, onClose, onSaved, onError }: AddMemberModalProps) {
  const [professionalId, setProfessionalId] = useState('');
  const [role, setRole] = useState<ProjectRole>('professional');
  const [submitting, setSubmitting] = useState(false);

  const available = professionals.filter((p) => !existingMemberIds.includes(p.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!professionalId) {
      onError('Selecione um profissional.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: err } = await projectMembersAPI.create({
        project_id: projectId,
        professional_id: professionalId,
        project_role: role,
      });
      if (err) throw err;
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao adicionar membro');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Adicionar Membro"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="member-form"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50"
          >
            {submitting ? 'Adicionando...' : 'Adicionar'}
          </button>
        </>
      }
    >
      <form id="member-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">
            Profissional *
          </label>
          <select
            value={professionalId}
            onChange={(e) => setProfessionalId(e.target.value)}
            className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
          >
            <option value="">Selecione...</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.role === 'admin' ? 'Admin' : 'Profissional'})
              </option>
            ))}
          </select>
          {available.length === 0 && (
            <p className="mt-1 text-xs text-app-muted">
              Todos os profissionais já estão na equipe.
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">
            Role no Projeto
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as ProjectRole)}
            className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
          >
            {Object.entries(ROLE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </form>
    </Modal>
  );
}
