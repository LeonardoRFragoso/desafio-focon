import type { TimeEntryWithRelations } from '@/types/database';

/**
 * Format currency for display
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/**
 * Format date for display
 */
function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('pt-BR');
}

/**
 * Format duration in hours and minutes
 */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Escape CSV cell to prevent formula injection
 * Prepend single quote to cells starting with =, +, -, or @
 */
export function escapeCSVCell(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@')) {
    return `'${value}`;
  }
  return value;
}

/**
 * Export time entries to CSV format
 */
export function exportToCSV(entries: TimeEntryWithRelations[], filename = 'apontamentos.csv'): void {
  const headers = [
    'Profissional',
    'Projeto',
    'Data',
    'Duração',
    'Descrição',
    'Custo-hora',
    'Custo Total',
    'Status',
  ];

  const rows = entries.map((entry) => [
    entry.professional?.full_name || 'Desconhecido',
    entry.project?.name || 'Desconhecido',
    formatDate(entry.entry_date),
    formatDuration(entry.duration_minutes),
    entry.description,
    formatCurrency(entry.applied_hourly_rate),
    formatCurrency((entry.duration_minutes / 60) * entry.applied_hourly_rate),
    entry.approval_status,
  ]);

  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const cellStr = String(cell);
          // Prevent formula injection
          const safeCell = escapeCSVCell(cellStr);
          // Escape quotes and wrap in quotes if contains comma
          const escaped = safeCell.replace(/"/g, '""');
          return escaped.includes(',') ? `"${escaped}"` : escaped;
        })
        .join(',')
    ),
  ].join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadFile(blob, filename);
}

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHTML(text: string | undefined): string {
  if (!text) return '';
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Export time entries to HTML table (for printing/PDF)
 */
export function exportToHTML(
  entries: TimeEntryWithRelations[],
  title = 'Relatório de Apontamentos'
): string {
  const tableRows = entries
    .map(
      (entry) => `
    <tr>
      <td>${escapeHTML(entry.professional?.full_name || 'Desconhecido')}</td>
      <td>${escapeHTML(entry.project?.name || 'Desconhecido')}</td>
      <td>${formatDate(entry.entry_date)}</td>
      <td>${formatDuration(entry.duration_minutes)}</td>
      <td>${escapeHTML(entry.description)}</td>
      <td>${formatCurrency(entry.applied_hourly_rate)}</td>
      <td>${formatCurrency((entry.duration_minutes / 60) * entry.applied_hourly_rate)}</td>
      <td>${escapeHTML(entry.approval_status)}</td>
    </tr>
  `
    )
    .join('');

  const escapedTitle = escapeHTML(title);
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapedTitle}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          margin: 20px;
          color: #333;
        }
        h1 {
          color: #1e293b;
          border-bottom: 3px solid #0d9488;
          padding-bottom: 10px;
        }
        .metadata {
          margin: 20px 0;
          font-size: 14px;
          color: #666;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th {
          background-color: #f1f5f9;
          border: 1px solid #cbd5e1;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: #1e293b;
        }
        td {
          border: 1px solid #cbd5e1;
          padding: 10px 12px;
        }
        tr:nth-child(even) {
          background-color: #f8fafc;
        }
        @media print {
          body {
            margin: 0;
          }
          table {
            page-break-inside: avoid;
          }
        }
      </style>
    </head>
    <body>
      <h1>${escapedTitle}</h1>
      <div class="metadata">
        <p>Gerado em: ${escapeHTML(new Date().toLocaleString('pt-BR'))}</p>
        <p>Total de registros: ${entries.length}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Profissional</th>
            <th>Projeto</th>
            <th>Data</th>
            <th>Duração</th>
            <th>Descrição</th>
            <th>Custo-hora</th>
            <th>Custo Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </body>
    </html>
  `;

  return html;
}

/**
 * Export to PDF by opening print dialog with HTML
 */
export function exportToPDF(
  entries: TimeEntryWithRelations[],
  title = 'Relatório de Apontamentos'
): void {
  const html = exportToHTML(entries, title);
  const printWindow = window.open('', '', 'width=800,height=600');

  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();

    // Wait for content to load before printing
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}

/**
 * Download file helper
 */
function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate financial summary export
 */
export function exportFinancialSummary(
  data: {
    revenue: number;
    laborCost: number;
    tax: number;
    indirectCost: number;
    result: number;
    margin: number;
  },
  filename = 'resumo-financeiro.csv'
): void {
  const csv = `Métrica,Valor
Receita,${data.revenue}
Custo de Mão de Obra,${data.laborCost}
Imposto,${data.tax}
Custo Indireto,${data.indirectCost}
Resultado,${data.result}
Margem (%),${data.margin.toFixed(2)}`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadFile(blob, filename);
}

/**
 * Export personal time entries to CSV (includes rejection reason).
 * Used by professionals to export their own entries.
 */
export function exportPersonalEntriesCSV(
  entries: TimeEntryWithRelations[],
  professionalName: string,
  filename?: string
): void {
  const headers = [
    'Data',
    'Projeto',
    'Duração',
    'Descrição',
    'Valor/Hora',
    'Custo Total',
    'Status',
    'Motivo Rejeição',
    'Rejeitado em',
  ];

  const statusLabels: Record<string, string> = {
    pending: 'Pendente',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
  };

  const rows = entries.map((entry) => [
    formatDate(entry.entry_date),
    entry.project?.name || 'Desconhecido',
    formatDuration(entry.duration_minutes),
    entry.description,
    formatCurrency(entry.applied_hourly_rate),
    formatCurrency((entry.duration_minutes / 60) * entry.applied_hourly_rate),
    statusLabels[entry.approval_status] || entry.approval_status,
    entry.rejection_reason || '',
    entry.rejected_at ? new Date(entry.rejected_at).toLocaleString('pt-BR') : '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const cellStr = String(cell);
          const safeCell = escapeCSVCell(cellStr);
          const escaped = safeCell.replace(/"/g, '""');
          return escaped.includes(',') ? `"${escaped}"` : escaped;
        })
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const fname = filename || `meus-apontamentos-${professionalName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadFile(blob, fname);
}

/**
 * Export personal time entries to PDF (printable HTML).
 * Includes filters info, rejection reasons, and totals.
 * Does NOT include financial data the professional doesn't have access to.
 */
export function exportPersonalEntriesPDF(
  entries: TimeEntryWithRelations[],
  professionalName: string,
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    project?: string;
    status?: string;
  }
): void {
  const statusLabels: Record<string, string> = {
    pending: 'Pendente',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
  };

  const totalMinutes = entries.reduce((s, e) => s + e.duration_minutes, 0);
  const approvedMinutes = entries
    .filter((e) => e.approval_status === 'approved')
    .reduce((s, e) => s + e.duration_minutes, 0);

  const filtersText: string[] = [];
  if (filters?.dateFrom) filtersText.push(`De: ${formatDate(filters.dateFrom)}`);
  if (filters?.dateTo) filtersText.push(`Até: ${formatDate(filters.dateTo)}`);
  if (filters?.project) filtersText.push(`Projeto: ${escapeHTML(filters.project)}`);
  if (filters?.status) filtersText.push(`Status: ${escapeHTML(statusLabels[filters.status] || filters.status)}`);

  const tableRows = entries
    .map((entry) => {
      const rejectionCell =
        entry.approval_status === 'rejected' && entry.rejection_reason
          ? `<td class="rejection">${escapeHTML(entry.rejection_reason)}</td>`
          : '<td class="rejection">—</td>';
      return `
    <tr>
      <td>${escapeHTML(entry.project?.name || 'Desconhecido')}</td>
      <td>${formatDate(entry.entry_date)}</td>
      <td>${formatDuration(entry.duration_minutes)}</td>
      <td>${escapeHTML(entry.description)}</td>
      <td><span class="status status-${entry.approval_status}">${statusLabels[entry.approval_status] || entry.approval_status}</span></td>
      ${rejectionCell}
    </tr>
  `;
    })
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meus Apontamentos — ${escapeHTML(professionalName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      margin: 30px;
      color: #1e293b;
    }
    .header {
      border-bottom: 3px solid #0d9488;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .header h1 { color: #0d9488; font-size: 24px; }
    .header .subtitle { color: #64748b; font-size: 14px; margin-top: 5px; }
    .metadata {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      margin: 15px 0;
      font-size: 13px;
      color: #475569;
    }
    .metadata div { background: #f1f5f9; padding: 6px 12px; border-radius: 4px; }
    .filters { margin: 15px 0; font-size: 13px; color: #475569; }
    .filters span { display: inline-block; margin-right: 15px; background: #f0fdfa; padding: 4px 10px; border-radius: 4px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
      font-size: 13px;
    }
    th {
      background-color: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 10px;
      text-align: left;
      font-weight: 600;
      color: #1e293b;
    }
    td {
      border: 1px solid #cbd5e1;
      padding: 8px 10px;
      vertical-align: top;
    }
    tr:nth-child(even) { background-color: #f8fafc; }
    .status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .status-approved { background: #dcfce7; color: #166534; }
    .status-pending { background: #fef9c3; color: #854d0e; }
    .status-rejected { background: #fee2e2; color: #991b1b; }
    .rejection { color: #991b1b; font-size: 12px; }
    .totals {
      margin-top: 20px;
      padding: 15px;
      background: #f0fdfa;
      border-radius: 8px;
      display: flex;
      gap: 30px;
      flex-wrap: wrap;
    }
    .totals div { font-size: 14px; }
    .totals strong { color: #0d9488; font-size: 18px; }
    .footer {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      font-size: 11px;
      color: #94a3b8;
      text-align: center;
    }
    @media print {
      body { margin: 15px; }
      table { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>FoconFlow</h1>
    <p class="subtitle">Relatório de Apontamentos Pessoais</p>
  </div>
  <div class="metadata">
    <div><strong>Profissional:</strong> ${escapeHTML(professionalName)}</div>
    <div><strong>Gerado em:</strong> ${escapeHTML(new Date().toLocaleString('pt-BR'))}</div>
    <div><strong>Total de registros:</strong> ${entries.length}</div>
  </div>
  ${filtersText.length > 0 ? `<div class="filters"><strong>Filtros:</strong> ${filtersText.map((f) => `<span>${f}</span>`).join('')}</div>` : ''}
  <table>
    <thead>
      <tr>
        <th>Projeto</th>
        <th>Data</th>
        <th>Duração</th>
        <th>Descrição</th>
        <th>Status</th>
        <th>Motivo Rejeição</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
  <div class="totals">
    <div>Total registrado: <strong>${formatDuration(totalMinutes)}</strong></div>
    <div>Total aprovado: <strong>${formatDuration(approvedMinutes)}</strong></div>
  </div>
  <div class="footer">
    FoconFlow — Fócon Engenharia · Documento gerado eletronicamente
  </div>
</body>
</html>
  `;

  const printWindow = window.open('', '', 'width=900,height=700');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  }
}
