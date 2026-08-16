import { useRef, useState } from 'react';
import {
  validateAttachmentFile,
  formatFileSize,
  ATTACHMENT_ALLOWED_LABEL,
  ATTACHMENT_MAX_SIZE,
} from '@/features/time-entries/attachments';

interface PendingAttachmentsProps {
  /** Current list of pending files (controlled). */
  files: File[];
  /** Replace the entire list. */
  onChange: (files: File[]) => void;
  /** Disable inputs while the parent is submitting. */
  disabled?: boolean;
}

/**
 * File selector for the time entry CREATE flow.
 *
 * Unlike AttachmentsPanel (which operates on an existing entry id), this
 * component only collects File objects in memory. The parent form uploads
 * them after the time entry has been created, treating create + upload as a
 * single operation and surfacing partial failures explicitly.
 */
export function PendingAttachments({ files, onChange, disabled }: PendingAttachmentsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const picked = e.target.files;
    if (!picked || picked.length === 0) return;
    const next: File[] = [];
    for (const file of Array.from(picked)) {
      const validation = validateAttachmentFile(file);
      if (validation) {
        setError(validation.reason);
        continue;
      }
      next.push(file);
    }
    if (next.length > 0) {
      onChange([...files, ...next]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemove = (index: number) => {
    setError(null);
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-medium text-app-secondary">Anexos</h4>
        <p className="text-xs text-app-muted mt-1">
          Máx. {formatFileSize(ATTACHMENT_MAX_SIZE)} por arquivo. Permitidos: {ATTACHMENT_ALLOWED_LABEL}.
          Os arquivos serão enviados após salvar o apontamento.
        </p>
      </div>

      {error && (
        <div
          className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3"
          role="alert"
        >
          <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}

      <div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          disabled={disabled}
          className="hidden"
          id="pending-attachments-upload"
          aria-label="Adicionar anexos"
        />
        <label
          htmlFor="pending-attachments-upload"
          className="inline-block px-4 py-2 border border-app-strong text-app-secondary rounded-lg text-sm font-medium transition hover:bg-hover-surface cursor-pointer disabled:opacity-50"
        >
          Adicionar Anexo
        </label>
      </div>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between gap-3 rounded-lg p-3 bg-surface-secondary border border-app-primary"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-focon-100 dark:bg-focon-900/30 flex items-center justify-center">
                  <svg className="w-5 h-5 text-focon-600 dark:text-focon-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-app-primary truncate">{file.name}</p>
                  <p className="text-xs text-app-muted">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                disabled={disabled}
                className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                aria-label={`Remover ${file.name}`}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
