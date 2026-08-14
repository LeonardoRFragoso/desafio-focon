import ExcelJS from 'exceljs';
import type { TimeEntryWithRelations, Project, ProjectBudget } from '@/types/database';

/**
 * Escape cell value to prevent Excel formula injection.
 * Prepend single quote to cells starting with =, +, -, or @
 */
function escapeCell(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@')) {
    return `'${value}`;
  }
  return value;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

interface ExcelExportData {
  entries: TimeEntryWithRelations[];
  projects: Project[];
  professionals: { id: string; full_name: string; role: string }[];
  budgets: (ProjectBudget & { project?: { name: string } | null })[];
  financial: {
    revenue: number;
    laborCost: number;
    tax: number;
    indirectCost: number;
    result: number;
    margin: number;
  };
}

/**
 * Export comprehensive admin data to a multi-sheet Excel workbook.
 * Protects against formula injection on all text cells.
 */
export async function exportAdminExcel(data: ExcelExportData, filename = 'foconflow-admin.xlsx'): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FoconFlow';
  wb.created = new Date();

  // Sheet 1: Resumo
  const summary = wb.addWorksheet('Resumo');
  summary.columns = [
    { header: 'Métrica', key: 'metric', width: 30 },
    { header: 'Valor', key: 'value', width: 20 },
  ];
  const f = data.financial;
  summary.addRows([
    { metric: 'Receita', value: f.revenue },
    { metric: 'Custo de Mão de Obra', value: f.laborCost },
    { metric: 'Imposto', value: f.tax },
    { metric: 'Custo Indireto', value: f.indirectCost },
    { metric: 'Resultado', value: f.result },
    { metric: 'Margem (%)', value: f.margin.toFixed(2) },
    { metric: 'Total de Apontamentos', value: data.entries.length },
    { metric: 'Total de Projetos', value: data.projects.length },
    { metric: 'Total de Profissionais', value: data.professionals.length },
  ]);
  // Format currency cells
  summary.getCell('B1').numFmt = '#,##0.00';
  summary.getCell('B2').numFmt = '#,##0.00';
  summary.getCell('B3').numFmt = '#,##0.00';
  summary.getCell('B4').numFmt = '#,##0.00';
  summary.getCell('B5').numFmt = '#,##0.00';
  // Header styling
  summary.getRow(1).font = { bold: true };
  summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
  summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  // Sheet 2: Projetos
  const projectsSheet = wb.addWorksheet('Projetos');
  projectsSheet.columns = [
    { header: 'Nome', key: 'name', width: 30 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Criado em', key: 'created_at', width: 20 },
  ];
  projectsSheet.addRows(
    data.projects.map((p) => ({
      name: escapeCell(p.name),
      status: p.status,
      created_at: new Date(p.created_at).toLocaleDateString('pt-BR'),
    }))
  );
  projectsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  projectsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };

  // Sheet 3: Profissionais
  const profSheet = wb.addWorksheet('Profissionais');
  profSheet.columns = [
    { header: 'Nome', key: 'name', width: 30 },
    { header: 'Role', key: 'role', width: 15 },
  ];
  profSheet.addRows(
    data.professionals.map((p) => ({
      name: escapeCell(p.full_name),
      role: p.role,
    }))
  );
  profSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  profSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };

  // Sheet 4: Apontamentos
  const entriesSheet = wb.addWorksheet('Apontamentos');
  entriesSheet.columns = [
    { header: 'Profissional', key: 'professional', width: 25 },
    { header: 'Projeto', key: 'project', width: 25 },
    { header: 'Data', key: 'date', width: 15 },
    { header: 'Duração', key: 'duration', width: 12 },
    { header: 'Descrição', key: 'description', width: 40 },
    { header: 'Custo/Hora', key: 'rate', width: 15 },
    { header: 'Custo Total', key: 'cost', width: 15 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Motivo Rejeição', key: 'rejection', width: 30 },
  ];
  entriesSheet.addRows(
    data.entries.map((e) => ({
      professional: escapeCell(e.professional?.full_name || 'Desconhecido'),
      project: escapeCell(e.project?.name || 'Desconhecido'),
      date: new Date(e.entry_date).toLocaleDateString('pt-BR'),
      duration: formatDuration(e.duration_minutes),
      description: escapeCell(e.description),
      rate: e.applied_hourly_rate,
      cost: (e.duration_minutes / 60) * e.applied_hourly_rate,
      status: e.approval_status,
      rejection: escapeCell(e.rejection_reason || ''),
    }))
  );
  // Format currency columns
  for (let i = 2; i <= data.entries.length + 1; i++) {
    entriesSheet.getCell(`F${i}`).numFmt = '#,##0.00';
    entriesSheet.getCell(`G${i}`).numFmt = '#,##0.00';
  }
  entriesSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  entriesSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };

  // Sheet 5: Financeiro
  const finSheet = wb.addWorksheet('Financeiro');
  finSheet.columns = [
    { header: 'Métrica', key: 'metric', width: 30 },
    { header: 'Valor (R$)', key: 'value', width: 20 },
  ];
  finSheet.addRows([
    { metric: 'Receita', value: f.revenue },
    { metric: 'Custo de Mão de Obra', value: f.laborCost },
    { metric: 'Imposto', value: f.tax },
    { metric: 'Custo Indireto', value: f.indirectCost },
    { metric: 'Resultado', value: f.result },
    { metric: 'Margem (%)', value: f.margin },
  ]);
  for (let i = 2; i <= 6; i++) {
    finSheet.getCell(`B${i}`).numFmt = '#,##0.00';
  }
  finSheet.getCell('B6').numFmt = '0.00';
  finSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  finSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };

  // Sheet 6: Orçamento
  const budgetSheet = wb.addWorksheet('Orçamento');
  budgetSheet.columns = [
    { header: 'Projeto', key: 'project', width: 25 },
    { header: 'Tipo', key: 'type', width: 15 },
    { header: 'Valor', key: 'value', width: 15 },
    { header: 'Ano Fiscal', key: 'year', width: 12 },
  ];
  budgetSheet.addRows(
    data.budgets.map((b) => ({
      project: escapeCell(b.project?.name || 'Desconhecido'),
      type: b.budget_type,
      value: b.budget_value,
      year: b.fiscal_year,
    }))
  );
  budgetSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  budgetSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
