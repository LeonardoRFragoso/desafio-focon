import { useState, useEffect, useCallback, useRef } from 'react';
import { commentsAPI } from '@/lib/supabase/api';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { mapDatabaseError } from '@/lib/errors';
import type { TimeEntryComment } from '@/types/database';

interface CommentsPanelProps {
  entryId: string;
  /** Author role for visual differentiation */
  isAdmin: boolean;
}

function formatDateTime(date: string): string {
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CommentsPanel({ entryId, isAdmin }: CommentsPanelProps) {
  const { user } = useAuthContext();
  const [comments, setComments] = useState<TimeEntryComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);

  const fetchComments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await commentsAPI.list(entryId);
      if (err) throw err;
      setComments((data as TimeEntryComment[]) || []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar comentários');
    } finally {
      setLoading(false);
    }
  }, [entryId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchComments();
  }, [fetchComments]);

  // Realtime subscription for new comments
  useEffect(() => {
    const channel = commentsAPI.subscribe(entryId, () => {
       
      fetchComments();
    });
    channelRef.current = channel;
    return () => {
      channel?.unsubscribe();
    };
  }, [entryId, fetchComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !body.trim()) return;
    if (body.trim().length < 2) {
      setSubmitError('Comentário muito curto (mínimo 2 caracteres).');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { error: err } = await commentsAPI.create(entryId, user.id, body.trim());
      if (err) throw err;
      setBody('');
      await fetchComments();
    } catch (err) {
      setSubmitError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao enviar comentário');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error: err } = await commentsAPI.remove(id);
      if (err) throw err;
      await fetchComments();
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao excluir comentário');
    }
  };

  return (
    <div className="space-y-4">
      <h4 className="font-semibold text-app-primary">Comentários</h4>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
          <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Comments list */}
      {loading ? (
        <div className="flex justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-focon-600"></div>
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-6 text-sm text-app-muted">
          Nenhum comentário ainda. Seja o primeiro a comentar.
        </div>
      ) : (
        <ul className="space-y-3 max-h-[300px] overflow-y-auto">
          {comments.map((comment) => {
            const isOwn = comment.author_id === user?.id;
            const authorName = comment.author?.full_name || 'Usuário';
            return (
              <li
                key={comment.id}
                className={`rounded-lg p-3 ${
                  isOwn
                    ? 'bg-focon-50 dark:bg-focon-900/20 border border-focon-200 dark:border-focon-800'
                    : 'bg-surface-secondary border border-app-primary'
                }`}
              >
                <div className="flex justify-between items-start gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-app-primary">{authorName}</span>
                    {isAdmin && !isOwn && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-surface-elevated text-app-secondary">
                        Admin
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-app-muted flex-shrink-0">
                    {formatDateTime(comment.created_at)}
                  </span>
                </div>
                <p className="text-sm text-app-secondary break-words whitespace-pre-wrap">{comment.body}</p>
                {isOwn && (
                  <button
                    onClick={() => handleDelete(comment.id)}
                    className="text-xs text-slate-400 hover:text-red-600 mt-2"
                  >
                    Excluir
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* New comment form */}
      {submitError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
          <p className="text-sm text-red-800 dark:text-red-400">{submitError}</p>
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escreva um comentário..."
          maxLength={1000}
          disabled={submitting}
          className="flex-1 px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium text-sm transition disabled:opacity-50"
        >
          {submitting ? 'Enviando...' : 'Enviar'}
        </button>
      </form>
    </div>
  );
}
