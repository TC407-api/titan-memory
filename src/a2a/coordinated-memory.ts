/**
 * Coordinated Memory Operations
 * Wrapper for TitanMemory that adds coordination via A2A
 */

import { MemoryEntry, MemoryMetadata, QueryOptions, UnifiedQueryResult } from '../types.js';
import {
  LockResource,
  LockMode,
  LockGrantedPayload,
  MemoryAddedPayload,
  MemoryDeletedPayload,
  MemoryRecalledPayload,
} from './protocol.js';
import { A2AClient } from './client.js';
import { MemoryEventBridge } from './events.js';
import { withRetry } from './errors.js';

/**
 * Options for coordinated operations
 */
export interface CoordinatedOptions {
  requireLock?: boolean;
  lockMode?: LockMode;
  lockTimeoutMs?: number;
  retryOnConflict?: boolean;
  maxRetries?: number;
}

const DEFAULT_COORDINATED_OPTIONS: CoordinatedOptions = {
  requireLock: true,
  lockMode: 'exclusive',
  lockTimeoutMs: 30000,
  retryOnConflict: true,
  maxRetries: 3,
};

/**
 * Interface for the underlying TitanMemory operations
 */
export interface TitanMemoryOperations {
  add(content: string, metadata?: Partial<MemoryMetadata>): Promise<MemoryEntry>;
  recall(query: string, options?: QueryOptions): Promise<UnifiedQueryResult>;
  get(id: string): Promise<MemoryEntry | null>;
  delete(id: string): Promise<boolean>;
}

/**
 * Coordinated Memory - wraps TitanMemory with A2A coordination
 */
export class CoordinatedMemory {
  private titan: TitanMemoryOperations;
  private client: A2AClient;
  private eventBridge: MemoryEventBridge;
  private heldLocks: Map<string, LockGrantedPayload>;

  constructor(
    titan: TitanMemoryOperations,
    client: A2AClient,
    eventBridge: MemoryEventBridge
  ) {
    this.titan = titan;
    this.client = client;
    this.eventBridge = eventBridge;
    this.heldLocks = new Map();

    // Listen for conflict events
    this.client.on('conflict', (conflict) => {
      this.handleConflict(conflict);
    });
  }

  /**
   * Add memory with coordination
   */
  async add(
    content: string,
    metadata?: Partial<MemoryMetadata>,
    options?: CoordinatedOptions
  ): Promise<MemoryEntry> {
    const opts = { ...DEFAULT_COORDINATED_OPTIONS, ...options };
    const projectId = metadata?.projectId;

    // Get lock if required
    let lock: LockGrantedPayload | undefined;
    if (opts.requireLock && projectId) {
      lock = await this.acquireLock({ type: 'project', projectId }, opts);
    }

    try {
      // Perform the operation
      const entry = await this.titan.add(content, metadata);

      // Emit event for other agents
      this.eventBridge.emitAdd(entry, entry.layer);

      // Send to server
      this.client.sendMemoryEvent<MemoryAddedPayload>('memory.added', {
        memory: entry,
        agentId: this.eventBridge.getAgentId(),
        layer: entry.layer,
      });

      return entry;
    } finally {
      // Release lock
      if (lock) {
        await this.releaseLock(lock);
      }
    }
  }

  /**
   * Recall memories with coordination
   */
  async recall(
    query: string,
    options?: QueryOptions & CoordinatedOptions
  ): Promise<UnifiedQueryResult> {
    const start = Date.now();
    const result = await this.titan.recall(query, options);
    const queryTimeMs = Date.now() - start;

    // Emit event for other agents
    this.eventBridge.emitRecall(query, result.fusedMemories, queryTimeMs);

    // Send to server
    this.client.sendMemoryEvent<MemoryRecalledPayload>('memory.recalled', {
      query,
      results: result.fusedMemories,
      agentId: this.eventBridge.getAgentId(),
      queryTimeMs,
    });

    return result;
  }

  /**
   * Get a specific memory
   */
  async get(id: string): Promise<MemoryEntry | null> {
    return this.titan.get(id);
  }

  /**
   * Delete memory with coordination
   */
  async delete(
    id: string,
    reason?: string,
    options?: CoordinatedOptions
  ): Promise<boolean> {
    const opts = { ...DEFAULT_COORDINATED_OPTIONS, ...options };

    // Get lock on the specific memory
    let lock: LockGrantedPayload | undefined;
    if (opts.requireLock) {
      lock = await this.acquireLock({ type: 'memory', memoryId: id }, opts);
    }

    try {
      const success = await this.titan.delete(id);

      if (success) {
        // Emit event for other agents
        this.eventBridge.emitDelete(id, reason);

        // Send to server
        this.client.sendMemoryEvent<MemoryDeletedPayload>('memory.deleted', {
          memoryId: id,
          agentId: this.eventBridge.getAgentId(),
          reason,
        });
      }

      return success;
    } finally {
      if (lock) {
        await this.releaseLock(lock);
      }
    }
  }

  /**
   * Execute operation with lock
   */
  async withLock<T>(
    resource: LockResource,
    operation: () => Promise<T>,
    options?: CoordinatedOptions
  ): Promise<T> {
    const opts = { ...DEFAULT_COORDINATED_OPTIONS, ...options };
    const lock = await this.acquireLock(resource, opts);

    try {
      return await operation();
    } finally {
      await this.releaseLock(lock);
    }
  }

  /**
   * Acquire a lock
   */
  private async acquireLock(
    resource: LockResource,
    options: CoordinatedOptions
  ): Promise<LockGrantedPayload> {
    const lockKey = this.getLockKey(resource);

    // Check if we already hold this lock
    const existing = this.heldLocks.get(lockKey);
    if (existing && new Date() < existing.expiresAt) {
      return existing;
    }

    // Request lock with retry
    const lock = await withRetry(
      () => this.client.requestLock(resource, options.lockMode, options.lockTimeoutMs),
      {
        maxAttempts: options.maxRetries ?? 3,
        baseDelayMs: 500,
        onRetry: (attempt) => {
          this.eventBridge.emit('lockRetry', { resource, attempt });
        },
      }
    );

    this.heldLocks.set(lockKey, lock);
    return lock;
  }

  /**
   * Release a lock
   */
  private async releaseLock(lock: LockGrantedPayload): Promise<void> {
    const lockKey = this.getLockKey(lock.resource);
    this.heldLocks.delete(lockKey);

    try {
      await this.client.releaseLock(lock.lockId, lock.resource);
    } catch (error) {
      // Log but don't throw - lock will expire anyway
      console.warn('Failed to release lock:', error);
    }
  }

  /**
   * Get unique key for a lock resource
   */
  private getLockKey(resource: LockResource): string {
    switch (resource.type) {
      case 'memory':
        return `memory:${resource.memoryId}`;
      case 'layer':
        return `layer:${resource.layer}`;
      case 'project':
        return `project:${resource.projectId}`;
      case 'global':
        return 'global';
    }
  }

  /**
   * Handle conflict notification
   */
  private handleConflict(conflict: unknown): void {
    this.eventBridge.emit('conflict', conflict);
  }

  /**
   * Get currently held locks
   */
  getHeldLocks(): Map<string, LockGrantedPayload> {
    return new Map(this.heldLocks);
  }

  /**
   * Release all held locks
   */
  async releaseAllLocks(): Promise<void> {
    const locks = Array.from(this.heldLocks.values());
    await Promise.all(locks.map(lock => this.releaseLock(lock)));
  }
}

/**
 * Create coordinated memory wrapper
 */
export function createCoordinatedMemory(
  titan: TitanMemoryOperations,
  client: A2AClient,
  eventBridge: MemoryEventBridge
): CoordinatedMemory {
  return new CoordinatedMemory(titan, client, eventBridge);
}
