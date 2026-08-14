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
function escapeCSVCell(value: string): string {
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
function escapeHTML(text: string | undefined): string {
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
