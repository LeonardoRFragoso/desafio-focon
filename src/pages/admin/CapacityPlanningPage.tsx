import { useState, useEffect, useCallback, useMemo } from 'react';
import { capacityAPI, profilesAPI, projectsAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { Modal } from '@/components/Modal';
import type {
  Profile,
  CapacityOverview,
  CapacityProfessional,
  CapacityStatus,
  ProfessionalCapacityRule,
  ProjectAllocation,
  AllocationType,
} from '@/types/database';

const STATUS_LABELS: Record<CapacityStatus, string> = {
  available: 'Disponível',
  well_allocated: 'Bem alocado',
  overloaded: 'Sobrecarregado',
  no_capacity: 'Sem capacidade',
};

const STATUS_STYLES: Record<CapacityStatus, string> = {
  available: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  well_allocated: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  overloaded: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  no_capacity: 'bg-slate-100 text-slate-600 dark:bg-surface-secondary text-app-muted',
};

const ALLOCATION_TYPE_LABELS: Record<AllocationType, string> = {
  planned: 'Planejado',
  confirmed: 'Confirmado',
  tentative: 'Tentativa',
};

interface PeriodPreset {
  label: string;
  offset: number;
  duration: number;
}

const PERIOD_PRESETS: PeriodPreset[] = [
  { label: 'Esta semana', offset: 0, duration: 7 },
  { label: 'Próxima semana', offset: 7, duration: 7 },
  { label: 'Este mês', offset: 0, duration: 30 },
  { label: 'Próximo mês', offset: 30, duration: 30 },
];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}

function formatMinutes(min: number | null): string {
  if (min === null || min === undefined) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

export function CapacityPlanningPage() {
  const [overview, setOverview] = useState<CapacityOverview | null>(null);
  const [rules, setRules] = useState<ProfessionalCapacityRule[]>([]);
  const [allocations, setAllocations] = useState<ProjectAllocation[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [capacityModalOpen, setCapacityModalOpen] = useState(false);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ProfessionalCapacityRule | null>(null);
  const [editingAllocation, setEditingAllocation] = useState<ProjectAllocation | null>(null);
  const [expandedProf, setExpandedProf] = useState<string | null>(null);

  // Form state for capacity rule
  const [ruleForm, setRuleForm] = useState({
    professional_id: '',
    weekly_capacity_minutes: 2400,
    valid_from: new Date().toISOString().slice(0, 10),
    valid_until: '',
  });

  // Form state for allocation
  const [allocForm, setAllocForm] = useState({
    project_id: '',
    professional_id: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    allocated_minutes: 600,
    allocation_type: 'planned' as AllocationType,
    notes: '',
  });

  const { startDate, endDate } = useMemo(() => {
    if (customStart && customEnd) {
      return { startDate: customStart, endDate: customEnd };
    }
    const preset: PeriodPreset = PERIOD_PRESETS[selectedPreset] ?? { label: 'Esta semana', offset: 0, duration: 7 };
    const base = getWeekStart(new Date());
    base.setDate(base.getDate() + preset.offset);
    const end = new Date(base);
    end.setDate(end.getDate() + preset.duration - 1);
    return {
      startDate: base.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }, [selectedPreset, customStart, customEnd]);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await capacityAPI.getOverview(startDate, endDate);
      if (err) throw err;
      setOverview(data as unknown as CapacityOverview);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar capacidade');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const fetchRules = useCallback(async () => {
    try {
      const { data, error: err } = await capacityAPI.listCapacityRules();
      if (err) throw err;
      setRules((data as ProfessionalCapacityRule[]) || []);
    } catch {
      setRules([]);
    }
  }, []);

  const fetchAllocations = useCallback(async () => {
    try {
      const { data, error: err } = await capacityAPI.listAllocations();
      if (err) throw err;
      setAllocations((data as ProjectAllocation[]) || []);
    } catch {
      setAllocations([]);
    }
  }, []);

  const fetchAux = useCallback(async () => {
    try {
      const { data: profData } = await profilesAPI.list();
      setProfiles((profData as Profile[]) || []);
      const { data: projData } = await projectsAPI.listActive();
      setProjects(
        ((projData as { id: string; name: string }[]) || []).map((p) => ({
          id: p.id,
          name: p.name,
        }))
      );
    } catch {
      setProfiles([]);
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRules();
    fetchAllocations();
    fetchAux();
  }, [fetchRules, fetchAllocations, fetchAux]);

  const handleSaveRule = async () => {
    setActionError(null);
    try {
      const data = {
        professional_id: ruleForm.professional_id,
        weekly_capacity_minutes: ruleForm.weekly_capacity_minutes,
        valid_from: ruleForm.valid_from,
        valid_until: ruleForm.valid_until || null,
      };
      if (editingRule) {
        const { error: err } = await capacityAPI.updateCapacityRule(editingRule.id, data);
        if (err) throw err;
      } else {
        const { error: err } = await capacityAPI.createCapacityRule(data);
        if (err) throw err;
      }
      setCapacityModalOpen(false);
      fetchRules();
      fetchOverview();
    } catch (err) {
      setActionError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao salvar capacidade');
    }
  };

  const handleSaveAllocation = async () => {
    setActionError(null);
    try {
      const data = {
        project_id: allocForm.project_id,
        professional_id: allocForm.professional_id,
        start_date: allocForm.start_date,
        end_date: allocForm.end_date,
        allocated_minutes: allocForm.allocated_minutes,
        allocation_type: allocForm.allocation_type,
        notes: allocForm.notes || null,
      };
      if (editingAllocation) {
        const { error: err } = await capacityAPI.updateAllocation(editingAllocation.id, data);
        if (err) throw err;
      } else {
        const { error: err } = await capacityAPI.createAllocation(data);
        if (err) throw err;
      }
      setAllocationModalOpen(false);
      fetchAllocations();
      fetchOverview();
    } catch (err) {
      setActionError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao salvar alocação');
    }
  };

  const handleDeleteRule = async (id: string) => {
    setActionError(null);
    try {
      const { error: err } = await capacityAPI.deleteCapacityRule(id);
      if (err) throw err;
      fetchRules();
      fetchOverview();
    } catch (err) {
      setActionError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao excluir capacidade');
    }
  };

  const handleDeleteAllocation = async (id: string) => {
    setActionError(null);
    try {
      const { error: err } = await capacityAPI.deleteAllocation(id);
      if (err) throw err;
      fetchAllocations();
      fetchOverview();
    } catch (err) {
      setActionError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao excluir alocação');
    }
  };

  const openCreateRule = () => {
    setEditingRule(null);
    setRuleForm({
      professional_id: '',
      weekly_capacity_minutes: 2400,
      valid_from: new Date().toISOString().slice(0, 10),
      valid_until: '',
    });
    setActionError(null);
    setCapacityModalOpen(true);
  };

  const openEditRule = (rule: ProfessionalCapacityRule) => {
    setEditingRule(rule);
    setRuleForm({
      professional_id: rule.professional_id,
      weekly_capacity_minutes: rule.weekly_capacity_minutes,
      valid_from: rule.valid_from,
      valid_until: rule.valid_until ?? '',
    });
    setActionError(null);
    setCapacityModalOpen(true);
  };

  const openCreateAllocation = (profId?: string) => {
    setEditingAllocation(null);
    setAllocForm({
      project_id: '',
      professional_id: profId ?? '',
      start_date: startDate,
      end_date: endDate,
      allocated_minutes: 600,
      allocation_type: 'planned',
      notes: '',
    });
    setActionError(null);
    setAllocationModalOpen(true);
  };

  const openEditAllocation = (alloc: ProjectAllocation) => {
    setEditingAllocation(alloc);
    setAllocForm({
      project_id: alloc.project_id,
      professional_id: alloc.professional_id,
      start_date: alloc.start_date,
      end_date: alloc.end_date,
      allocated_minutes: alloc.allocated_minutes,
      allocation_type: alloc.allocation_type,
      notes: alloc.notes ?? '',
    });
    setActionError(null);
    setAllocationModalOpen(true);
  };

  if (loading && !overview) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
        <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        <button
          onClick={fetchOverview}
          className="mt-2 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const memberProfiles = profiles.filter((p) => p.role === 'member');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h2 className="text-2xl font-bold text-app-primary">Capacidade da Equipe</h2>
          <p className="text-app-muted">Planeje e monitore a capacidade dos profissionais</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openCreateRule}
            className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition text-sm"
          >
            Definir Capacidade
          </button>
          <button
            onClick={() => openCreateAllocation()}
            className="px-4 py-2 bg-surface-elevated border border-app-strong text-app-secondary hover:bg-hover-surface rounded-lg font-medium transition text-sm"
          >
            Nova Alocação
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap gap-2 items-center">
        {PERIOD_PRESETS.map((preset, i) => (
          <button
            key={i}
            onClick={() => {
              setSelectedPreset(i);
              setCustomStart('');
              setCustomEnd('');
            }}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
              selectedPreset === i && !customStart
                ? 'bg-focon-600 text-white'
                : 'bg-surface-secondary text-app-secondary hover:bg-hover-surface'
            }`}
          >
            {preset.label}
          </button>
        ))}
        <span className="text-app-muted text-sm">ou</span>
        <input
          type="date"
          value={customStart}
          onChange={(e) => setCustomStart(e.target.value)}
          className="px-2 py-1 text-sm border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
        />
        <span className="text-app-muted text-sm">→</span>
        <input
          type="date"
          value={customEnd}
          onChange={(e) => setCustomEnd(e.target.value)}
          className="px-2 py-1 text-sm border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
        />
      </div>

      {/* Summary cards */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface-primary rounded-xl border border-app-primary p-4 shadow-sm">
            <p className="text-sm text-app-muted">Profissionais</p>
            <p className="text-2xl font-bold text-app-primary">{overview.summary.total_professionals}</p>
          </div>
          <div className="bg-surface-primary rounded-xl border border-app-primary p-4 shadow-sm">
            <p className="text-sm text-app-muted">Sobrecarregados</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{overview.summary.overloaded_count}</p>
          </div>
          <div className="bg-surface-primary rounded-xl border border-app-primary p-4 shadow-sm">
            <p className="text-sm text-app-muted">Bem alocados</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{overview.summary.well_allocated_count}</p>
          </div>
          <div className="bg-surface-primary rounded-xl border border-app-primary p-4 shadow-sm">
            <p className="text-sm text-app-muted">Disponíveis</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{overview.summary.available_count}</p>
          </div>
        </div>
      )}

      {actionError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
          <p className="text-sm text-red-800 dark:text-red-400">{actionError}</p>
        </div>
      )}

      {/* Capacity overview table */}
      {overview && overview.professionals.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-app-primary shadow-sm">
          <table className="w-full">
            <thead className="bg-surface-secondary border-b border-app-primary">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Profissional</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-app-primary">Capacidade</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-app-primary">Alocado</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-app-primary">Disponível</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-app-primary">Utilização</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-app-primary">Realizado</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Projetos</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-app-primary">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-table-divider">
              {overview.professionals.map((prof: CapacityProfessional) => (
                <>
                  <tr
                    key={prof.professional_id}
                    className="hover:bg-hover-surface transition cursor-pointer"
                    onClick={() =>
                      setExpandedProf(expandedProf === prof.professional_id ? null : prof.professional_id)
                    }
                  >
                    <td className="px-4 py-3 text-sm font-medium text-app-primary">{prof.full_name}</td>
                    <td className="px-4 py-3 text-sm text-right text-app-secondary">
                      {formatMinutes(prof.capacity_minutes)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-app-secondary">
                      {formatMinutes(prof.allocated_minutes)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-app-secondary">
                      {formatMinutes(prof.available_minutes)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-app-secondary">
                      {prof.utilization_percent !== null ? `${prof.utilization_percent}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-app-secondary">
                      {formatMinutes(prof.actual_minutes)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[prof.status]}`}
                      >
                        {STATUS_LABELS[prof.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-app-muted">
                      {prof.projects.length > 0 ? `${prof.projects.length} projeto(s)` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openCreateAllocation(prof.professional_id);
                        }}
                        className="text-xs px-2 py-1 text-focon-600 dark:text-focon-400 hover:underline"
                      >
                        Alocar
                      </button>
                    </td>
                  </tr>
                  {expandedProf === prof.professional_id && prof.projects.length > 0 && (
                    <tr key={`${prof.professional_id}-detail`} className="bg-surface-secondary">
                      <td colSpan={9} className="px-8 py-3">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-app-muted uppercase tracking-wide">
                            Projetos alocados no período
                          </p>
                          {prof.projects.map((proj, i) => (
                            <div
                              key={i}
                              className="flex flex-wrap items-center gap-4 text-sm text-app-secondary"
                            >
                              <span className="font-medium text-app-primary">{proj.project_name}</span>
                              <span>{formatMinutes(proj.allocated_minutes)}</span>
                              <span>
                                {formatDate(proj.start_date)} → {formatDate(proj.end_date)}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded bg-surface-elevated text-app-muted">
                                {ALLOCATION_TYPE_LABELS[proj.allocation_type]}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-app-primary p-12 text-center bg-surface-primary">
          <p className="text-app-muted">Nenhum profissional encontrado</p>
          <p className="text-sm text-app-muted mt-2">
            Defina capacidades e alocações para visualizar o planejamento
          </p>
        </div>
      )}

      {/* Capacity rules section */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-app-primary">Regras de Capacidade</h3>
        {rules.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-app-primary shadow-sm">
            <table className="w-full">
              <thead className="bg-surface-secondary border-b border-app-primary">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Profissional</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-app-primary">Capacidade Semanal</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Válido desde</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Válido até</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-app-primary">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-table-divider">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-hover-surface transition">
                    <td className="px-4 py-3 text-sm font-medium text-app-primary">
                      {rule.professional?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-app-secondary">
                      {formatMinutes(rule.weekly_capacity_minutes)}
                    </td>
                    <td className="px-4 py-3 text-sm text-app-secondary">{formatDate(rule.valid_from)}</td>
                    <td className="px-4 py-3 text-sm text-app-secondary">
                      {rule.valid_until ? formatDate(rule.valid_until) : 'Indefinido'}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => openEditRule(rule)}
                        className="text-xs px-2 py-1 text-focon-600 dark:text-focon-400 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:underline"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-app-muted">Nenhuma regra de capacidade definida</p>
        )}
      </div>

      {/* Allocations section */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-app-primary">Alocações</h3>
        {allocations.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-app-primary shadow-sm">
            <table className="w-full">
              <thead className="bg-surface-secondary border-b border-app-primary">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Profissional</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Projeto</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Período</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-app-primary">Minutos</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Tipo</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-app-primary">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-table-divider">
                {allocations.map((alloc) => (
                  <tr key={alloc.id} className="hover:bg-hover-surface transition">
                    <td className="px-4 py-3 text-sm font-medium text-app-primary">
                      {alloc.professional?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-app-secondary">
                      {alloc.project?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-app-secondary">
                      {formatDate(alloc.start_date)} → {formatDate(alloc.end_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-app-secondary">
                      {formatMinutes(alloc.allocated_minutes)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded bg-surface-elevated text-app-muted">
                        {ALLOCATION_TYPE_LABELS[alloc.allocation_type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => openEditAllocation(alloc)}
                        className="text-xs px-2 py-1 text-focon-600 dark:text-focon-400 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDeleteAllocation(alloc.id)}
                        className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:underline"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-app-muted">Nenhuma alocação criada</p>
        )}
      </div>

      {/* Capacity rule modal */}
      <Modal
        open={capacityModalOpen}
        onClose={() => setCapacityModalOpen(false)}
        title={editingRule ? 'Editar Capacidade' : 'Definir Capacidade'}
        footer={
          <>
            <button
              onClick={() => setCapacityModalOpen(false)}
              className="px-4 py-2 border border-app-strong text-app-secondary hover:bg-hover-surface rounded-lg transition text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveRule}
              className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition text-sm"
            >
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Profissional</label>
            <select
              value={ruleForm.professional_id}
              onChange={(e) => setRuleForm({ ...ruleForm, professional_id: e.target.value })}
              disabled={!!editingRule}
              className="w-full px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600 disabled:opacity-50"
            >
              <option value="">Selecione...</option>
              {memberProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">
              Capacidade semanal (minutos)
            </label>
            <input
              type="number"
              value={ruleForm.weekly_capacity_minutes}
              onChange={(e) =>
                setRuleForm({ ...ruleForm, weekly_capacity_minutes: parseInt(e.target.value, 10) || 0 })
              }
              className="w-full px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
            <p className="text-xs text-app-muted mt-1">
              {formatMinutes(ruleForm.weekly_capacity_minutes)} ({(ruleForm.weekly_capacity_minutes / 60).toFixed(1)}h)
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-app-secondary mb-1">Válido desde</label>
              <input
                type="date"
                value={ruleForm.valid_from}
                onChange={(e) => setRuleForm({ ...ruleForm, valid_from: e.target.value })}
                className="w-full px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-app-secondary mb-1">Válido até (opcional)</label>
              <input
                type="date"
                value={ruleForm.valid_until}
                onChange={(e) => setRuleForm({ ...ruleForm, valid_until: e.target.value })}
                className="w-full px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Allocation modal */}
      <Modal
        open={allocationModalOpen}
        onClose={() => setAllocationModalOpen(false)}
        title={editingAllocation ? 'Editar Alocação' : 'Nova Alocação'}
        footer={
          <>
            <button
              onClick={() => setAllocationModalOpen(false)}
              className="px-4 py-2 border border-app-strong text-app-secondary hover:bg-hover-surface rounded-lg transition text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveAllocation}
              className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition text-sm"
            >
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Profissional</label>
            <select
              value={allocForm.professional_id}
              onChange={(e) => setAllocForm({ ...allocForm, professional_id: e.target.value })}
              disabled={!!editingAllocation}
              className="w-full px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600 disabled:opacity-50"
            >
              <option value="">Selecione...</option>
              {memberProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Projeto</label>
            <select
              value={allocForm.project_id}
              onChange={(e) => setAllocForm({ ...allocForm, project_id: e.target.value })}
              className="w-full px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            >
              <option value="">Selecione...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-app-secondary mb-1">Início</label>
              <input
                type="date"
                value={allocForm.start_date}
                onChange={(e) => setAllocForm({ ...allocForm, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-app-secondary mb-1">Fim</label>
              <input
                type="date"
                value={allocForm.end_date}
                onChange={(e) => setAllocForm({ ...allocForm, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-app-secondary mb-1">
                Minutos alocados
              </label>
              <input
                type="number"
                value={allocForm.allocated_minutes}
                onChange={(e) =>
                  setAllocForm({ ...allocForm, allocated_minutes: parseInt(e.target.value, 10) || 0 })
                }
                className="w-full px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
              />
              <p className="text-xs text-app-muted mt-1">
                {formatMinutes(allocForm.allocated_minutes)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-app-secondary mb-1">Tipo</label>
              <select
                value={allocForm.allocation_type}
                onChange={(e) =>
                  setAllocForm({ ...allocForm, allocation_type: e.target.value as AllocationType })
                }
                className="w-full px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
              >
                <option value="planned">{ALLOCATION_TYPE_LABELS.planned}</option>
                <option value="confirmed">{ALLOCATION_TYPE_LABELS.confirmed}</option>
                <option value="tentative">{ALLOCATION_TYPE_LABELS.tentative}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Notas (opcional)</label>
            <textarea
              value={allocForm.notes}
              onChange={(e) => setAllocForm({ ...allocForm, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
