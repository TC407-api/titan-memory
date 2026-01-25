/**
 * A2A Error Classes and Recovery Strategies
 */

import { A2AErrorCode, ErrorPayload } from './protocol.js';

/**
 * Base A2A error class
 */
export class A2AError extends Error {
  public readonly code: A2AErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly correlationId?: string;
  public readonly recoverable: boolean;
  public readonly timestamp: Date;

  constructor(
    code: A2AErrorCode,
    message: string,
    options?: {
      details?: Record<string, unknown>;
      correlationId?: string;
      recoverable?: boolean;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'A2AError';
    this.code = code;
    this.details = options?.details;
    this.correlationId = options?.correlationId;
    this.recoverable = options?.recoverable ?? getDefaultRecoverability(code);
    this.timestamp = new Date();

    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  toPayload(): ErrorPayload {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      correlationId: this.correlationId,
      recoverable: this.recoverable,
    };
  }

  static fromPayload(payload: ErrorPayload): A2AError {
    return new A2AError(payload.code, payload.message, {
      details: payload.details,
      correlationId: payload.correlationId,
      recoverable: payload.recoverable,
    });
  }
}

/**
 * Determine default recoverability based on error code
 */
function getDefaultRecoverability(code: A2AErrorCode): boolean {
  switch (code) {
    case 'TIMEOUT':
    case 'RATE_LIMITED':
    case 'LOCK_FAILED':
    case 'CONNECTION_CLOSED':
      return true;
    case 'INVALID_MESSAGE':
    case 'UNAUTHORIZED':
    case 'NOT_FOUND':
    case 'INVALID_CAPABILITY':
    case 'AGENT_NOT_REGISTERED':
      return false;
    case 'CONFLICT':
    case 'INTERNAL_ERROR':
      return true;
    default:
      return false;
  }
}

/**
 * Recovery strategy for a given error
 */
export interface RecoveryStrategy {
  action: 'retry' | 'reconnect' | 'reauth' | 'abort' | 'wait';
  delayMs?: number;
  maxAttempts?: number;
  description: string;
}

/**
 * Get recommended recovery strategy for an error
 */
export function getRecoveryStrategy(error: A2AError): RecoveryStrategy {
  switch (error.code) {
    case 'TIMEOUT':
      return {
        action: 'retry',
        delayMs: 1000,
        maxAttempts: 3,
        description: 'Retry the operation with exponential backoff',
      };

    case 'RATE_LIMITED':
      return {
        action: 'wait',
        delayMs: (error.details?.retryAfterMs as number) ?? 5000,
        maxAttempts: 5,
        description: 'Wait for rate limit window to reset',
      };

    case 'CONNECTION_CLOSED':
      return {
        action: 'reconnect',
        delayMs: 1000,
        maxAttempts: 10,
        description: 'Reconnect to the server with exponential backoff',
      };

    case 'LOCK_FAILED':
      return {
        action: 'retry',
        delayMs: 500,
        maxAttempts: 5,
        description: 'Retry lock acquisition after delay',
      };

    case 'UNAUTHORIZED':
    case 'AGENT_NOT_REGISTERED':
      return {
        action: 'reauth',
        description: 'Re-register the agent with the server',
      };

    case 'CONFLICT':
      return {
        action: 'retry',
        delayMs: 100,
        maxAttempts: 3,
        description: 'Refresh data and retry operation',
      };

    case 'INTERNAL_ERROR':
      return {
        action: 'retry',
        delayMs: 2000,
        maxAttempts: 2,
        description: 'Wait and retry - server may be recovering',
      };

    case 'INVALID_MESSAGE':
    case 'NOT_FOUND':
    case 'INVALID_CAPABILITY':
    default:
      return {
        action: 'abort',
        description: 'Error is not recoverable - abort operation',
      };
  }
}

/**
 * Retry helper with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
  }
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs = 30000, onRetry } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (error instanceof A2AError && !error.recoverable) {
        throw error;
      }

      if (attempt === maxAttempts) {
        break;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);

      if (onRetry) {
        onRetry(attempt, lastError);
      }

      await sleep(delay);
    }
  }

  throw lastError ?? new A2AError('INTERNAL_ERROR', 'Max retries exceeded');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Specific error types for common scenarios
 */
export class ConnectionError extends A2AError {
  constructor(message: string, cause?: Error) {
    super('CONNECTION_CLOSED', message, { recoverable: true, cause });
    this.name = 'ConnectionError';
  }
}

export class TimeoutError extends A2AError {
  constructor(message: string, correlationId?: string) {
    super('TIMEOUT', message, { correlationId, recoverable: true });
    this.name = 'TimeoutError';
  }
}

export class LockError extends A2AError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('LOCK_FAILED', message, { details, recoverable: true });
    this.name = 'LockError';
  }
}

export class ConflictError extends A2AError {
  constructor(message: string, details: Record<string, unknown>) {
    super('CONFLICT', message, { details, recoverable: true });
    this.name = 'ConflictError';
  }
}

export class UnauthorizedError extends A2AError {
  constructor(message: string) {
    super('UNAUTHORIZED', message, { recoverable: false });
    this.name = 'UnauthorizedError';
  }
}
