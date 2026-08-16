import { supabase } from '@/lib/supabase/client';

/** Private Supabase storage bucket for time entry attachments. */
export const ATTACHMENT_BUCKET = 'time-entry-attachments';
/** Maximum upload size: 10 MB. */
export const ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024;
/** Allowed MIME types for uploads. */
export const ATTACHMENT_ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/msword',
  'application/zip',
];

export interface AttachmentValidationError {
  reason: string;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Human-readable list of allowed types for UI hints. */
export const ATTACHMENT_ALLOWED_LABEL =
  'PDF, imagens, texto, Office, ZIP';

/**
 * Validate a file before upload. Returns null when valid, or an error reason.
 * Shared by the create-flow selector and the existing AttachmentsPanel.
 */
export function validateAttachmentFile(file: File): AttachmentValidationError | null {
  if (file.size > ATTACHMENT_MAX_SIZE) {
    return { reason: `Arquivo muito grande. Máximo: ${formatFileSize(ATTACHMENT_MAX_SIZE)}.` };
  }
  if (!ATTACHMENT_ALLOWED_TYPES.includes(file.type)) {
    return {
      reason: `Tipo de arquivo não permitido: ${file.type || 'desconhecido'}. Permitidos: ${ATTACHMENT_ALLOWED_LABEL}.`,
    };
  }
  return null;
}

export interface UploadAttachmentResult {
  success: boolean;
  error?: string;
}

/**
 * Upload a single file to the private time-entry-attachments bucket and insert
 * its metadata row. Shared by the edit/view panel and the create flow.
 *
 * Security: bucket stays private; signed URLs are used for downloads; RLS
 * controls who can read/insert/delete. The storage path is scoped to
 * userId/entryId so users cannot access other users' files.
 */
export async function uploadTimeEntryAttachment(
  entryId: string,
  userId: string,
  file: File
): Promise<UploadAttachmentResult> {
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${userId}/${entryId}/${Date.now()}-${safeName}`;

    // Step 1: Upload to Storage
    const { error: uploadErr } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadErr) throw uploadErr;

    // Step 2: Insert metadata row
    const { error: metaErr } = await supabase.from('time_entry_attachments').insert([
      {
        time_entry_id: entryId,
        uploaded_by: userId,
        file_name: file.name,
        file_size: file.size,
        content_type: file.type,
        storage_path: storagePath,
      },
    ]);

    if (metaErr) {
      // Compensation: the file was uploaded to Storage but the metadata
      // insert failed. The file is now an orphan in the bucket. Attempt
      // to remove it so we don't leave untracked objects.
      const { error: cleanupErr } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .remove([storagePath]);

      if (cleanupErr) {
        // Cleanup also failed — the orphan remains. Return an explicit
        // error that mentions both failures so the caller can log/alert.
        // Do NOT include sensitive paths or tokens in the message.
        return {
          success: false,
          error: `Falha ao registrar metadados do anexo e também ao limpar o arquivo órfão do storage. Erro de metadados: ${metaErr.message}. Erro de limpeza: ${cleanupErr.message}.`,
        };
      }

      // Cleanup succeeded — no orphan, but the upload itself failed.
      throw metaErr;
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Erro ao enviar arquivo';
    return { success: false, error: message };
  }
}

/**
 * Upload multiple files for a freshly created time entry.
 * Returns the per-file results so the caller can surface partial failures
 * explicitly (never silently).
 */
export async function uploadTimeEntryAttachments(
  entryId: string,
  userId: string,
  files: File[]
): Promise<{ results: UploadAttachmentResult[]; succeeded: number; failed: number }> {
  const results = await Promise.all(
    files.map((file) => uploadTimeEntryAttachment(entryId, userId, file))
  );
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;
  return { results, succeeded, failed };
}
