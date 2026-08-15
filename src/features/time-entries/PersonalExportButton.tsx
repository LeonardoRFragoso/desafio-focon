import { useState, useCallback, useEffect } from 'react';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { timeEntriesAPI, projectsAPI } from '@/lib/supabase/api';
import { exportPersonalEntriesCSV, exportPersonalEntriesPDF } from '@/lib/export';
import type { TimeEntryWithRelations, Project } from '@/types/database';
import { Modal } from '@/components/Modal';

/**
 * Button that exports the current user's time entries to CSV or PDF.
 * PDF export includes filters (period, project, status).
 */
export function PersonalExportButton() {
  const { user, profile } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  const handleCSVExport = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await timeEntriesAPI.getByUser(user.id);
      if (err) throw err;
      const entries = (data as TimeEntryWithRelations[]) || [];
      if (entries.length === 0) {
        setError('Nenhum apontamento para exportar.');
        return;
      }
      exportPersonalEntriesCSV(entries, profile?.full_name || 'profissional');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao exportar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          onClick={handleCSVExport}
          disabled={loading}
          className="px-3 py-2 bg-surface-elevated border border-app-strong text-app-secondary hover:bg-hover-surface rounded-lg font-medium transition text-sm disabled:opacity-50"
        >
          {loading ? 'Exportando...' : 'CSV'}
        </button>
        <button
          onClick={() => setPdfModalOpen(true)}
          disabled={loading}
          className="px-3 py-2 bg-surface-elevated border border-app-strong text-app-secondary hover:bg-hover-surface rounded-lg font-medium transition text-sm disabled:opacity-50"
        >
          PDF
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {pdfModalOpen && user && (
        <PDFExportModal
          userId={user.id}
          professionalName={profile?.full_name || 'Profissional'}
          onClose={() => setPdfModalOpen(false)}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}

interface PDFExportModalProps {
  userId: string;
  professionalName: string;
  onClose: () => void;
  onError: (msg: string) => void;
}

function PDFExportModal({ userId, professionalName, onClose, onError }: PDFExportModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
     
    projectsAPI.listActive().then(({ data }) => {
      setProjects((data as Project[]) || []);
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const { data, error: err } = await timeEntriesAPI.getByUser(userId);
      if (err) throw err;
      let entries = (data as TimeEntryWithRelations[]) || [];

      // Apply filters
      if (dateFrom) entries = entries.filter((e) => e.entry_date >= dateFrom);
      if (dateTo) entries = entries.filter((e) => e.entry_date <= dateTo);
      if (projectFilter) entries = entries.filter((e) => e.project_id === projectFilter);
      if (statusFilter) entries = entries.filter((e) => e.approval_status === statusFilter);

      if (entries.length === 0) {
        onError('Nenhum apontamento encontrado com os filtros selecionados.');
        return;
      }

      const projectName = projects.find((p) => p.id === projectFilter)?.name;
      const statusLabel =
        statusFilter === 'approved' ? 'Aprovado' : statusFilter === 'pending' ? 'Pendente' : statusFilter === 'rejected' ? 'Rejeitado' : undefined;

      const pdfFilters: { dateFrom?: string; dateTo?: string; project?: string; status?: string } = {};
      if (dateFrom) pdfFilters.dateFrom = dateFrom;
      if (dateTo) pdfFilters.dateTo = dateTo;
      if (projectName) pdfFilters.project = projectName;
      if (statusLabel) pdfFilters.status = statusLabel;

      exportPersonalEntriesPDF(entries, professionalName, pdfFilters);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao gerar PDF');
    } finally {
      setGenerating(false);
    }
  }, [userId, dateFrom, dateTo, projectFilter, statusFilter, projects, professionalName, onClose, onError]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Exportar PDF"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={generating} className="px-4 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={handleGenerate} disabled={generating} className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50">
            {generating ? 'Gerando...' : 'Gerar PDF'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">De</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
          </div>
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Até</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Projeto</label>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="w-full px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
            <option value="">Todos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
            <option value="">Todos</option>
            <option value="pending">Pendente</option>
            <option value="approved">Aprovado</option>
            <option value="rejected">Rejeitado</option>
          </select>
        </div>
        <p className="text-xs text-app-muted">
          O PDF será aberto na janela de impressão do navegador. Use "Salvar como PDF" para salvar o arquivo.
        </p>
      </div>
    </Modal>
  );
}
