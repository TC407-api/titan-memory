/**
 * Titan Memory Error Hierarchy
 * Structured error types for consistent error handling
 */

/**
 * Base error class for all Titan Memory errors
 */
export class TitanError extends Error {
  public readonly code: string;
  public readonly recoverable: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    recoverable: boolean = true,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TitanError';
    this.code = code;
    this.recoverable = recoverable;
    this.context = context;
    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      context: this.context,
    };
  }
}

// ==================== Storage Errors ====================

/**
 * Errors related to storage operations
 */
export class StorageError extends TitanError {
  constructor(
    message: string,
    code: string = 'STORAGE_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message, code, true, context);
    this.name = 'StorageError';
  }
}

/**
 * Error when storage is not initialized
 */
export class NotInitializedError extends StorageError {
  constructor(component: string) {
    super(
      `${component} is not initialized. Call initialize() first.`,
      'NOT_INITIALIZED',
      { component }
    );
    this.name = 'NotInitializedError';
  }
}

/**
 * Error when a memory is not found
 */
export class MemoryNotFoundError extends StorageError {
  constructor(memoryId: string) {
    super(
      `Memory not found: ${memoryId}`,
      'MEMORY_NOT_FOUND',
      { memoryId }
    );
    this.name = 'MemoryNotFoundError';
  }
}

/**
 * Error when storage quota is exceeded
 */
export class QuotaExceededError extends StorageError {
  constructor(layer: string, limit: number) {
    super(
      `Storage quota exceeded for layer ${layer}. Limit: ${limit}`,
      'QUOTA_EXCEEDED',
      { layer, limit }
    );
    this.name = 'QuotaExceededError';
  }
}

// ==================== Authentication Errors ====================

/**
 * Base authentication error
 */
export class AuthError extends TitanError {
  constructor(
    message: string,
    code: string = 'AUTH_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message, code, false, context);
    this.name = 'AuthError';
  }
}

/**
 * Error when authentication is required but not provided
 */
export class TitanUnauthorizedError extends AuthError {
  constructor(message: string = 'Authentication required') {
    super(message, 'UNAUTHORIZED');
    this.name = 'TitanUnauthorizedError';
  }
}

/**
 * Error when authentication credentials are invalid
 */
export class InvalidTokenError extends AuthError {
  constructor() {
    super('Invalid or expired token', 'INVALID_TOKEN');
    this.name = 'InvalidTokenError';
  }
}

/**
 * Error when user doesn't have required permissions
 */
export class ForbiddenError extends AuthError {
  constructor(action: string, resource?: string) {
    super(
      `Permission denied: ${action}${resource ? ` on ${resource}` : ''}`,
      'FORBIDDEN',
      { action, resource }
    );
    this.name = 'ForbiddenError';
  }
}

// ==================== Validation Errors ====================

/**
 * Base validation error
 */
export class ValidationError extends TitanError {
  constructor(
    message: string,
    code: string = 'VALIDATION_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message, code, true, context);
    this.name = 'ValidationError';
  }
}

/**
 * Error when required input is missing
 */
export class MissingInputError extends ValidationError {
  constructor(field: string) {
    super(
      `Missing required field: ${field}`,
      'MISSING_INPUT',
      { field }
    );
    this.name = 'MissingInputError';
  }
}

/**
 * Error when input format is invalid
 */
export class InvalidInputError extends ValidationError {
  constructor(field: string, reason: string) {
    super(
      `Invalid ${field}: ${reason}`,
      'INVALID_INPUT',
      { field, reason }
    );
    this.name = 'InvalidInputError';
  }
}

// ==================== Network/Connection Errors ====================

/**
 * Base network error
 */
export class NetworkError extends TitanError {
  constructor(
    message: string,
    code: string = 'NETWORK_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message, code, true, context);
    this.name = 'NetworkError';
  }
}

/**
 * Error when connection to external service fails
 */
export class ServiceConnectionError extends NetworkError {
  constructor(service: string, reason?: string) {
    super(
      `Failed to connect to ${service}${reason ? `: ${reason}` : ''}`,
      'CONNECTION_FAILED',
      { service, reason }
    );
    this.name = 'ServiceConnectionError';
  }
}

/**
 * Error when request times out
 */
export class OperationTimeoutError extends NetworkError {
  constructor(operation: string, timeoutMs: number) {
    super(
      `Operation timed out: ${operation} (${timeoutMs}ms)`,
      'TIMEOUT',
      { operation, timeoutMs }
    );
    this.name = 'OperationTimeoutError';
  }
}

// ==================== Coordination Errors ====================

/**
 * Base coordination error (for A2A)
 */
export class CoordinationError extends TitanError {
  constructor(
    message: string,
    code: string = 'COORDINATION_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message, code, true, context);
    this.name = 'CoordinationError';
  }
}

/**
 * Error when a lock cannot be acquired
 */
export class MemoryLockError extends CoordinationError {
  constructor(resource: string, holder?: string) {
    super(
      `Cannot acquire lock on ${resource}${holder ? ` (held by ${holder})` : ''}`,
      'LOCK_FAILED',
      { resource, holder }
    );
    this.name = 'MemoryLockError';
  }
}

/**
 * Error when a write conflict is detected
 */
export class MemoryConflictError extends CoordinationError {
  constructor(memoryId: string, conflictingAgents: string[]) {
    super(
      `Write conflict on memory ${memoryId}`,
      'WRITE_CONFLICT',
      { memoryId, conflictingAgents }
    );
    this.name = 'MemoryConflictError';
  }
}

// ==================== Learning Errors ====================

/**
 * Error when catastrophic forgetting is detected
 */
export class ForgettingRiskError extends TitanError {
  constructor(patternId: string, divergence: number) {
    super(
      `Catastrophic forgetting risk for pattern ${patternId} (divergence: ${(divergence * 100).toFixed(1)}%)`,
      'FORGETTING_RISK',
      true,
      { patternId, divergence }
    );
    this.name = 'ForgettingRiskError';
  }
}

// ==================== Type Guards ====================

export function isTitanError(error: unknown): error is TitanError {
  return error instanceof TitanError;
}

export function isRecoverable(error: unknown): boolean {
  if (isTitanError(error)) {
    return error.recoverable;
  }
  return false;
}

// ==================== Error Factory ====================

/**
 * Create appropriate error from code
 */
export function createError(
  code: string,
  message: string,
  context?: Record<string, unknown>
): TitanError {
  switch (code) {
    case 'NOT_INITIALIZED':
      return new NotInitializedError(context?.component as string || 'Unknown');
    case 'MEMORY_NOT_FOUND':
      return new MemoryNotFoundError(context?.memoryId as string || 'Unknown');
    case 'UNAUTHORIZED':
      return new TitanUnauthorizedError(message);
    case 'INVALID_TOKEN':
      return new InvalidTokenError();
    case 'FORBIDDEN':
      return new ForbiddenError(context?.action as string || 'Unknown');
    case 'MISSING_INPUT':
      return new MissingInputError(context?.field as string || 'Unknown');
    case 'INVALID_INPUT':
      return new InvalidInputError(context?.field as string || 'Unknown', context?.reason as string || 'Unknown');
    case 'CONNECTION_FAILED':
      return new ServiceConnectionError(context?.service as string || 'Unknown');
    case 'TIMEOUT':
      return new OperationTimeoutError(context?.operation as string || 'Unknown', context?.timeoutMs as number || 0);
    case 'LOCK_FAILED':
      return new MemoryLockError(context?.resource as string || 'Unknown');
    case 'WRITE_CONFLICT':
      return new MemoryConflictError(context?.memoryId as string || 'Unknown', context?.conflictingAgents as string[] || []);
    default:
      return new TitanError(message, code, true, context);
  }
}
