import { useState, useEffect, useCallback } from 'react';

/**
 * Debounce hook for search inputs — prevents request per keystroke.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debounced;
}

interface UsePaginationOptions {
  initialPage?: number;
  pageSize?: number;
}

/**
 * Pagination hook — manages page state and resets page when filters change.
 */
export function usePagination({ initialPage = 1, pageSize = 20 }: UsePaginationOptions = {}) {
  const [page, setPage] = useState(initialPage);
  const [size] = useState(pageSize);

  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  const nextPage = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  const prevPage = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);

  return { page, pageSize: size, setPage, resetPage, nextPage, prevPage };
}
