/**
 * Utility functions for error handling and mapping
 */

/**
 * Get a user-friendly error message from any error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Erro desconhecido';
}

/**
 * Map database errors to user-friendly messages
 */
export function mapDatabaseError(error: Error | null): string {
  if (!error) return '';

  const message = error.message.toLowerCase();

  // Hourly rate errors
  if (message.includes('hourly_rate') || message.includes('custo-hora')) {
    return 'Não foi possível registrar o apontamento porque não existe um custo-hora configurado para este profissional na data informada. Entre em contato com o administrador.';
  }

  // Constraint errors
  if (message.includes('constraint') || message.includes('violates')) {
    return 'Os dados fornecidos violam uma restrição do sistema. Verifique os valores e tente novamente.';
  }

  // Permission errors
  if (message.includes('permission') || message.includes('denied')) {
    return 'Você não tem permissão para realizar esta ação.';
  }

  // Network errors
  if (message.includes('network') || message.includes('connection')) {
    return 'Erro de conexão. Verifique sua internet e tente novamente.';
  }

  // Default: return original message
  return error.message;
}

/**
 * Log error to console in development
 */
export function logError(error: unknown, context?: string): void {
  // Only log in development environment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof window !== 'undefined' && (window as any).__DEV__) {
    console.error(
      `[Error${context ? ` - ${context}` : ''}]`,
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Type guard for Error objects
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Safely extract error message with fallback
 */
export function safeGetErrorMessage(error: unknown, fallback = 'Erro desconhecido'): string {
  try {
    return getErrorMessage(error) || fallback;
  } catch {
    return fallback;
  }
}
