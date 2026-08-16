import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Supabase client before importing the module under test.
const mockStorageUpload = vi.fn();
const mockStorageRemove = vi.fn();
const mockInsert = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: mockStorageUpload,
        remove: mockStorageRemove,
      })),
    },
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
  },
}));

import { uploadTimeEntryAttachment, ATTACHMENT_BUCKET } from '@/features/time-entries/attachments';

describe('uploadTimeEntryAttachment — compensation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('succeeds when both storage upload and metadata insert succeed', async () => {
    mockStorageUpload.mockResolvedValue({ error: null });
    mockInsert.mockResolvedValue({ error: null });

    const result = await uploadTimeEntryAttachment('entry-1', 'user-1', new File(['content'], 'test.pdf', { type: 'application/pdf' }));

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockStorageUpload).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it('fails when storage upload fails — no metadata insert attempted', async () => {
    mockStorageUpload.mockResolvedValue({ error: { message: 'Storage error' } });
    mockInsert.mockResolvedValue({ error: null });

    const result = await uploadTimeEntryAttachment('entry-1', 'user-1', new File(['content'], 'test.pdf', { type: 'application/pdf' }));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Storage error');
    expect(mockStorageUpload).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it('compensates: removes orphaned storage object when metadata insert fails', async () => {
    mockStorageUpload.mockResolvedValue({ error: null });
    mockInsert.mockResolvedValue({ error: { message: 'Metadata insert failed' } });
    mockStorageRemove.mockResolvedValue({ error: null });

    const result = await uploadTimeEntryAttachment('entry-1', 'user-1', new File(['content'], 'test.pdf', { type: 'application/pdf' }));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Metadata insert failed');
    expect(mockStorageUpload).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    // Cleanup was attempted
    expect(mockStorageRemove).toHaveBeenCalledTimes(1);
  });

  it('returns explicit error when both metadata insert AND cleanup fail', async () => {
    mockStorageUpload.mockResolvedValue({ error: null });
    mockInsert.mockResolvedValue({ error: { message: 'Metadata insert failed' } });
    mockStorageRemove.mockResolvedValue({ error: { message: 'Cleanup also failed' } });

    const result = await uploadTimeEntryAttachment('entry-1', 'user-1', new File(['content'], 'test.pdf', { type: 'application/pdf' }));

    expect(result.success).toBe(false);
    // The error must mention both failures
    expect(result.error).toContain('metadados');
    expect(result.error).toContain('limpeza');
    expect(result.error).toContain('Metadata insert failed');
    expect(result.error).toContain('Cleanup also failed');
    expect(mockStorageUpload).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockStorageRemove).toHaveBeenCalledTimes(1);
  });

  it('uses the correct bucket name', () => {
    expect(ATTACHMENT_BUCKET).toBe('time-entry-attachments');
  });
});
