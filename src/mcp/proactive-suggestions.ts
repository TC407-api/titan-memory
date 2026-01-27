/**
 * Proactive Memory Suggestions
 * Suggests relevant memories based on current context
 */

import { ProactiveSuggestion, ProactiveSuggestionsConfig, MemoryEntry } from '../types.js';
import { SemanticHighlighter } from '../utils/semantic-highlight.js';
import { contentSimilarity } from '../utils/similarity.js';
import { IEmbeddingGenerator } from '../storage/vector-storage.js';
import { cosineSimilarity } from '../storage/embeddings/index.js';

const DEFAULT_CONFIG: Required<ProactiveSuggestionsConfig> = {
  enabled: true,
  maxSuggestions: 5,
  minUtility: 0.6,
  minRelevance: 0.5,
  includeHighlighting: true,
};

/**
 * Suggestion scoring factors
 */
interface SuggestionScore {
  relevance: number;
  utility: number;
  recency: number;
  combined: number;
}

/**
 * Proactive Suggestions Manager
 * Analyzes context and suggests relevant memories
 */
export class ProactiveSuggestionsManager {
  private config: Required<ProactiveSuggestionsConfig>;
  private highlighter: SemanticHighlighter;
  private embeddingGenerator?: IEmbeddingGenerator;
  private suggestionHistory: Map<string, Date> = new Map();

  constructor(config?: Partial<ProactiveSuggestionsConfig>, embeddingGenerator?: IEmbeddingGenerator) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.highlighter = new SemanticHighlighter({ enabled: this.config.includeHighlighting });

    if (embeddingGenerator) {
      this.embeddingGenerator = embeddingGenerator;
      this.highlighter.setEmbeddingGenerator(embeddingGenerator);
    }
  }

  /**
   * Set embedding generator
   */
  setEmbeddingGenerator(generator: IEmbeddingGenerator): void {
    this.embeddingGenerator = generator;
    this.highlighter.setEmbeddingGenerator(generator);
  }

  /**
   * Generate proactive suggestions for current context
   */
  async suggest(
    currentContext: string,
    availableMemories: MemoryEntry[],
    options?: {
      limit?: number;
      minUtility?: number;
      minRelevance?: number;
    }
  ): Promise<ProactiveSuggestion[]> {
    if (!this.config.enabled) return [];

    const limit = options?.limit ?? this.config.maxSuggestions;
    const minUtility = options?.minUtility ?? this.config.minUtility;
    const minRelevance = options?.minRelevance ?? this.config.minRelevance;

    // Score all memories
    const scoredMemories = await this.scoreMemories(currentContext, availableMemories);

    // Filter and sort
    const filtered = scoredMemories
      .filter(s =>
        s.score.utility >= minUtility &&
        s.score.relevance >= minRelevance
      )
      .sort((a, b) => b.score.combined - a.score.combined)
      .slice(0, limit);

    // Convert to suggestions
    const suggestions: ProactiveSuggestion[] = [];

    for (const item of filtered) {
      const suggestion = await this.createSuggestion(
        item.memory,
        item.score,
        currentContext
      );
      suggestions.push(suggestion);

      // Track suggestion
      this.suggestionHistory.set(item.memory.id, new Date());
    }

    return suggestions;
  }

  /**
   * Score memories against current context
   */
  private async scoreMemories(
    context: string,
    memories: MemoryEntry[]
  ): Promise<Array<{ memory: MemoryEntry; score: SuggestionScore }>> {
    const results: Array<{ memory: MemoryEntry; score: SuggestionScore }> = [];

    // Use semantic similarity if embedding generator available
    let contextEmbedding: number[] | undefined;
    if (this.embeddingGenerator) {
      try {
        contextEmbedding = await this.embeddingGenerator.generateEmbedding(context);
      } catch {
        // Fall back to term similarity
      }
    }

    for (const memory of memories) {
      const score = await this.calculateScore(context, memory, contextEmbedding);
      results.push({ memory, score });
    }

    return results;
  }

  /**
   * Calculate suggestion score for a memory
   */
  private async calculateScore(
    context: string,
    memory: MemoryEntry,
    contextEmbedding?: number[]
  ): Promise<SuggestionScore> {
    // Relevance score
    let relevance: number;
    if (contextEmbedding && this.embeddingGenerator) {
      try {
        const memoryEmbedding = await this.embeddingGenerator.generateEmbedding(memory.content);
        relevance = cosineSimilarity(contextEmbedding, memoryEmbedding);
      } catch {
        relevance = contentSimilarity(context, memory.content);
      }
    } else {
      relevance = contentSimilarity(context, memory.content);
    }

    // Utility score (from feedback)
    const utility = (memory.metadata.utilityScore as number) ?? 0.5;

    // Recency score (more recent = higher)
    const daysSinceCreated = (Date.now() - memory.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    const recency = Math.exp(-daysSinceCreated / 90); // 90-day half-life

    // Combined score (weighted average)
    const combined = (
      relevance * 0.5 +
      utility * 0.3 +
      recency * 0.2
    );

    return { relevance, utility, recency, combined };
  }

  /**
   * Create a suggestion from scored memory
   */
  private async createSuggestion(
    memory: MemoryEntry,
    score: SuggestionScore,
    context: string
  ): Promise<ProactiveSuggestion> {
    let highlightedContent: string | undefined;

    // Apply highlighting if enabled
    if (this.config.includeHighlighting) {
      try {
        highlightedContent = await this.highlighter.highlightFormatted(
          context,
          memory.content,
          0.4 // Lower threshold for suggestions
        );
      } catch {
        // Fall back to no highlighting
      }
    }

    return {
      memoryId: memory.id,
      content: memory.content,
      highlightedContent,
      relevanceScore: score.relevance,
      utilityScore: score.utility,
      reason: this.generateReason(memory, score),
      tags: (memory.metadata.tags as string[]) ?? [],
    };
  }

  /**
   * Generate human-readable reason for suggestion
   */
  private generateReason(_memory: MemoryEntry, score: SuggestionScore): string {
    const reasons: string[] = [];

    if (score.relevance > 0.8) {
      reasons.push('highly relevant to current context');
    } else if (score.relevance > 0.6) {
      reasons.push('related to current topic');
    }

    if (score.utility > 0.8) {
      reasons.push('frequently helpful');
    }

    if (score.recency > 0.8) {
      reasons.push('recently added');
    }

    if (reasons.length === 0) {
      reasons.push('potentially relevant');
    }

    return reasons.join(', ');
  }

  /**
   * Check if memory was recently suggested
   */
  wasRecentlySuggested(memoryId: string, windowMs: number = 300000): boolean {
    const lastSuggested = this.suggestionHistory.get(memoryId);
    if (!lastSuggested) return false;
    return (Date.now() - lastSuggested.getTime()) < windowMs;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ProactiveSuggestionsConfig>): void {
    this.config = { ...this.config, ...config };
    this.highlighter.updateConfig({ enabled: this.config.includeHighlighting });
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get statistics
   */
  getStats(): {
    enabled: boolean;
    suggestionCount: number;
    recentSuggestions: number;
  } {
    const now = Date.now();
    const recentWindow = 3600000; // 1 hour
    const recentSuggestions = [...this.suggestionHistory.values()]
      .filter(date => (now - date.getTime()) < recentWindow).length;

    return {
      enabled: this.config.enabled,
      suggestionCount: this.suggestionHistory.size,
      recentSuggestions,
    };
  }

  /**
   * Clear suggestion history
   */
  clearHistory(): void {
    this.suggestionHistory.clear();
  }
}

/**
 * Create a proactive suggestions manager
 */
export function createProactiveSuggestionsManager(
  config?: Partial<ProactiveSuggestionsConfig>,
  embeddingGenerator?: IEmbeddingGenerator
): ProactiveSuggestionsManager {
  return new ProactiveSuggestionsManager(config, embeddingGenerator);
}
