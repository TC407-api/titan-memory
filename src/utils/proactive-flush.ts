/**
 * FR-3: Proactive Context Flush Manager
 *
 * Integrates with Grade 5 ContextManager to trigger memory flush
 * at configurable context thresholds (default: 50%).
 *
 * Key features:
 * - Debounced flush to prevent rapid-fire triggers
 * - Non-blocking async flush operation
 * - Configurable threshold
 * - Comprehensive logging for observability
 */

import { getConfig } from './config.js';
import { CompactionContext, MemoryEntry } from '../types.js';

/**
 * Flush reason metadata
 */
export interface ProactiveFlushMetadata {
  reason: 'proactive_context_management' | 'emergency' | 'manual';
  contextRatio: number;
  triggerThreshold: number;
  timestamp: string;
  debounced: boolean;
  [key: string]: unknown; // Allow index signature for CompactionContext.metadata
}

/**
 * Callback type for flush trigger
 */
export type FlushCallback = (context: CompactionContext) => Promise<MemoryEntry[]>;

/**
 * Context level enum (mirrors Grade 5 ContextLevel)
 */
export type ContextLevel = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OVERFLOW';

/**
 * Proactive Flush Manager
 *
 * Manages context-aware memory flushing with debouncing
 * to prevent context degradation at high utilization.
 */
export class ProactiveFlushManager {
  private enabled: boolean;
  private threshold: number;
  private lastFlushTime: number = 0;
  private debounceMs: number = 5000; // 5 second debounce
  private flushInProgress: boolean = false;
  private flushCallback?: FlushCallback;
  private flushCount: number = 0;
  private lastFlushRatio: number = 0;

  constructor(options?: { debounceMs?: number }) {
    const config = getConfig();
    this.enabled = config.enableProactiveFlush ?? true;
    this.threshold = config.contextFlushThreshold ?? 0.5;
    this.debounceMs = options?.debounceMs ?? 5000;
  }

  /**
   * Register the flush callback function
   * This should be the TitanMemory.flushPreCompaction method
   */
  setFlushCallback(callback: FlushCallback): void {
    this.flushCallback = callback;
  }

  /**
   * Handle context threshold crossing
   * This is the callback for Grade 5 ContextManager.onThreshold()
   *
   * @param level - Current context level
   * @param ratio - Current context usage ratio (0-1)
   */
  async handleThreshold(_level: ContextLevel, ratio: number): Promise<{
    flushed: boolean;
    reason?: string;
    memoriesPreserved?: number;
  }> {
    // Check if proactive flush is enabled
    if (!this.enabled) {
      return { flushed: false, reason: 'Proactive flush disabled' };
    }

    // Check if we should flush based on threshold
    if (ratio < this.threshold) {
      return { flushed: false, reason: `Below threshold (${ratio} < ${this.threshold})` };
    }

    // Check debounce
    const now = Date.now();
    const timeSinceLastFlush = now - this.lastFlushTime;
    if (timeSinceLastFlush < this.debounceMs) {
      return {
        flushed: false,
        reason: `Debounced (${timeSinceLastFlush}ms since last flush, need ${this.debounceMs}ms)`,
      };
    }

    // Check if flush already in progress
    if (this.flushInProgress) {
      return { flushed: false, reason: 'Flush already in progress' };
    }

    // Check if callback is registered
    if (!this.flushCallback) {
      return { flushed: false, reason: 'No flush callback registered' };
    }

    // Execute flush
    return this.executeFlush(ratio);
  }

  /**
   * Execute the flush operation (non-blocking)
   */
  private async executeFlush(contextRatio: number): Promise<{
    flushed: boolean;
    reason?: string;
    memoriesPreserved?: number;
  }> {
    this.flushInProgress = true;
    this.lastFlushTime = Date.now();

    const metadata: ProactiveFlushMetadata = {
      reason: 'proactive_context_management',
      contextRatio,
      triggerThreshold: this.threshold,
      timestamp: new Date().toISOString(),
      debounced: false,
    };

    try {
      // Create compaction context
      const compactionContext: CompactionContext = {
        sessionId: `proactive-${Date.now()}`,
        insights: [`Proactive flush triggered at ${(contextRatio * 100).toFixed(1)}% context usage`],
        decisions: ['Auto-preserving important context before potential compaction'],
        errors: [],
        solutions: [],
        metadata,
      };

      // Execute the flush callback
      const preservedMemories = await this.flushCallback!(compactionContext);

      this.flushCount++;
      this.lastFlushRatio = contextRatio;

      console.log('[ProactiveFlush] Successfully preserved', preservedMemories.length, 'memories at', (contextRatio * 100).toFixed(1) + '% context');

      return {
        flushed: true,
        reason: 'Proactive flush completed',
        memoriesPreserved: preservedMemories.length,
      };
    } catch (error) {
      console.error('[ProactiveFlush] Flush failed:', error);
      return {
        flushed: false,
        reason: `Flush failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    } finally {
      this.flushInProgress = false;
    }
  }

  /**
   * Manually trigger a flush (for emergency situations)
   */
  async triggerManualFlush(contextRatio: number = 1.0): Promise<{
    flushed: boolean;
    reason?: string;
    memoriesPreserved?: number;
  }> {
    if (!this.flushCallback) {
      return { flushed: false, reason: 'No flush callback registered' };
    }

    // Skip debounce for manual triggers
    this.lastFlushTime = 0;

    return this.executeFlush(contextRatio);
  }

  /**
   * Update configuration at runtime
   */
  configure(options: {
    enabled?: boolean;
    threshold?: number;
    debounceMs?: number;
  }): void {
    if (options.enabled !== undefined) {
      this.enabled = options.enabled;
    }
    if (options.threshold !== undefined) {
      this.threshold = Math.max(0, Math.min(1, options.threshold));
    }
    if (options.debounceMs !== undefined) {
      this.debounceMs = Math.max(1000, options.debounceMs); // Min 1 second
    }
  }

  /**
   * Get current manager statistics
   */
  getStats(): {
    enabled: boolean;
    threshold: number;
    debounceMs: number;
    flushCount: number;
    lastFlushRatio: number;
    lastFlushTime: number;
    flushInProgress: boolean;
  } {
    return {
      enabled: this.enabled,
      threshold: this.threshold,
      debounceMs: this.debounceMs,
      flushCount: this.flushCount,
      lastFlushRatio: this.lastFlushRatio,
      lastFlushTime: this.lastFlushTime,
      flushInProgress: this.flushInProgress,
    };
  }

  /**
   * Check if flush is enabled and should be active
   */
  isActive(): boolean {
    return this.enabled && !!this.flushCallback;
  }
}

// Singleton instance
let instance: ProactiveFlushManager | null = null;

/**
 * Get the singleton ProactiveFlushManager instance
 */
export function getProactiveFlushManager(): ProactiveFlushManager {
  if (!instance) {
    instance = new ProactiveFlushManager();
  }
  return instance;
}

/**
 * Create a new ProactiveFlushManager (for testing or custom configuration)
 */
export function createProactiveFlushManager(options?: {
  debounceMs?: number;
}): ProactiveFlushManager {
  return new ProactiveFlushManager(options);
}
