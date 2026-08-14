import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { TimeEntryWithRelations, ProjectFinancialsWithRelations } from '@/types/database';

interface FilterValues {
  projectId: string;
  professionalId: string;
  startDate: string;
  endDate: string;
}

interface ReportData {
  revenue: number;
  laborCost: number;
  tax: number;
  indirectCost: number;
  result: number;
  margin: number;
  professionals: Array<{
    name: string;
    hours: number;
    hourlyRate: number;
    cost: number;
  }>;
  projects: Array<{
    name: string;
    revenue: number;
  }>;
}

interface FinancialReportProps {
  filters: FilterValues;
}

export function FinancialReport({ filters }: FinancialReportProps) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReportData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      // Fetch time entries
      let query = supabase
        .from('time_entries')
        .select(
          `
          id,
          project_id,
          professional_id,
          duration_minutes,
          applied_hourly_rate,
          entry_date,
          project:projects!time_entries_project_id_fkey(name),
          professional:profiles!time_entries_professional_id_fkey(full_name)
        `
        )
        .eq('approval_status', 'approved');

      if (filters.projectId) query = query.eq('project_id', filters.projectId);
      if (filters.professionalId) query = query.eq('professional_id', filters.professionalId);
      if (filters.startDate) query = query.gte('entry_date', filters.startDate);
      if (filters.endDate) query = query.lte('entry_date', filters.endDate);

      const { data: entries, error: entriesError } = await query;
      if (entriesError) throw entriesError;

      // Fetch project financials
      let projectQuery = supabase
        .from('project_financials')
        .select('project_id, contracted_revenue, tax_rate, indirect_cost, project:projects!project_financials_project_id_fkey(name)');

      if (filters.projectId) projectQuery = projectQuery.eq('project_id', filters.projectId);

      const { data: financials, error: financialsError } = await projectQuery;
      if (financialsError) throw financialsError;

      // Calculate report data
      let totalRevenue = 0;
      let totalLaborCost = 0;
      let totalTax = 0;
      let totalIndirectCost = 0;

      interface ProfessionalEntry {
        name: string;
        hours: number;
        hourlyRate: number;
        cost: number;
      }

      interface ProjectEntry {
        name: string;
        revenue: number;
      }

      const profMap = new Map<string, ProfessionalEntry>();
      const projectMap = new Map<string, ProjectEntry>();

      (entries as TimeEntryWithRelations[] | undefined)?.forEach((entry) => {
        const cost = (entry.duration_minutes / 60) * entry.applied_hourly_rate;
        totalLaborCost += cost;

        const profId = entry.professional_id;
        const profName = entry.professional?.[0]?.full_name || 'Desconhecido';

        if (!profMap.has(profId)) {
          profMap.set(profId, {
            name: profName,
            hours: 0,
            hourlyRate: entry.applied_hourly_rate,
            cost: 0,
          });
        }

        const prof = profMap.get(profId);
        if (prof) {
          prof.hours += entry.duration_minutes;
          prof.cost += cost;
        }
      });

      (financials as ProjectFinancialsWithRelations[] | undefined)?.forEach((f) => {
        totalRevenue += f.contracted_revenue;
        totalTax += f.contracted_revenue * f.tax_rate;
        totalIndirectCost += f.indirect_cost;
        projectMap.set(f.project_id, {
          name: f.project?.[0]?.name || 'Desconhecido',
          revenue: f.contracted_revenue,
        });
      });

      const totalResult = totalRevenue - totalLaborCost - totalTax - totalIndirectCost;
      const totalMargin = totalRevenue > 0 ? (totalResult / totalRevenue) * 100 : 0;

      setData({
        revenue: totalRevenue,
        laborCost: totalLaborCost,
        tax: totalTax,
        indirectCost: totalIndirectCost,
        result: totalResult,
        margin: totalMargin,
        professionals: Array.from(profMap.values()),
        projects: Array.from(projectMap.values()),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao gerar relatório';
      setError(message);
      console.error('Erro ao gerar relatório:', err);
    } finally {
      setLoading(false);
    }
  }, [filters.projectId, filters.professionalId, filters.startDate, filters.endDate]);

  useEffect(() => {
    let isMounted = true;
    
    const load = async () => {
      await fetchReportData();
    };
    
    if (isMounted) {
      load();
    }
    
    return () => {
      isMounted = false;
    };
  }, [fetchReportData]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatHours = (minutes: number) => {
    const hours = minutes / 60;
    return `${hours.toFixed(1)}h`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4">
        <p className="text-sm font-medium text-red-800">Erro ao gerar relatório:</p>
        <p className="text-sm text-red-700 mt-1">{error}</p>
      </div>
    );
  }

  if (!data) {
    return <div className="text-center py-12 text-slate-600">Nenhum dado para exibir</div>;
  }

  const hasFilters = filters.projectId || filters.professionalId || filters.startDate || filters.endDate;

  return (
    <div className="bg-white p-8 space-y-8 print:p-4 print:space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-200 pb-8 print:pb-4 print:border-b-2 print:border-slate-900">
        <div>
          <img
            src="/brand/focon-logo-horizontal.png"
            alt="Fócon Engenharia"
            className="h-12 object-contain"
          />
          <h1 className="mt-4 text-3xl font-bold text-slate-900">FoconFlow</h1>
          <p className="text-slate-600">Relatório Financeiro</p>
        </div>
        <div className="text-right text-sm text-slate-600">
          <p>Gerado em: {new Date().toLocaleDateString('pt-BR')}</p>
          <p>Hora: {new Date().toLocaleTimeString('pt-BR')}</p>
        </div>
      </div>

      {/* Applied Filters */}
      {hasFilters && (
        <div className="bg-slate-50 border border-slate-200 p-4 text-sm print:border print:border-slate-900">
          <p className="font-semibold text-slate-900 mb-2">Filtros Aplicados:</p>
          <div className="space-y-1 text-slate-700">
            {filters.projectId && data && (
              <p>• Projeto: {data.projects.find(p => p.name !== 'Desconhecido')?.name || filters.projectId}</p>
            )}
            {filters.professionalId && data && (
              <p>• Profissional: {data.professionals.find(p => p.name !== 'Desconhecido')?.name || filters.professionalId}</p>
            )}
            {filters.startDate && <p>• Data Inicial: {new Date(filters.startDate).toLocaleDateString('pt-BR')}</p>}
            {filters.endDate && <p>• Data Final: {new Date(filters.endDate).toLocaleDateString('pt-BR')}</p>}
          </div>
        </div>
      )}
      {!hasFilters && (
        <div className="bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
          <p className="font-semibold">Nenhum filtro aplicado - Exibindo todos os dados</p>
        </div>
      )}

      {/* Indicators */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:gap-2">
        <div className="bg-blue-50 border border-blue-200 p-4 print:border print:border-slate-900">
          <p className="text-xs font-semibold text-slate-600 uppercase">Receita</p>
          <p className="text-xl font-bold text-blue-900 mt-2">{formatCurrency(data.revenue)}</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 p-4 print:border print:border-slate-900">
          <p className="text-xs font-semibold text-slate-600 uppercase">Mão de Obra</p>
          <p className="text-xl font-bold text-orange-900 mt-2">{formatCurrency(data.laborCost)}</p>
        </div>
        <div className="bg-green-50 border border-green-200 p-4 print:border print:border-slate-900">
          <p className="text-xs font-semibold text-slate-600 uppercase">Resultado</p>
          <p className="text-xl font-bold text-green-900 mt-2">{formatCurrency(data.result)}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 p-4 print:border print:border-slate-900">
          <p className="text-xs font-semibold text-slate-600 uppercase">Margem</p>
          <p className="text-xl font-bold text-purple-900 mt-2">{data.margin.toFixed(2)}%</p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:gap-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-slate-900">Composição do Resultado</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Receita</span>
              <span className="font-semibold">{formatCurrency(data.revenue)}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>- Mão de Obra</span>
              <span className="font-semibold">{formatCurrency(data.laborCost)}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>- Imposto (8%)</span>
              <span className="font-semibold">{formatCurrency(data.tax)}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>- Custo Indireto</span>
              <span className="font-semibold">{formatCurrency(data.indirectCost)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 mt-1 text-green-600 font-bold">
              <span>Resultado</span>
              <span>{formatCurrency(data.result)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold text-slate-900">Projetos</h3>
          <div className="space-y-1 text-sm">
            {data.projects.map((project) => (
              <div key={project.name} className="flex justify-between">
                <span>{project.name}</span>
                <span className="font-semibold">{formatCurrency(project.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Professionals table */}
      <div className="space-y-2">
        <h3 className="font-semibold text-slate-900">Resumo por Profissional</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse print:text-xs">
            <thead>
              <tr className="border-b border-slate-200 print:border-b-2 print:border-slate-900">
                <th className="text-left py-2 px-2 font-semibold">Profissional</th>
                <th className="text-right py-2 px-2 font-semibold">Horas</th>
                <th className="text-right py-2 px-2 font-semibold">Custo/h</th>
                <th className="text-right py-2 px-2 font-semibold">Custo Total</th>
              </tr>
            </thead>
            <tbody>
              {data.professionals.map((prof) => (
                <tr key={prof.name} className="border-b border-slate-100 print:border-b print:border-slate-900">
                  <td className="py-2 px-2">{prof.name}</td>
                  <td className="text-right py-2 px-2">{formatHours(prof.hours)}</td>
                  <td className="text-right py-2 px-2">{formatCurrency(prof.hourlyRate)}</td>
                  <td className="text-right py-2 px-2 font-semibold">{formatCurrency(prof.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 pt-8 text-center text-xs text-slate-500 print:border-t-2 print:border-slate-900 print:text-slate-900">
        <p>FoconFlow - Sistema de Controle de Produção e Rentabilidade</p>
        <p>Fócon Engenharia</p>
      </div>
    </div>
  );
}
