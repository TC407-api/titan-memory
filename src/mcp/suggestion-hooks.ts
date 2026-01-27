/**
 * Suggestion Hooks
 * Integration hooks for proactive suggestions system
 */

import { MemoryEntry, ProactiveSuggestion, ProactiveSuggestionsConfig } from '../types.js';
import { ProactiveSuggestionsManager } from './proactive-suggestions.js';
import { IEmbeddingGenerator } from '../storage/vector-storage.js';

/**
 * Hook event types for suggestion triggers
 */
export type SuggestionTrigger =
  | 'user_input'       // User provides new input
  | 'context_change'   // Context significantly changes
  | 'memory_add'       // New memory is added
  | 'recall_empty'     // Recall returns no results
  | 'periodic'         // Periodic suggestion refresh
  | 'manual';          // Manual request

/**
 * Hook result with suggestions and metadata
 */
export interface SuggestionHookResult {
  trigger: SuggestionTrigger;
  suggestions: ProactiveSuggestion[];
  timestamp: Date;
  context?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Hook configuration
 */
export interface SuggestionHookConfig {
  enabled: boolean;
  triggers: SuggestionTrigger[];
  minIntervalMs: number;          // Minimum time between hooks
  contextChangeThreshold: number; // Similarity threshold for context change
}

const DEFAULT_HOOK_CONFIG: SuggestionHookConfig = {
  enabled: true,
  triggers: ['user_input', 'context_change', 'recall_empty', 'manual'],
  minIntervalMs: 5000,
  contextChangeThreshold: 0.5,
};

/**
 * Suggestion Hooks Manager
 * Manages trigger-based proactive suggestions
 */
export class SuggestionHooksManager {
  private suggestionsManager: ProactiveSuggestionsManager;
  private config: SuggestionHookConfig;
  private lastContext: string = '';
  private lastHookTime: number = 0;
  private hookHistory: SuggestionHookResult[] = [];

  constructor(
    suggestionsConfig?: Partial<ProactiveSuggestionsConfig>,
    hookConfig?: Partial<SuggestionHookConfig>,
    embeddingGenerator?: IEmbeddingGenerator
  ) {
    this.suggestionsManager = new ProactiveSuggestionsManager(suggestionsConfig, embeddingGenerator);
    this.config = { ...DEFAULT_HOOK_CONFIG, ...hookConfig };
  }

  /**
   * Set embedding generator
   */
  setEmbeddingGenerator(generator: IEmbeddingGenerator): void {
    this.suggestionsManager.setEmbeddingGenerator(generator);
  }

  /**
   * Trigger suggestions based on event
   */
  async triggerHook(
    trigger: SuggestionTrigger,
    context: string,
    availableMemories: MemoryEntry[],
    metadata?: Record<string, unknown>
  ): Promise<SuggestionHookResult | null> {
    // Check if enabled and trigger is allowed
    if (!this.config.enabled) return null;
    if (!this.config.triggers.includes(trigger)) return null;

    // Check minimum interval (except for manual triggers)
    if (trigger !== 'manual') {
      const now = Date.now();
      if (now - this.lastHookTime < this.config.minIntervalMs) {
        return null;
      }
    }

    // For context_change trigger, check if context actually changed significantly
    if (trigger === 'context_change') {
      if (!this.hasContextChanged(context)) {
        return null;
      }
    }

    // Get suggestions
    const suggestions = await this.suggestionsManager.suggest(context, availableMemories);

    // Create result
    const result: SuggestionHookResult = {
      trigger,
      suggestions,
      timestamp: new Date(),
      context,
      metadata,
    };

    // Update tracking
    this.lastContext = context;
    this.lastHookTime = Date.now();
    this.hookHistory.push(result);

    // Keep history bounded
    if (this.hookHistory.length > 100) {
      this.hookHistory = this.hookHistory.slice(-100);
    }

    return result;
  }

  /**
   * Check if context has changed significantly
   */
  private hasContextChanged(newContext: string): boolean {
    if (!this.lastContext) return true;

    // Simple term-based comparison
    const lastTerms = new Set(this.lastContext.toLowerCase().split(/\s+/));
    const newTerms = new Set(newContext.toLowerCase().split(/\s+/));

    let overlap = 0;
    for (const term of newTerms) {
      if (lastTerms.has(term)) overlap++;
    }

    const similarity = overlap / Math.max(lastTerms.size, newTerms.size);
    return similarity < this.config.contextChangeThreshold;
  }

  /**
   * Handle user input event
   */
  async onUserInput(
    input: string,
    availableMemories: MemoryEntry[]
  ): Promise<SuggestionHookResult | null> {
    return this.triggerHook('user_input', input, availableMemories, { source: 'user' });
  }

  /**
   * Handle memory add event
   */
  async onMemoryAdd(
    memory: MemoryEntry,
    availableMemories: MemoryEntry[]
  ): Promise<SuggestionHookResult | null> {
    return this.triggerHook('memory_add', memory.content, availableMemories, {
      memoryId: memory.id,
      source: 'memory_add',
    });
  }

  /**
   * Handle empty recall event
   */
  async onRecallEmpty(
    query: string,
    availableMemories: MemoryEntry[]
  ): Promise<SuggestionHookResult | null> {
    return this.triggerHook('recall_empty', query, availableMemories, {
      originalQuery: query,
      source: 'recall_empty',
    });
  }

  /**
   * Manual suggestion request
   */
  async requestSuggestions(
    context: string,
    availableMemories: MemoryEntry[]
  ): Promise<SuggestionHookResult | null> {
    return this.triggerHook('manual', context, availableMemories, { source: 'manual' });
  }

  /**
   * Get recent hook results
   */
  getRecentHooks(windowMs: number = 3600000): SuggestionHookResult[] {
    const now = Date.now();
    return this.hookHistory
      .filter(h => (now - h.timestamp.getTime()) < windowMs);
  }

  /**
   * Get hook statistics
   */
  getStats(): {
    enabled: boolean;
    totalHooks: number;
    recentHooks: number;
    byTrigger: Record<SuggestionTrigger, number>;
  } {
    const byTrigger: Record<SuggestionTrigger, number> = {
      user_input: 0,
      context_change: 0,
      memory_add: 0,
      recall_empty: 0,
      periodic: 0,
      manual: 0,
    };

    for (const hook of this.hookHistory) {
      byTrigger[hook.trigger]++;
    }

    return {
      enabled: this.config.enabled,
      totalHooks: this.hookHistory.length,
      recentHooks: this.getRecentHooks().length,
      byTrigger,
    };
  }

  /**
   * Update hook configuration
   */
  updateConfig(config: Partial<SuggestionHookConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Update suggestions configuration
   */
  updateSuggestionsConfig(config: Partial<ProactiveSuggestionsConfig>): void {
    this.suggestionsManager.updateConfig(config);
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.hookHistory = [];
    this.lastContext = '';
    this.suggestionsManager.clearHistory();
  }
}

/**
 * Create a suggestion hooks manager
 */
export function createSuggestionHooksManager(
  suggestionsConfig?: Partial<ProactiveSuggestionsConfig>,
  hookConfig?: Partial<SuggestionHookConfig>,
  embeddingGenerator?: IEmbeddingGenerator
): SuggestionHooksManager {
  return new SuggestionHooksManager(suggestionsConfig, hookConfig, embeddingGenerator);
}
