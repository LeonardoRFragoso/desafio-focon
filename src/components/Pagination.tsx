interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/**
 * Reusable pagination control with Previous/Next and page info.
 */
export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  if (total === 0) return null;

  return (
    <div className="flex items-center justify-between gap-4 mt-4">
      <p className="text-sm text-app-muted">
        Página <strong>{page}</strong> de <strong>{totalPages || 1}</strong> · {total} registro{total !== 1 ? 's' : ''}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev}
          className="px-3 py-1.5 border border-app-strong text-app-secondary rounded-lg text-sm font-medium transition hover:bg-hover-surface disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Anterior
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          className="px-3 py-1.5 border border-app-strong text-app-secondary rounded-lg text-sm font-medium transition hover:bg-hover-surface disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
