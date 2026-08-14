import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { mapDatabaseError } from '@/lib/errors';
import type { TimeEntryAttachment } from '@/types/database';

interface AttachmentsPanelProps {
  entryId: string;
}

const BUCKET = 'time-entry-attachments';
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

    // Validate file size
    if (file.size > MAX_SIZE) {
      setUploadError(`Arquivo muito grande. Máximo: ${formatFileSize(MAX_SIZE)}.`);
      e.target.value = '';
      return;
    }

    // Validate MIME type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError(`Tipo de arquivo não permitido: ${file.type || 'desconhecido'}. Permitidos: PDF, imagens, texto, Office, ZIP.`);
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      // Build storage path: userId/entryId/filename-timestamp
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${user.id}/${entryId}/${Date.now()}-${safeName}`;

      // Upload to storage
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });
      if (uploadErr) throw uploadErr;

      // Insert metadata
      const { error: metaErr } = await supabase.from('time_entry_attachments').insert([
        {
          time_entry_id: entryId,
          uploaded_by: user.id,
          file_name: file.name,
          file_size: file.size,
          content_type: file.type,
          storage_path: storagePath,
        },
      ]);
      if (metaErr) throw metaErr;

      await fetchAttachments();
    } catch (err) {
      setUploadError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao enviar arquivo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (attachment: TimeEntryAttachment) => {
    try {
      const { data, error: err } = await supabase.storage
        .from(BUCKET)
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
        .from(BUCKET)
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
      <h4 className="font-semibold text-slate-900 dark:text-slate-100">Anexos</h4>

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
          className="inline-block px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
        >
          {uploading ? 'Enviando...' : 'Adicionar Anexo'}
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Máx. 10 MB. Permitidos: PDF, imagens, texto, Office, ZIP.
        </p>
      </div>

      {/* Attachments list */}
      {loading ? (
        <div className="flex justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-focon-600"></div>
        </div>
      ) : attachments.length === 0 ? (
        <div className="text-center py-6 text-sm text-slate-500 dark:text-slate-400">
          Nenhum anexo. Adicione um arquivo acima.
        </div>
      ) : (
        <ul className="space-y-2">
          {attachments.map((att) => {
            const isOwn = att.uploaded_by === user?.id;
            return (
              <li
                key={att.id}
                className="flex items-center justify-between gap-3 rounded-lg p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-focon-100 dark:bg-focon-900/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-focon-600 dark:text-focon-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{att.file_name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatFileSize(att.file_size)} · {att.content_type} · {formatDate(att.created_at)}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      por {att.uploaded_by_profile?.full_name || 'Usuário'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleDownload(att)}
                    className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
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
