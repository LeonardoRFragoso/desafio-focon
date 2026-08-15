import { useState, useEffect, useCallback, useMemo } from 'react';
import { profilesAPI } from '@/lib/supabase/api';
import { supabase } from '@/lib/supabase/client';
import { mapDatabaseError } from '@/lib/errors';
import { Modal } from '@/components/Modal';
import { useDebounce } from '@/hooks/usePagination';
import type { Profile, UserRole } from '@/types/database';

interface ProfessionalDetails {
  currentRate: number | null;
  totalMinutes: number;
  approvedMinutes: number;
  pendingMinutes: number;
  rejectedMinutes: number;
  projects: { id: string; name: string; project_role: string }[];
}

export function ProfessionalsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const fetchProfiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await profilesAPI.list();
      if (err) throw err;
      setProfiles((data as Profile[]) || []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar profissionais');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProfiles();
  }, [fetchProfiles]);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

  const filteredProfiles = useMemo(() => {
    let result = profiles;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (p) =>
          (p.full_name ?? '').toLowerCase().includes(q)
      );
    }
    if (roleFilter) {
      result = result.filter((p) => p.role === roleFilter);
    }
    return result;
  }, [profiles, debouncedSearch, roleFilter]);

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
          <h2 className="text-2xl font-bold text-app-primary">Profissionais</h2>
          <p className="text-app-muted">Gerencie os profissionais e seus papéis</p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition"
        >
          Convidar Profissional
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

      {/* Search and filter */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou email..."
          className="flex-1 min-w-[180px] px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
        >
          <option value="">Todos os papéis</option>
          <option value="admin">Administrador</option>
          <option value="member">Profissional</option>
        </select>
      </div>

      {profiles.length === 0 ? (
        <div className="rounded-xl border border-app-primary p-12 text-center bg-surface-secondary/50">
          <p className="text-app-muted">Nenhum profissional cadastrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-app-primary shadow-sm">
          <table className="w-full">
            <thead className="bg-surface-secondary border-b border-app-primary">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Nome</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Papel</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Criado em</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-table-divider">
              {filteredProfiles.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-app-muted">Nenhum profissional encontrado</td></tr>
              ) : (
                filteredProfiles.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedProfile(p)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedProfile(p);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Ver detalhes de ${p.full_name}`}
                  className="hover:bg-hover-surface transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-focon-600"
                >
                  <td className="px-4 py-3 text-sm text-app-primary font-medium">{p.full_name}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${p.role === 'admin' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                      {p.role === 'admin' ? 'Administrador' : 'Profissional'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-app-secondary">{formatDate(p.created_at)}</td>
                  <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setEditTarget(p)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium border border-app-strong text-app-secondary hover:bg-hover-surface transition"
                    >
                      Alterar papel
                    </button>
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {editTarget && (
        <RoleEditModal
          profile={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            fetchProfiles();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {inviteOpen && (
        <InviteUserModal
          onClose={() => setInviteOpen(false)}
          onSaved={() => {
            setInviteOpen(false);
            fetchProfiles();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {selectedProfile && (
        <ProfessionalDetailsModal
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </div>
  );
}

interface InviteUserModalProps {
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function InviteUserModal({ onClose, onSaved, onError }: InviteUserModalProps) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !fullName.trim()) {
      onError('Preencha todos os campos.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) {
        onError('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await fetch(`${import.meta.env['VITE_SUPABASE_URL']}/functions/v1/invite-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          full_name: fullName.trim(),
          role,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        onError(result.error || 'Erro ao enviar convite');
        return;
      }

      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao enviar convite');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Convidar Profissional"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" form="invite-form" disabled={submitting} className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50">
            {submitting ? 'Enviando...' : 'Enviar Convite'}
          </button>
        </>
      }
    >
      <form id="invite-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">E-mail *</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" placeholder="profissional@email.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Nome Completo *</label>
          <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
        </div>
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Papel *</label>
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
            <option value="member">Profissional</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <p className="text-xs text-app-muted">
          O convite será enviado por e-mail. O usuário deverá definir sua senha ao aceitar.
        </p>
      </form>
    </Modal>
  );
}

interface RoleEditModalProps {
  profile: Profile;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function RoleEditModal({ profile, onClose, onSaved, onError }: RoleEditModalProps) {
  const [role, setRole] = useState<UserRole>(profile.role);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error: err } = await profilesAPI.updateRole(profile.id, role);
      if (err) throw err;
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao atualizar papel');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Alterar Papel"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" form="role-form" disabled={submitting} className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50">
            {submitting ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="role-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-app-muted">
          Alterando o papel de <strong>{profile.full_name}</strong>:
        </p>
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Papel *</label>
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
            <option value="member">Profissional</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <p className="text-xs text-app-muted">
          Administradores podem aprovar/rejeitar apontamentos, gerenciar projetos,
          profissionais, valor/hora, financeiro e fechamentos.
        </p>
      </form>
    </Modal>
  );
}

interface ProfessionalDetailsModalProps {
  profile: Profile;
  onClose: () => void;
}

function ProfessionalDetailsModal({ profile, onClose }: ProfessionalDetailsModalProps) {
  const [details, setDetails] = useState<ProfessionalDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rateRes, entriesRes, membersRes] = await Promise.all([
          supabase
            .from('hourly_rates')
            .select('hourly_rate')
            .eq('professional_id', profile.id)
            .is('valid_until', null)
            .maybeSingle(),
          supabase
            .from('time_entries')
            .select('duration_minutes, approval_status')
            .eq('professional_id', profile.id),
          supabase
            .from('project_members')
            .select('id, project_id, project_role, project:projects!project_members_project_id_fkey(name)')
            .eq('professional_id', profile.id),
        ]);

        if (cancelled) return;

        const entries = (entriesRes.data as { duration_minutes: number; approval_status: string }[]) || [];
        const totalMinutes = entries.reduce((s, e) => s + e.duration_minutes, 0);
        const approvedMinutes = entries
          .filter((e) => e.approval_status === 'approved')
          .reduce((s, e) => s + e.duration_minutes, 0);
        const pendingMinutes = entries
          .filter((e) => e.approval_status === 'pending')
          .reduce((s, e) => s + e.duration_minutes, 0);
        const rejectedMinutes = entries
          .filter((e) => e.approval_status === 'rejected')
          .reduce((s, e) => s + e.duration_minutes, 0);

        const members = (membersRes.data as { id: string; project_role: string; project?: { name: string } | null }[]) || [];
        const projects = members.map((m) => ({
          id: m.id,
          name: m.project?.name ?? 'Desconhecido',
          project_role: m.project_role,
        }));

        setDetails({
          currentRate: rateRes.data ? (rateRes.data as { hourly_rate: number }).hourly_rate : null,
          totalMinutes,
          approvedMinutes,
          pendingMinutes,
          rejectedMinutes,
          projects,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const roleLabels: Record<string, string> = {
    manager: 'Gerente',
    technical_lead: 'Líder Técnico',
    professional: 'Profissional',
    observer: 'Observador',
  };

  return (
    <Modal open onClose={onClose} title="Detalhes do Profissional" maxWidth="max-w-2xl">
      {loading ? (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Nome</p>
              <p className="text-sm text-app-primary font-medium">{profile.full_name}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Papel</p>
              <span className={`inline-block mt-1 px-2.5 py-1 rounded-full text-xs font-semibold ${profile.role === 'admin' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                {profile.role === 'admin' ? 'Administrador' : 'Profissional'}
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Valor/Hora Atual</p>
              <p className="text-sm text-app-primary font-semibold">
                {details?.currentRate != null ? formatCurrency(details.currentRate) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Criado em</p>
              <p className="text-sm text-app-secondary">{formatDate(profile.created_at)}</p>
            </div>
          </div>

          <div className="border-t border-app-primary pt-4">
            <h3 className="text-sm font-semibold text-app-primary mb-3">Horas Apontadas</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-surface-secondary p-3">
                <p className="text-xs text-app-muted">Total</p>
                <p className="text-sm font-semibold text-app-primary">{formatDuration(details?.totalMinutes ?? 0)}</p>
              </div>
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-3">
                <p className="text-xs text-green-700 dark:text-green-400">Aprovadas</p>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">{formatDuration(details?.approvedMinutes ?? 0)}</p>
              </div>
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-3">
                <p className="text-xs text-yellow-700 dark:text-yellow-400">Pendentes</p>
                <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">{formatDuration(details?.pendingMinutes ?? 0)}</p>
              </div>
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3">
                <p className="text-xs text-red-700 dark:text-red-400">Rejeitadas</p>
                <p className="text-sm font-semibold text-red-800 dark:text-red-300">{formatDuration(details?.rejectedMinutes ?? 0)}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-app-primary pt-4">
            <h3 className="text-sm font-semibold text-app-primary mb-3">Projetos Vinculados</h3>
            {details && details.projects.length > 0 ? (
              <ul className="space-y-2">
                {details.projects.map((proj) => (
                  <li key={proj.id} className="flex justify-between items-center rounded-lg bg-surface-secondary px-3 py-2">
                    <span className="text-sm text-app-primary font-medium">{proj.name}</span>
                    <span className="text-xs text-app-muted">{roleLabels[proj.project_role] || proj.project_role}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-app-muted">Nenhum projeto vinculado</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
