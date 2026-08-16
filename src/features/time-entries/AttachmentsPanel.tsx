import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { mapDatabaseError } from '@/lib/errors';
import type { TimeEntryAttachment } from '@/types/database';
import {
  ATTACHMENT_BUCKET,
  ATTACHMENT_MAX_SIZE,
  ATTACHMENT_ALLOWED_LABEL,
  validateAttachmentFile,
  uploadTimeEntryAttachment,
  formatFileSize,
} from '@/features/time-entries/attachments';

interface AttachmentsPanelProps {
  entryId: string;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AttachmentsPanel({ entryId }: AttachmentsPanelProps) {
  const { user } = useAuthContext();
  const [attachments, setAttachments] = useState<TimeEntryAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('time_entry_attachments')
        .select(
          'id, time_entry_id, uploaded_by, file_name, file_size, content_type, storage_path, created_at, uploaded_by_profile:profiles!time_entry_attachments_uploaded_by_fkey(full_name)'
        )
        .eq('time_entry_id', entryId)
        .order('created_at', { ascending: false });
      if (err) throw err;
      setAttachments((data as TimeEntryAttachment[]) || []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar anexos');
    } finally {
      setLoading(false);
    }
  }, [entryId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAttachments();
  }, [fetchAttachments]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadError(null);

    const validation = validateAttachmentFile(file);
    if (validation) {
      setUploadError(validation.reason);
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const result = await uploadTimeEntryAttachment(entryId, user.id, file);
      if (!result.success) {
        setUploadError(result.error ?? 'Erro ao enviar arquivo');
      } else {
        await fetchAttachments();
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (attachment: TimeEntryAttachment) => {
    try {
      const { data, error: err } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(attachment.storage_path, 60); // 60 seconds
      if (err) throw err;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao gerar link de download');
    }
  };

  const handleDelete = async (attachment: TimeEntryAttachment) => {
    try {
      // Delete from storage first
      const { error: storageErr } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .remove([attachment.storage_path]);
      if (storageErr) throw storageErr;

      // Delete metadata
      const { error: metaErr } = await supabase
        .from('time_entry_attachments')
        .delete()
        .eq('id', attachment.id);
      if (metaErr) throw metaErr;

      await fetchAttachments();
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao excluir anexo');
    }
  };

  return (
    <div className="space-y-4">
      <h4 className="font-semibold text-app-primary">Anexos</h4>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
          <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}

      {uploadError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
          <p className="text-sm text-red-800 dark:text-red-400">{uploadError}</p>
        </div>
      )}

      {/* Upload button */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
          id="attachment-upload"
        />
        <label
          htmlFor="attachment-upload"
          className="inline-block px-4 py-2 border border-app-strong text-app-secondary rounded-lg text-sm font-medium transition hover:bg-hover-surface cursor-pointer disabled:opacity-50"
        >
          {uploading ? 'Enviando...' : 'Adicionar Anexo'}
        </label>
        <p className="text-xs text-app-muted mt-1">
          Máx. {formatFileSize(ATTACHMENT_MAX_SIZE)}. Permitidos: {ATTACHMENT_ALLOWED_LABEL}.
        </p>
      </div>

      {/* Attachments list */}
      {loading ? (
        <div className="flex justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-focon-600"></div>
        </div>
      ) : attachments.length === 0 ? (
        <div className="text-center py-6 text-sm text-app-muted">
          Nenhum anexo. Adicione um arquivo acima.
        </div>
      ) : (
        <ul className="space-y-2">
          {attachments.map((att) => {
            const isOwn = att.uploaded_by === user?.id;
            return (
              <li
                key={att.id}
                className="flex items-center justify-between gap-3 rounded-lg p-3 bg-surface-secondary border border-app-primary"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-focon-100 dark:bg-focon-900/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-focon-600 dark:text-focon-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-app-primary truncate">{att.file_name}</p>
                    <p className="text-xs text-app-muted">
                      {formatFileSize(att.file_size)} · {att.content_type} · {formatDate(att.created_at)}
                    </p>
                    <p className="text-xs text-app-muted">
                      por {att.uploaded_by_profile?.full_name || 'Usuário'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleDownload(att)}
                    className="p-2 rounded-lg text-app-secondary hover:bg-hover-surface transition"
                    aria-label="Baixar"
                    title="Baixar"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                  {isOwn && (
                    <button
                      onClick={() => handleDelete(att)}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                      aria-label="Excluir"
                      title="Excluir"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
