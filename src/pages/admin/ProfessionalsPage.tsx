import { useState, useEffect, useCallback } from 'react';
import { profilesAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { Modal } from '@/components/Modal';
import type { Profile, UserRole } from '@/types/database';

export function ProfessionalsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Profissionais</h2>
        <p className="text-slate-600">Gerencie os profissionais e seus papéis</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}
      {actionError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm font-medium text-red-800">{actionError}</p>
        </div>
      )}

      {profiles.length === 0 ? (
        <div className="rounded-xl border border-slate-200 p-12 text-center bg-slate-50">
          <p className="text-slate-600">Nenhum profissional cadastrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Nome</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Papel</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Criado em</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {profiles.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-sm text-slate-900 font-medium">{p.full_name}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${p.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                      {p.role === 'admin' ? 'Administrador' : 'Profissional'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatDate(p.created_at)}</td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => setEditTarget(p)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                    >
                      Alterar papel
                    </button>
                  </td>
                </tr>
              ))}
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
    </div>
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
          <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" form="role-form" disabled={submitting} className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50">
            {submitting ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="role-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Alterando o papel de <strong>{profile.full_name}</strong>:
        </p>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Papel *</label>
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
            <option value="member">Profissional</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <p className="text-xs text-slate-500">
          Administradores podem aprovar/rejeitar apontamentos, gerenciar projetos,
          profissionais, valor/hora, financeiro e fechamentos.
        </p>
      </form>
    </Modal>
  );
}
