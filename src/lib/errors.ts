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

  // Domain error: cannot approve future entry
  if (message.includes('foconflow_cannot_approve_future_entry')) {
    return 'Não é possível aprovar este apontamento porque a data informada ainda não ocorreu. Corrija a data ou rejeite o apontamento.';
  }

  // Domain error: future date
  if (message.includes('foconflow_future_date')) {
    return 'Não é possível registrar horas em uma data futura.';
  }

  // Domain error: late justification required
  if (message.includes('foconflow_late_justification')) {
    return 'Este apontamento é retroativo (3+ dias) e exige uma justificativa. Informe o motivo do lançamento retroativo.';
  }

  // Domain error: recurring future
  if (message.includes('foconflow_recurring_future')) {
    return 'Não é possível processar lançamentos recorrentes para datas futuras.';
  }

  // Closed accounting period
  if (message.includes('closed accounting period')) {
    return 'Este apontamento pertence a um período contábil fechado.';
  }

  // Already processed
  if (message.includes('only pending time entries can be approved')) {
    return 'Este apontamento já foi processado e não pode ser aprovado novamente.';
  }
  if (message.includes('only pending time entries can be rejected')) {
    return 'Este apontamento já foi processado e não pode ser rejeitado novamente.';
  }

  // Access denied
  if (message.includes('only administrators can approve') || message.includes('only administrators can reject')) {
    return 'Você não possui permissão para executar esta ação.';
  }

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
 * Never logs sensitive data like credentials, tokens, or passwords
 */
export function logError(error: unknown, context?: string): void {
  // Only log in development environment
  if (import.meta.env.DEV) {
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
