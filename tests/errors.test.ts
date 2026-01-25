/**
 * Tests for error hierarchy
 */

import {
  TitanError,
  StorageError,
  NotInitializedError,
  MemoryNotFoundError,
  QuotaExceededError,
  AuthError,
  TitanUnauthorizedError,
  InvalidTokenError,
  ForbiddenError,
  MissingInputError,
  InvalidInputError,
  ServiceConnectionError,
  OperationTimeoutError,
  MemoryLockError,
  MemoryConflictError,
  ForgettingRiskError,
  isTitanError,
  isRecoverable,
  createError,
} from '../src/errors.js';

describe('Error Hierarchy', () => {
  describe('TitanError (base class)', () => {
    it('should create error with all properties', () => {
      const error = new TitanError('Test error', 'TEST_CODE', true, { key: 'value' });
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.recoverable).toBe(true);
      expect(error.context).toEqual({ key: 'value' });
      expect(error.name).toBe('TitanError');
    });

    it('should have proper stack trace', () => {
      const error = new TitanError('Test error', 'TEST');
      expect(error.stack).toBeDefined();
    });

    it('should serialize to JSON', () => {
      const error = new TitanError('Test error', 'TEST_CODE', true, { key: 'value' });
      const json = error.toJSON();
      expect(json.name).toBe('TitanError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe('TEST_CODE');
      expect(json.recoverable).toBe(true);
      expect(json.context).toEqual({ key: 'value' });
    });
  });

  describe('Storage Errors', () => {
    it('NotInitializedError should have correct properties', () => {
      const error = new NotInitializedError('TestComponent');
      expect(error.message).toContain('TestComponent');
      expect(error.message).toContain('initialize()');
      expect(error.code).toBe('NOT_INITIALIZED');
      expect(error.name).toBe('NotInitializedError');
      expect(error instanceof StorageError).toBe(true);
      expect(error instanceof TitanError).toBe(true);
    });

    it('MemoryNotFoundError should have correct properties', () => {
      const error = new MemoryNotFoundError('memory-123');
      expect(error.message).toContain('memory-123');
      expect(error.code).toBe('MEMORY_NOT_FOUND');
      expect(error.name).toBe('MemoryNotFoundError');
    });

    it('QuotaExceededError should have correct properties', () => {
      const error = new QuotaExceededError('factual', 10000);
      expect(error.message).toContain('factual');
      expect(error.message).toContain('10000');
      expect(error.code).toBe('QUOTA_EXCEEDED');
      expect(error.name).toBe('QuotaExceededError');
    });
  });

  describe('Authentication Errors', () => {
    it('TitanUnauthorizedError should be non-recoverable', () => {
      const error = new TitanUnauthorizedError();
      expect(error.recoverable).toBe(false);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.name).toBe('TitanUnauthorizedError');
    });

    it('TitanUnauthorizedError should accept custom message', () => {
      const error = new TitanUnauthorizedError('Custom auth message');
      expect(error.message).toBe('Custom auth message');
    });

    it('InvalidTokenError should be non-recoverable', () => {
      const error = new InvalidTokenError();
      expect(error.recoverable).toBe(false);
      expect(error.code).toBe('INVALID_TOKEN');
      expect(error.name).toBe('InvalidTokenError');
    });

    it('ForbiddenError should have action and resource', () => {
      const error = new ForbiddenError('delete', 'memory-123');
      expect(error.message).toContain('delete');
      expect(error.message).toContain('memory-123');
      expect(error.code).toBe('FORBIDDEN');
      expect(error.recoverable).toBe(false);
    });
  });

  describe('Validation Errors', () => {
    it('MissingInputError should have correct properties', () => {
      const error = new MissingInputError('content');
      expect(error.message).toContain('content');
      expect(error.code).toBe('MISSING_INPUT');
      expect(error.name).toBe('MissingInputError');
      expect(error.recoverable).toBe(true);
    });

    it('InvalidInputError should have field and reason', () => {
      const error = new InvalidInputError('email', 'invalid format');
      expect(error.message).toContain('email');
      expect(error.message).toContain('invalid format');
      expect(error.code).toBe('INVALID_INPUT');
      expect(error.name).toBe('InvalidInputError');
    });
  });

  describe('Network Errors', () => {
    it('ServiceConnectionError should have service info', () => {
      const error = new ServiceConnectionError('Zilliz', 'timeout');
      expect(error.message).toContain('Zilliz');
      expect(error.message).toContain('timeout');
      expect(error.code).toBe('CONNECTION_FAILED');
      expect(error.name).toBe('ServiceConnectionError');
      expect(error.recoverable).toBe(true);
    });

    it('OperationTimeoutError should have operation and timeout', () => {
      const error = new OperationTimeoutError('query', 5000);
      expect(error.message).toContain('query');
      expect(error.message).toContain('5000');
      expect(error.code).toBe('TIMEOUT');
      expect(error.name).toBe('OperationTimeoutError');
    });
  });

  describe('Coordination Errors', () => {
    it('MemoryLockError should have resource info', () => {
      const error = new MemoryLockError('memory:123', 'agent-456');
      expect(error.message).toContain('memory:123');
      expect(error.message).toContain('agent-456');
      expect(error.code).toBe('LOCK_FAILED');
      expect(error.name).toBe('MemoryLockError');
    });

    it('MemoryConflictError should have memory and agents', () => {
      const error = new MemoryConflictError('memory-123', ['agent-1', 'agent-2']);
      expect(error.message).toContain('memory-123');
      expect(error.code).toBe('WRITE_CONFLICT');
      expect(error.name).toBe('MemoryConflictError');
      expect(error.context?.conflictingAgents).toEqual(['agent-1', 'agent-2']);
    });
  });

  describe('Learning Errors', () => {
    it('ForgettingRiskError should have pattern and divergence', () => {
      const error = new ForgettingRiskError('pattern-123', 0.75);
      expect(error.message).toContain('pattern-123');
      expect(error.message).toContain('75');
      expect(error.code).toBe('FORGETTING_RISK');
      expect(error.name).toBe('ForgettingRiskError');
    });
  });

  describe('Type Guards', () => {
    it('isTitanError should return true for TitanError', () => {
      const error = new TitanError('Test', 'TEST');
      expect(isTitanError(error)).toBe(true);
    });

    it('isTitanError should return true for subclasses', () => {
      expect(isTitanError(new StorageError('Test', 'TEST'))).toBe(true);
      expect(isTitanError(new AuthError('Test', 'TEST'))).toBe(true);
    });

    it('isTitanError should return false for regular Error', () => {
      expect(isTitanError(new Error('Test'))).toBe(false);
    });

    it('isRecoverable should work correctly', () => {
      expect(isRecoverable(new StorageError('Test', 'TEST'))).toBe(true);
      expect(isRecoverable(new AuthError('Test', 'TEST'))).toBe(false);
      expect(isRecoverable(new Error('Test'))).toBe(false);
    });
  });

  describe('Error Factory', () => {
    it('should create NotInitializedError', () => {
      const error = createError('NOT_INITIALIZED', 'Not init', { component: 'Test' });
      expect(error).toBeInstanceOf(NotInitializedError);
    });

    it('should create MemoryNotFoundError', () => {
      const error = createError('MEMORY_NOT_FOUND', 'Not found', { memoryId: '123' });
      expect(error).toBeInstanceOf(MemoryNotFoundError);
    });

    it('should create TitanUnauthorizedError', () => {
      const error = createError('UNAUTHORIZED', 'Auth required');
      expect(error).toBeInstanceOf(TitanUnauthorizedError);
    });

    it('should create InvalidTokenError', () => {
      const error = createError('INVALID_TOKEN', 'Bad token');
      expect(error).toBeInstanceOf(InvalidTokenError);
    });

    it('should create ForbiddenError', () => {
      const error = createError('FORBIDDEN', 'Forbidden', { action: 'delete' });
      expect(error).toBeInstanceOf(ForbiddenError);
    });

    it('should create MissingInputError', () => {
      const error = createError('MISSING_INPUT', 'Missing', { field: 'content' });
      expect(error).toBeInstanceOf(MissingInputError);
    });

    it('should create InvalidInputError', () => {
      const error = createError('INVALID_INPUT', 'Invalid', { field: 'email', reason: 'bad format' });
      expect(error).toBeInstanceOf(InvalidInputError);
    });

    it('should create ServiceConnectionError', () => {
      const error = createError('CONNECTION_FAILED', 'Failed', { service: 'Zilliz' });
      expect(error).toBeInstanceOf(ServiceConnectionError);
    });

    it('should create OperationTimeoutError', () => {
      const error = createError('TIMEOUT', 'Timeout', { operation: 'query', timeoutMs: 5000 });
      expect(error).toBeInstanceOf(OperationTimeoutError);
    });

    it('should create MemoryLockError', () => {
      const error = createError('LOCK_FAILED', 'Lock failed', { resource: 'memory:123' });
      expect(error).toBeInstanceOf(MemoryLockError);
    });

    it('should create MemoryConflictError', () => {
      const error = createError('WRITE_CONFLICT', 'Conflict', { memoryId: '123', conflictingAgents: [] });
      expect(error).toBeInstanceOf(MemoryConflictError);
    });

    it('should create generic TitanError for unknown codes', () => {
      const error = createError('UNKNOWN_CODE', 'Unknown error');
      expect(error).toBeInstanceOf(TitanError);
      expect(error.code).toBe('UNKNOWN_CODE');
    });
  });
});
