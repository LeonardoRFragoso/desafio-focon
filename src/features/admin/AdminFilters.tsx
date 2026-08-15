import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { AdminFilterValues, FilterOption } from '@/types/admin';

interface AdminFiltersProps {
  filters: AdminFilterValues;
  onFilterChange: (filters: AdminFilterValues) => void;
  onClearFilters?: () => void;
}

export function AdminFilters({ filters, onFilterChange, onClearFilters }: AdminFiltersProps) {
  const [projects, setProjects] = useState<FilterOption[]>([]);
  const [professionals, setProfessionals] = useState<FilterOption[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [projectsRes, professionalsRes] = await Promise.all([
          supabase.from('projects').select('id, name').order('name'),
          supabase
            .from('profiles')
            .select('id, full_name')
            .eq('role', 'member')
            .order('full_name'),
        ]);

        if (projectsRes.data) {
          setProjects(projectsRes.data.map(p => ({ id: p.id, name: p.name })));
        }
        if (professionalsRes.data) {
          setProfessionals(professionalsRes.data.map(p => ({ id: p.id, name: p.full_name })));
        }
      } catch (err) {
        console.error('Erro ao carregar filtros:', err);
      }
    };

    fetchData();
  }, []);

  const handleProjectChange = (projectId: string) => {
    const projectName = projects.find(p => p.id === projectId)?.name || '';
    const newFilters = { ...filters, projectId, projectName };
    onFilterChange(newFilters);
  };

  const handleProfessionalChange = (professionalId: string) => {
    const professionalName = professionals.find(p => p.id === professionalId)?.name || '';
    const newFilters = { ...filters, professionalId, professionalName };
    onFilterChange(newFilters);
  };

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    const newFilters = { ...filters, [field]: value };
    onFilterChange(newFilters);
  };

  const handleClearFilters = () => {
    const clearedFilters: AdminFilterValues = {
      projectId: '',
      projectName: '',
      professionalId: '',
      professionalName: '',
      startDate: '',
      endDate: '',
    };
    onFilterChange(clearedFilters);
    onClearFilters?.();
  };

  return (
    <div className="bg-surface-primary rounded-xl border border-app-primary p-6 shadow-sm space-y-6">
      <h3 className="text-xl font-semibold text-app-primary">Filtros</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label htmlFor="project" className="block text-sm font-medium text-app-secondary mb-2">
            Projeto
          </label>
          <select
            id="project"
            value={filters.projectId}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600 focus:border-transparent transition"
          >
            <option value="">Todos os projetos</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="professional" className="block text-sm font-medium text-app-secondary mb-2">
            Profissional
          </label>
          <select
            id="professional"
            value={filters.professionalId}
            onChange={(e) => handleProfessionalChange(e.target.value)}
            className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600 focus:border-transparent transition"
          >
            <option value="">Todos os profissionais</option>
            {professionals.map((prof) => (
              <option key={prof.id} value={prof.id}>
                {prof.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="startDate" className="block text-sm font-medium text-app-secondary mb-2">
            Data Inicial
          </label>
          <input
            id="startDate"
            type="date"
            value={filters.startDate}
            onChange={(e) => handleDateChange('startDate', e.target.value)}
            className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600 focus:border-transparent transition"
          />
        </div>

        <div>
          <label htmlFor="endDate" className="block text-sm font-medium text-app-secondary mb-2">
            Data Final
          </label>
          <input
            id="endDate"
            type="date"
            value={filters.endDate}
            onChange={(e) => handleDateChange('endDate', e.target.value)}
            className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600 focus:border-transparent transition"
          />
        </div>
      </div>

      {(filters.projectId ||
        filters.professionalId ||
        filters.startDate ||
        filters.endDate) && (
        <div className="flex justify-end">
          <button
            onClick={handleClearFilters}
            className="px-4 py-2 text-sm font-medium text-app-secondary bg-surface-secondary hover:bg-hover-surface rounded-lg transition"
          >
            Limpar Filtros
          </button>
        </div>
      )}
    </div>
  );
}
