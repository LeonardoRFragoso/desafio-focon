import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ExcelJS Workbook
const mockWorksheet = {
  columns: [] as unknown[],
  addRows: vi.fn(),
  getCell: vi.fn(() => ({ numFmt: '', value: '' })),
  getRow: vi.fn(() => ({ font: {}, fill: {} })),
};
const mockWorkbook = {
  creator: '',
  created: new Date(),
  addWorksheet: vi.fn(() => mockWorksheet),
  xlsx: {
    writeBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  },
};

vi.mock('exceljs', () => ({
  default: {
    Workbook: vi.fn(function () {
      return mockWorkbook;
    }),
  },
}));

// Mock URL.createObjectURL and DOM
beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as unknown as { URL: { createObjectURL: typeof URL.createObjectURL; revokeObjectURL: typeof URL.revokeObjectURL } }).URL.createObjectURL = vi.fn(() => 'blob:fake-url');
  (globalThis as unknown as { URL: { createObjectURL: typeof URL.createObjectURL; revokeObjectURL: typeof URL.revokeObjectURL } }).URL.revokeObjectURL = vi.fn();
  // Mock document.createElement and body.appendChild for download
  const mockLink = {
    href: '',
    download: '',
    click: vi.fn(),
  };
  vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLAnchorElement);
  vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as Node);
  vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown as Node);
});

describe('Excel export — formula injection protection', () => {
  it('escapes cells starting with =', async () => {
    const { exportAdminExcel } = await import('./excel-export');
    await exportAdminExcel({
      entries: [],
      projects: [{ id: 'p1', name: '=1+1', status: 'active', created_at: '2024-01-01' }] as never,
      professionals: [],
      budgets: [],
      financial: { revenue: 0, laborCost: 0, tax: 0, indirectCost: 0, result: 0, margin: 0 },
    });
    // Verify addRows was called with escaped value
    const projectsCall = mockWorksheet.addRows.mock.calls.find(
      (call) => Array.isArray(call[0]) && call[0].some((r: { name?: string }) => r.name?.startsWith("'="))
    );
    expect(projectsCall).toBeDefined();
  });

  it('escapes cells starting with +', async () => {
    const { exportAdminExcel } = await import('./excel-export');
    await exportAdminExcel({
      entries: [],
      projects: [{ id: 'p1', name: '+cmd|/c calc!A0', status: 'active', created_at: '2024-01-01' }] as never,
      professionals: [],
      budgets: [],
      financial: { revenue: 0, laborCost: 0, tax: 0, indirectCost: 0, result: 0, margin: 0 },
    });
    const projectsCall = mockWorksheet.addRows.mock.calls.find(
      (call) => Array.isArray(call[0]) && call[0].some((r: { name?: string }) => r.name?.startsWith("'+"))
    );
    expect(projectsCall).toBeDefined();
  });

  it('escapes cells starting with -', async () => {
    const { exportAdminExcel } = await import('./excel-export');
    await exportAdminExcel({
      entries: [],
      projects: [{ id: 'p1', name: '-1+1', status: 'active', created_at: '2024-01-01' }] as never,
      professionals: [],
      budgets: [],
      financial: { revenue: 0, laborCost: 0, tax: 0, indirectCost: 0, result: 0, margin: 0 },
    });
    const projectsCall = mockWorksheet.addRows.mock.calls.find(
      (call) => Array.isArray(call[0]) && call[0].some((r: { name?: string }) => r.name?.startsWith("'-"))
    );
    expect(projectsCall).toBeDefined();
  });

  it('escapes cells starting with @', async () => {
    const { exportAdminExcel } = await import('./excel-export');
    await exportAdminExcel({
      entries: [],
      projects: [{ id: 'p1', name: '@SUM(A1:A10)', status: 'active', created_at: '2024-01-01' }] as never,
      professionals: [],
      budgets: [],
      financial: { revenue: 0, laborCost: 0, tax: 0, indirectCost: 0, result: 0, margin: 0 },
    });
    const projectsCall = mockWorksheet.addRows.mock.calls.find(
      (call) => Array.isArray(call[0]) && call[0].some((r: { name?: string }) => r.name?.startsWith("'@"))
    );
    expect(projectsCall).toBeDefined();
  });

  it('does not escape normal text', async () => {
    const { exportAdminExcel } = await import('./excel-export');
    await exportAdminExcel({
      entries: [],
      projects: [{ id: 'p1', name: 'Normal Project', status: 'active', created_at: '2024-01-01' }] as never,
      professionals: [],
      budgets: [],
      financial: { revenue: 0, laborCost: 0, tax: 0, indirectCost: 0, result: 0, margin: 0 },
    });
    const projectsCall = mockWorksheet.addRows.mock.calls.find(
      (call) => Array.isArray(call[0]) && call[0].some((r: { name?: string }) => r.name === 'Normal Project')
    );
    expect(projectsCall).toBeDefined();
  });

  it('generates and downloads the file', async () => {
    const { exportAdminExcel } = await import('./excel-export');
    await exportAdminExcel({
      entries: [],
      projects: [],
      professionals: [],
      budgets: [],
      financial: { revenue: 1000, laborCost: 500, tax: 100, indirectCost: 50, result: 350, margin: 35 },
    });
    expect(mockWorkbook.xlsx.writeBuffer).toHaveBeenCalled();
    expect((globalThis as unknown as { URL: { createObjectURL: ReturnType<typeof vi.fn>; revokeObjectURL: ReturnType<typeof vi.fn> } }).URL.createObjectURL).toHaveBeenCalled();
    expect((globalThis as unknown as { URL: { createObjectURL: ReturnType<typeof vi.fn>; revokeObjectURL: ReturnType<typeof vi.fn> } }).URL.revokeObjectURL).toHaveBeenCalled();
  });
});
