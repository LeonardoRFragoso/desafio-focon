import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

interface FilterValues {
  projectId: string;
  professionalId: string;
  startDate: string;
  endDate: string;
}

interface AdminFiltersProps {
  onFilterChange: (filters: FilterValues) => void;
}

interface Project {
  id: string;
  name: string;
}

interface Professional {
  id: string;
  full_name: string;
}

export function AdminFilters({ onFilterChange }: AdminFiltersProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [filters, setFilters] = useState<FilterValues>({
    projectId: '',
    professionalId: '',
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

        if (projectsRes.data) setProjects(projectsRes.data);
        if (professionalsRes.data) setProfessionals(professionalsRes.data);
      } catch (err) {
        console.error('Erro ao carregar filtros:', err);
      }
    };

    fetchData();
  }, []);

  const handleFilterChange = (field: keyof FilterValues, value: string) => {
    const newFilters = { ...filters, [field]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      projectId: '',
      professionalId: '',
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
            onChange={(e) => handleFilterChange('projectId', e.target.value)}
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
            onChange={(e) => handleFilterChange('professionalId', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
          >
            <option value="">Todos os profissionais</option>
            {professionals.map((prof) => (
              <option key={prof.id} value={prof.id}>
                {prof.full_name}
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
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
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
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
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
