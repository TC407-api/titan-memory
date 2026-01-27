/**
 * Auto-Consolidation System
 * Automatically detects and consolidates highly similar memories
 */

import { v4 as uuidv4 } from 'uuid';
import { AutoConsolidationConfig, ConsolidationCandidate, MemoryEntry } from '../types.js';
import { contentSimilarity } from '../utils/similarity.js';

const DEFAULT_CONFIG: Required<AutoConsolidationConfig> = {
  enabled: true,
  similarityThreshold: 0.9,
  cooldownMs: 60000,
  maxPendingCandidates: 100,
  autoMergeThreshold: 0.95,
};

/**
 * Consolidation result
 */
export interface ConsolidationResult {
  id: string;
  sourceIds: string[];
  mergedContent: string;
  summary: string;
  similarity: number;
  consolidatedAt: Date;
  autoMerged: boolean;
}

/**
 * Auto-Consolidation Manager
 * Detects similar memories and manages consolidation candidates
 */
export class AutoConsolidationManager {
  private config: Required<AutoConsolidationConfig>;
  private pendingCandidates: Map<string, ConsolidationCandidate> = new Map();
  private consolidationHistory: ConsolidationResult[] = [];
  private lastConsolidationTime: number = 0;
  private processedPairs: Set<string> = new Set();

  constructor(config?: Partial<AutoConsolidationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check a new memory against existing memories for consolidation
   */
  async checkForConsolidation(
    newMemory: MemoryEntry,
    recentMemories: MemoryEntry[]
  ): Promise<ConsolidationCandidate[]> {
    if (!this.config.enabled) return [];

    const newCandidates: ConsolidationCandidate[] = [];

    for (const existing of recentMemories) {
      // Skip self-comparison
      if (existing.id === newMemory.id) continue;

      // Skip already processed pairs
      const pairKey = this.createPairKey(newMemory.id, existing.id);
      if (this.processedPairs.has(pairKey)) continue;

      // Calculate similarity
      const similarity = contentSimilarity(newMemory.content, existing.content);

      if (similarity >= this.config.similarityThreshold) {
        const candidate: ConsolidationCandidate = {
          memory1Id: newMemory.id,
          memory2Id: existing.id,
          similarity,
          detectedAt: new Date(),
        };

        newCandidates.push(candidate);
        this.addCandidate(candidate);
        this.processedPairs.add(pairKey);
      }
    }

    return newCandidates;
  }

  /**
   * Add a consolidation candidate
   */
  private addCandidate(candidate: ConsolidationCandidate): void {
    const key = this.createPairKey(candidate.memory1Id, candidate.memory2Id);
    this.pendingCandidates.set(key, candidate);

    // Enforce max pending limit
    if (this.pendingCandidates.size > this.config.maxPendingCandidates) {
      // Remove oldest
      const firstKey = this.pendingCandidates.keys().next().value;
      if (firstKey) {
        this.pendingCandidates.delete(firstKey);
      }
    }
  }

  /**
   * Create a consistent pair key for two memory IDs
   */
  private createPairKey(id1: string, id2: string): string {
    return [id1, id2].sort().join(':');
  }

  /**
   * Check if auto-merge should be triggered
   */
  shouldAutoMerge(candidate: ConsolidationCandidate): boolean {
    return candidate.similarity >= this.config.autoMergeThreshold;
  }

  /**
   * Check if consolidation should be executed (respecting cooldown)
   */
  canExecuteConsolidation(): boolean {
    const now = Date.now();
    return (now - this.lastConsolidationTime) >= this.config.cooldownMs;
  }

  /**
   * Execute consolidation for a candidate pair
   */
  async executeConsolidation(
    memory1: MemoryEntry,
    memory2: MemoryEntry,
    similarity: number
  ): Promise<ConsolidationResult> {
    // Merge content (prefer longer/more detailed)
    const mergedContent = this.mergeContent(memory1.content, memory2.content);
    const summary = this.generateSummary(mergedContent);

    const result: ConsolidationResult = {
      id: uuidv4(),
      sourceIds: [memory1.id, memory2.id],
      mergedContent,
      summary,
      similarity,
      consolidatedAt: new Date(),
      autoMerged: similarity >= this.config.autoMergeThreshold,
    };

    // Update tracking
    this.consolidationHistory.push(result);
    this.lastConsolidationTime = Date.now();

    // Remove from pending
    const key = this.createPairKey(memory1.id, memory2.id);
    this.pendingCandidates.delete(key);

    // Keep history bounded
    if (this.consolidationHistory.length > 1000) {
      this.consolidationHistory = this.consolidationHistory.slice(-1000);
    }

    return result;
  }

  /**
   * Merge content from two memories
   */
  private mergeContent(content1: string, content2: string): string {
    // Split into sentences
    const sentences1 = content1.split(/[.!?]+/).filter(s => s.trim());
    const sentences2 = content2.split(/[.!?]+/).filter(s => s.trim());

    // Find unique sentences
    const merged = new Set<string>();
    const normalizedSentences = new Map<string, string>();

    // Add sentences from content1
    for (const sentence of sentences1) {
      const normalized = sentence.trim().toLowerCase();
      if (!normalizedSentences.has(normalized)) {
        normalizedSentences.set(normalized, sentence.trim());
        merged.add(sentence.trim());
      }
    }

    // Add unique sentences from content2
    for (const sentence of sentences2) {
      const normalized = sentence.trim().toLowerCase();
      if (!normalizedSentences.has(normalized)) {
        // Check for high similarity with existing
        let isDuplicate = false;
        for (const existing of merged) {
          if (contentSimilarity(sentence, existing) > 0.8) {
            isDuplicate = true;
            break;
          }
        }
        if (!isDuplicate) {
          normalizedSentences.set(normalized, sentence.trim());
          merged.add(sentence.trim());
        }
      }
    }

    return [...merged].join('. ') + '.';
  }

  /**
   * Generate summary from merged content
   */
  private generateSummary(content: string): string {
    const firstSentence = content.split(/[.!?]/)[0];
    if (firstSentence.length <= 100) {
      return firstSentence.trim();
    }
    return content.substring(0, 100).trim() + '...';
  }

  /**
   * Get pending candidates
   */
  getPendingCandidates(): ConsolidationCandidate[] {
    return [...this.pendingCandidates.values()];
  }

  /**
   * Get candidates ready for auto-merge
   */
  getAutoMergeCandidates(): ConsolidationCandidate[] {
    return [...this.pendingCandidates.values()]
      .filter(c => this.shouldAutoMerge(c));
  }

  /**
   * Get consolidation history
   */
  getHistory(): ConsolidationResult[] {
    return [...this.consolidationHistory];
  }

  /**
   * Get recent consolidations
   */
  getRecentConsolidations(windowMs: number = 3600000): ConsolidationResult[] {
    const now = Date.now();
    return this.consolidationHistory
      .filter(c => (now - c.consolidatedAt.getTime()) <= windowMs);
  }

  /**
   * Dismiss a candidate (remove from pending)
   */
  dismissCandidate(memory1Id: string, memory2Id: string): boolean {
    const key = this.createPairKey(memory1Id, memory2Id);
    return this.pendingCandidates.delete(key);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AutoConsolidationConfig>): void {
    this.config = { ...this.config, ...config };
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
    pendingCount: number;
    historyCount: number;
    autoMergeCount: number;
    cooldownRemaining: number;
  } {
    const now = Date.now();
    const cooldownRemaining = Math.max(0, this.config.cooldownMs - (now - this.lastConsolidationTime));
    const autoMergeCount = this.consolidationHistory.filter(c => c.autoMerged).length;

    return {
      enabled: this.config.enabled,
      pendingCount: this.pendingCandidates.size,
      historyCount: this.consolidationHistory.length,
      autoMergeCount,
      cooldownRemaining,
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.pendingCandidates.clear();
    this.consolidationHistory = [];
    this.processedPairs.clear();
    this.lastConsolidationTime = 0;
  }
}

/**
 * Create an auto-consolidation manager
 */
export function createAutoConsolidationManager(
  config?: Partial<AutoConsolidationConfig>
): AutoConsolidationManager {
  return new AutoConsolidationManager(config);
}

/**
 * Quick consolidation check (convenience function)
 */
export async function checkConsolidation(
  newMemory: MemoryEntry,
  recentMemories: MemoryEntry[],
  threshold: number = 0.9
): Promise<ConsolidationCandidate[]> {
  const manager = new AutoConsolidationManager({ similarityThreshold: threshold });
  return manager.checkForConsolidation(newMemory, recentMemories);
}
