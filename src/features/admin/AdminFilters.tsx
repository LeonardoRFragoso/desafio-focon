import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { AdminFilterValues, FilterOption } from '@/types/admin';

interface AdminFiltersProps {
  onFilterChange: (filters: AdminFilterValues) => void;
}

export function AdminFilters({ onFilterChange }: AdminFiltersProps) {
  const [projects, setProjects] = useState<FilterOption[]>([]);
  const [professionals, setProfessionals] = useState<FilterOption[]>([]);
  const [filters, setFilters] = useState<AdminFilterValues>({
    projectId: '',
    projectName: '',
    professionalId: '',
    professionalName: '',
    startDate: '',
    endDate: '',
  });

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
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleProfessionalChange = (professionalId: string) => {
    const professionalName = professionals.find(p => p.id === professionalId)?.name || '';
    const newFilters = { ...filters, professionalId, professionalName };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    const newFilters = { ...filters, [field]: value };
    setFilters(newFilters);
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
    setFilters(clearedFilters);
    onFilterChange(clearedFilters);
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
      <h3 className="text-lg font-semibold text-slate-900">Filtros</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label htmlFor="project" className="block text-sm font-medium text-slate-700 mb-1">
            Projeto
          </label>
          <select
            id="project"
            value={filters.projectId}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
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
          <label htmlFor="professional" className="block text-sm font-medium text-slate-700 mb-1">
            Profissional
          </label>
          <select
            id="professional"
            value={filters.professionalId}
            onChange={(e) => handleProfessionalChange(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
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
          <label htmlFor="startDate" className="block text-sm font-medium text-slate-700 mb-1">
            Data Inicial
          </label>
          <input
            id="startDate"
            type="date"
            value={filters.startDate}
            onChange={(e) => handleDateChange('startDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
          />
        </div>

        <div>
          <label htmlFor="endDate" className="block text-sm font-medium text-slate-700 mb-1">
            Data Final
          </label>
          <input
            id="endDate"
            type="date"
            value={filters.endDate}
            onChange={(e) => handleDateChange('endDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleClearFilters}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
        >
          Limpar Filtros
        </button>
      </div>
    </div>
  );
}
