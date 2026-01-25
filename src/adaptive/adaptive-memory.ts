/**
 * Adaptive Memory System
 *
 * Intelligent memory management with consolidation, prioritization,
 * and fusion. Inspired by Mem0's adaptive memory architecture.
 *
 * Key features:
 * - Memory consolidation (merge related memories)
 * - Dynamic importance scoring based on access patterns
 * - Memory fusion for combining related content
 * - Intelligent context windowing
 * - Auto-prioritization for recall
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../utils/config.js';
import { MemoryEntry, MemoryLayer } from '../types.js';

// Importance factors for scoring
export interface ImportanceFactors {
  recency: number;        // How recently accessed (0-1)
  frequency: number;      // How often accessed (0-1)
  relevance: number;      // Match to current context (0-1)
  connectivity: number;   // Links to other memories (0-1)
  surprise: number;       // Original surprise score (0-1)
}

// Consolidated memory result
export interface ConsolidatedMemory {
  id: string;
  sourceIds: string[];        // Original memory IDs
  consolidatedContent: string;
  summary: string;
  layer: MemoryLayer;
  importance: number;
  consolidatedAt: Date;
  metadata: Record<string, unknown>;
}

// Memory cluster (group of related memories)
export interface MemoryCluster {
  id: string;
  memoryIds: string[];
  centroidContent: string;   // Representative content
  avgImportance: number;
  commonTags: string[];
  timespan: { start: Date; end: Date };
  cohesion: number;          // How similar cluster members are (0-1)
}

// Context window state
export interface ContextWindow {
  activeMemories: string[];   // Currently active memory IDs
  maxSize: number;            // Max memories in window
  currentSize: number;
  priorityQueue: Array<{ memoryId: string; priority: number }>;
}

// Fusion result
export interface FusionResult {
  fusedContent: string;
  sourceIds: string[];
  confidence: number;
  strategy: 'merge' | 'summarize' | 'extract';
}

// Access event for tracking
interface AccessEvent {
  memoryId: string;
  timestamp: Date;
  context?: string;
}

// Adaptation stats
export interface AdaptationStats {
  totalConsolidations: number;
  totalFusions: number;
  avgImportance: number;
  memoryTurnover: number;     // How many memories aged out
  clusterCount: number;
}

export class AdaptiveMemory {
  private accessHistory: Map<string, AccessEvent[]> = new Map();
  private importanceCache: Map<string, number> = new Map();
  private clusters: Map<string, MemoryCluster> = new Map();
  private consolidations: Map<string, ConsolidatedMemory> = new Map();
  private contextWindow: ContextWindow;
  private dataPath: string;
  private initialized: boolean = false;

  // Configuration
  private config = {
    maxAccessHistoryPerMemory: 100,
    decayRate: 0.95,              // Daily decay multiplier
    frequencyWeight: 0.25,
    recencyWeight: 0.35,
    relevanceWeight: 0.20,
    connectivityWeight: 0.10,
    surpriseWeight: 0.10,
    consolidationThreshold: 0.85, // Similarity threshold for consolidation
    contextWindowSize: 50,
  };

  constructor() {
    const config = getConfig();
    this.dataPath = path.join(config.dataDir, 'adaptive', 'state.json');
    this.contextWindow = {
      activeMemories: [],
      maxSize: this.config.contextWindowSize,
      currentSize: 0,
      priorityQueue: [],
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.loadFromDisk();
    this.initialized = true;
  }

  private async loadFromDisk(): Promise<void> {
    if (fs.existsSync(this.dataPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));

        // Load access history
        for (const [memoryId, events] of Object.entries(data.accessHistory || {})) {
          this.accessHistory.set(
            memoryId,
            (events as AccessEvent[]).map(e => ({ ...e, timestamp: new Date(e.timestamp) }))
          );
        }

        // Load importance cache
        for (const [memoryId, importance] of Object.entries(data.importanceCache || {})) {
          this.importanceCache.set(memoryId, importance as number);
        }

        // Load clusters
        for (const cluster of data.clusters || []) {
          cluster.timespan.start = new Date(cluster.timespan.start);
          cluster.timespan.end = new Date(cluster.timespan.end);
          this.clusters.set(cluster.id, cluster);
        }

        // Load consolidations
        for (const consolidation of data.consolidations || []) {
          consolidation.consolidatedAt = new Date(consolidation.consolidatedAt);
          this.consolidations.set(consolidation.id, consolidation);
        }

        // Load context window
        if (data.contextWindow) {
          this.contextWindow = data.contextWindow;
        }
      } catch (error) {
        console.warn('Failed to load adaptive memory state:', error);
      }
    }
  }

  private async saveToDisk(): Promise<void> {
    const dir = path.dirname(this.dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = {
      version: '1.0',
      savedAt: new Date().toISOString(),
      accessHistory: Object.fromEntries(this.accessHistory),
      importanceCache: Object.fromEntries(this.importanceCache),
      clusters: [...this.clusters.values()],
      consolidations: [...this.consolidations.values()],
      contextWindow: this.contextWindow,
    };

    fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
  }

  // ==================== Access Tracking ====================

  /**
   * Record a memory access
   */
  async recordAccess(memoryId: string, context?: string): Promise<void> {
    const event: AccessEvent = {
      memoryId,
      timestamp: new Date(),
      context,
    };

    if (!this.accessHistory.has(memoryId)) {
      this.accessHistory.set(memoryId, []);
    }

    const history = this.accessHistory.get(memoryId)!;
    history.push(event);

    // Trim history if too long
    if (history.length > this.config.maxAccessHistoryPerMemory) {
      history.shift();
    }

    // Invalidate importance cache
    this.importanceCache.delete(memoryId);

    // Update context window
    await this.updateContextWindow(memoryId);
  }

  /**
   * Get access count for a memory
   */
  getAccessCount(memoryId: string): number {
    return this.accessHistory.get(memoryId)?.length || 0;
  }

  /**
   * Get last access time
   */
  getLastAccess(memoryId: string): Date | null {
    const history = this.accessHistory.get(memoryId);
    if (!history || history.length === 0) return null;
    return history[history.length - 1].timestamp;
  }

  // ==================== Importance Scoring ====================

  /**
   * Calculate dynamic importance score
   */
  calculateImportance(memory: MemoryEntry, currentContext?: string): number {
    // Check cache first
    const cacheKey = memory.id;
    if (this.importanceCache.has(cacheKey) && !currentContext) {
      return this.importanceCache.get(cacheKey)!;
    }

    const factors = this.calculateFactors(memory, currentContext);

    const importance = (
      factors.recency * this.config.recencyWeight +
      factors.frequency * this.config.frequencyWeight +
      factors.relevance * this.config.relevanceWeight +
      factors.connectivity * this.config.connectivityWeight +
      factors.surprise * this.config.surpriseWeight
    );

    // Cache result (without context-specific relevance)
    if (!currentContext) {
      this.importanceCache.set(cacheKey, importance);
    }

    return Math.max(0, Math.min(1, importance));
  }

  private calculateFactors(memory: MemoryEntry, currentContext?: string): ImportanceFactors {
    // Recency: exponential decay based on last access
    const lastAccess = this.getLastAccess(memory.id);
    let recency = 0.5;
    if (lastAccess) {
      const daysSinceAccess = (Date.now() - lastAccess.getTime()) / (1000 * 60 * 60 * 24);
      recency = Math.pow(this.config.decayRate, daysSinceAccess);
    }

    // Frequency: normalized access count
    const accessCount = this.getAccessCount(memory.id);
    const frequency = Math.min(1, Math.log10(accessCount + 1) / 2);

    // Relevance: based on current context similarity
    let relevance = 0.5;
    if (currentContext) {
      relevance = this.calculateContextRelevance(memory.content, currentContext);
    }

    // Connectivity: based on tags and metadata
    let connectivity = 0.3;
    if (memory.metadata?.tags) {
      const tagCount = (memory.metadata.tags as string[]).length;
      connectivity = Math.min(1, tagCount * 0.2);
    }
    if (memory.metadata?.projectId) {
      connectivity += 0.2;
    }

    // Surprise: from original storage
    const surprise = (memory.metadata?.surpriseScore as number) || 0.5;

    return { recency, frequency, relevance, connectivity, surprise };
  }

  private calculateContextRelevance(content: string, context: string): number {
    if (!content || !context) return 0;

    const contentTokens = new Set(content.toLowerCase().split(/\s+/));
    const contextTokens = new Set(context.toLowerCase().split(/\s+/));

    const intersection = [...contentTokens].filter(t => contextTokens.has(t)).length;
    const union = new Set([...contentTokens, ...contextTokens]).size;

    return union > 0 ? intersection / union : 0;
  }

  // ==================== Memory Consolidation ====================

  /**
   * Find memories that can be consolidated
   */
  async findConsolidationCandidates(memories: MemoryEntry[]): Promise<Array<{
    memory1: MemoryEntry;
    memory2: MemoryEntry;
    similarity: number;
  }>> {
    const candidates: Array<{ memory1: MemoryEntry; memory2: MemoryEntry; similarity: number }> = [];

    // Compare memories pairwise (limit for performance)
    const limit = Math.min(100, memories.length);
    for (let i = 0; i < limit - 1; i++) {
      for (let j = i + 1; j < limit; j++) {
        const similarity = this.calculateSimilarity(
          memories[i].content,
          memories[j].content
        );

        if (similarity >= this.config.consolidationThreshold) {
          candidates.push({
            memory1: memories[i],
            memory2: memories[j],
            similarity,
          });
        }
      }
    }

    return candidates.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Consolidate two memories into one
   */
  async consolidate(memory1: MemoryEntry, memory2: MemoryEntry): Promise<ConsolidatedMemory> {
    // Determine which memory is more important
    const importance1 = this.calculateImportance(memory1);
    const importance2 = this.calculateImportance(memory2);

    const primary = importance1 >= importance2 ? memory1 : memory2;
    const secondary = importance1 >= importance2 ? memory2 : memory1;

    // Merge content intelligently
    const consolidatedContent = this.mergeContent(primary.content, secondary.content);
    const summary = this.generateSummary(consolidatedContent);

    // Merge metadata
    const mergedTags = new Set<string>();
    if (primary.metadata?.tags) {
      for (const tag of primary.metadata.tags as string[]) {
        mergedTags.add(tag);
      }
    }
    if (secondary.metadata?.tags) {
      for (const tag of secondary.metadata.tags as string[]) {
        mergedTags.add(tag);
      }
    }

    const consolidated: ConsolidatedMemory = {
      id: uuidv4(),
      sourceIds: [primary.id, secondary.id],
      consolidatedContent,
      summary,
      layer: primary.layer,
      importance: Math.max(importance1, importance2),
      consolidatedAt: new Date(),
      metadata: {
        ...primary.metadata,
        ...secondary.metadata,
        tags: [...mergedTags],
        consolidatedFrom: [primary.id, secondary.id],
      },
    };

    this.consolidations.set(consolidated.id, consolidated);
    await this.saveToDisk();

    return consolidated;
  }

  private mergeContent(content1: string, content2: string): string {
    // Simple merge: combine unique sentences
    const sentences1 = content1.split(/[.!?]+/).filter(s => s.trim());
    const sentences2 = content2.split(/[.!?]+/).filter(s => s.trim());

    const merged = new Set<string>();
    for (const sentence of [...sentences1, ...sentences2]) {
      const normalized = sentence.trim().toLowerCase();
      let isDuplicate = false;

      for (const existing of merged) {
        if (this.calculateSimilarity(normalized, existing.toLowerCase()) > 0.8) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        merged.add(sentence.trim());
      }
    }

    return [...merged].join('. ') + '.';
  }

  private generateSummary(content: string): string {
    // Simple extraction: take first sentence or truncate
    const firstSentence = content.split(/[.!?]/)[0];
    if (firstSentence.length <= 100) {
      return firstSentence.trim();
    }
    return content.substring(0, 100).trim() + '...';
  }

  private calculateSimilarity(content1: string, content2: string): number {
    if (!content1 || !content2) return 0;

    const tokens1 = new Set(content1.toLowerCase().split(/\s+/));
    const tokens2 = new Set(content2.toLowerCase().split(/\s+/));

    const intersection = [...tokens1].filter(t => tokens2.has(t)).length;
    const union = new Set([...tokens1, ...tokens2]).size;

    return union > 0 ? intersection / union : 0;
  }

  // ==================== Memory Fusion ====================

  /**
   * Fuse multiple memories into a coherent response
   */
  async fuse(memories: MemoryEntry[], strategy: FusionResult['strategy'] = 'merge'): Promise<FusionResult> {
    if (memories.length === 0) {
      return {
        fusedContent: '',
        sourceIds: [],
        confidence: 0,
        strategy,
      };
    }

    if (memories.length === 1) {
      return {
        fusedContent: memories[0].content,
        sourceIds: [memories[0].id],
        confidence: 1,
        strategy,
      };
    }

    let fusedContent: string;
    let confidence: number;

    switch (strategy) {
      case 'merge':
        fusedContent = this.fuseByMerge(memories);
        confidence = this.calculateFusionConfidence(memories);
        break;

      case 'summarize':
        fusedContent = this.fuseBySummarize(memories);
        confidence = 0.8; // Summarization has some information loss
        break;

      case 'extract':
        fusedContent = this.fuseByExtract(memories);
        confidence = 0.9;
        break;

      default:
        fusedContent = this.fuseByMerge(memories);
        confidence = this.calculateFusionConfidence(memories);
    }

    return {
      fusedContent,
      sourceIds: memories.map(m => m.id),
      confidence,
      strategy,
    };
  }

  private fuseByMerge(memories: MemoryEntry[]): string {
    // Sort by importance
    const sorted = [...memories].sort((a, b) =>
      this.calculateImportance(b) - this.calculateImportance(a)
    );

    const parts: string[] = [];
    const seen = new Set<string>();

    for (const memory of sorted) {
      const sentences = memory.content.split(/[.!?]+/).filter(s => s.trim());
      for (const sentence of sentences) {
        const normalized = sentence.trim().toLowerCase();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          parts.push(sentence.trim());
        }
      }
    }

    return parts.join('. ') + (parts.length > 0 ? '.' : '');
  }

  private fuseBySummarize(memories: MemoryEntry[]): string {
    // Take key points from each memory
    const summaries: string[] = [];

    for (const memory of memories) {
      const summary = this.generateSummary(memory.content);
      if (summary && !summaries.includes(summary)) {
        summaries.push(summary);
      }
    }

    return summaries.join(' ');
  }

  private fuseByExtract(memories: MemoryEntry[]): string {
    // Extract most important memory's content
    const sorted = [...memories].sort((a, b) =>
      this.calculateImportance(b) - this.calculateImportance(a)
    );
    return sorted[0]?.content || '';
  }

  private calculateFusionConfidence(memories: MemoryEntry[]): number {
    if (memories.length === 0) return 0;

    // Higher confidence if memories are similar (coherent)
    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < memories.length - 1; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        totalSimilarity += this.calculateSimilarity(
          memories[i].content,
          memories[j].content
        );
        comparisons++;
      }
    }

    const avgSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 1;
    return Math.max(0.5, avgSimilarity);
  }

  // ==================== Context Window ====================

  /**
   * Update the context window with a new active memory
   */
  private async updateContextWindow(memoryId: string): Promise<void> {
    // Add to active memories
    if (!this.contextWindow.activeMemories.includes(memoryId)) {
      this.contextWindow.activeMemories.push(memoryId);
    }

    // Update priority queue (would need full memory objects for proper scoring)
    // For now, just use access count as priority
    const priority = this.getAccessCount(memoryId);
    const existing = this.contextWindow.priorityQueue.findIndex(p => p.memoryId === memoryId);

    if (existing >= 0) {
      this.contextWindow.priorityQueue[existing].priority = priority;
    } else {
      this.contextWindow.priorityQueue.push({ memoryId, priority });
    }

    // Sort by priority
    this.contextWindow.priorityQueue.sort((a, b) => b.priority - a.priority);

    // Trim if over max size
    if (this.contextWindow.activeMemories.length > this.contextWindow.maxSize) {
      // Remove lowest priority memories
      const toRemove = this.contextWindow.priorityQueue
        .slice(this.contextWindow.maxSize)
        .map(p => p.memoryId);

      this.contextWindow.activeMemories = this.contextWindow.activeMemories
        .filter(id => !toRemove.includes(id));
      this.contextWindow.priorityQueue = this.contextWindow.priorityQueue
        .slice(0, this.contextWindow.maxSize);
    }

    this.contextWindow.currentSize = this.contextWindow.activeMemories.length;
  }

  /**
   * Get current context window
   */
  getContextWindow(): ContextWindow {
    return { ...this.contextWindow };
  }

  /**
   * Clear context window (e.g., for new session)
   */
  async clearContextWindow(): Promise<void> {
    this.contextWindow = {
      activeMemories: [],
      maxSize: this.config.contextWindowSize,
      currentSize: 0,
      priorityQueue: [],
    };
    await this.saveToDisk();
  }

  // ==================== Clustering ====================

  /**
   * Cluster related memories
   */
  async clusterMemories(memories: MemoryEntry[]): Promise<MemoryCluster[]> {
    const clusters: MemoryCluster[] = [];
    const assigned = new Set<string>();

    // Simple greedy clustering
    for (const memory of memories) {
      if (assigned.has(memory.id)) continue;

      const clusterMembers = [memory];
      assigned.add(memory.id);

      // Find similar memories
      for (const other of memories) {
        if (assigned.has(other.id)) continue;

        const similarity = this.calculateSimilarity(memory.content, other.content);
        if (similarity > 0.5) {
          clusterMembers.push(other);
          assigned.add(other.id);
        }
      }

      // Only create cluster if multiple members
      if (clusterMembers.length > 1) {
        const cluster = this.createCluster(clusterMembers);
        clusters.push(cluster);
        this.clusters.set(cluster.id, cluster);
      }
    }

    await this.saveToDisk();
    return clusters;
  }

  private createCluster(memories: MemoryEntry[]): MemoryCluster {
    // Find centroid (most central memory)
    let maxCentrality = 0;
    let centroid = memories[0];

    for (const memory of memories) {
      let centralitySum = 0;
      for (const other of memories) {
        if (memory.id !== other.id) {
          centralitySum += this.calculateSimilarity(memory.content, other.content);
        }
      }
      if (centralitySum > maxCentrality) {
        maxCentrality = centralitySum;
        centroid = memory;
      }
    }

    // Calculate cohesion
    let totalSimilarity = 0;
    let comparisons = 0;
    for (let i = 0; i < memories.length - 1; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        totalSimilarity += this.calculateSimilarity(
          memories[i].content,
          memories[j].content
        );
        comparisons++;
      }
    }
    const cohesion = comparisons > 0 ? totalSimilarity / comparisons : 1;

    // Collect common tags
    const tagCounts = new Map<string, number>();
    for (const memory of memories) {
      if (memory.metadata?.tags) {
        for (const tag of memory.metadata.tags as string[]) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }
    }
    const commonTags = [...tagCounts.entries()]
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    // Calculate timespan
    const timestamps = memories.map(m => new Date(m.timestamp).getTime());

    return {
      id: uuidv4(),
      memoryIds: memories.map(m => m.id),
      centroidContent: centroid.content,
      avgImportance: memories.reduce((sum, m) => sum + this.calculateImportance(m), 0) / memories.length,
      commonTags,
      timespan: {
        start: new Date(Math.min(...timestamps)),
        end: new Date(Math.max(...timestamps)),
      },
      cohesion,
    };
  }

  // ==================== Prioritized Recall ====================

  /**
   * Get memories sorted by priority for recall
   */
  async prioritizeForRecall(
    memories: MemoryEntry[],
    context?: string,
    limit?: number
  ): Promise<MemoryEntry[]> {
    // Calculate importance for each memory
    const scored = memories.map(memory => ({
      memory,
      importance: this.calculateImportance(memory, context),
    }));

    // Sort by importance
    scored.sort((a, b) => b.importance - a.importance);

    // Apply limit
    const result = limit ? scored.slice(0, limit) : scored;

    return result.map(s => s.memory);
  }

  // ==================== Statistics ====================

  /**
   * Get adaptation statistics
   */
  async getStats(): Promise<AdaptationStats> {
    const allImportances = [...this.importanceCache.values()];
    const avgImportance = allImportances.length > 0
      ? allImportances.reduce((a, b) => a + b, 0) / allImportances.length
      : 0.5;

    return {
      totalConsolidations: this.consolidations.size,
      totalFusions: 0, // Would track in actual implementation
      avgImportance,
      memoryTurnover: 0, // Would track aged-out memories
      clusterCount: this.clusters.size,
    };
  }

  /**
   * Get consolidations
   */
  getConsolidations(): ConsolidatedMemory[] {
    return [...this.consolidations.values()];
  }

  /**
   * Get clusters
   */
  getClusters(): MemoryCluster[] {
    return [...this.clusters.values()];
  }

  async close(): Promise<void> {
    await this.saveToDisk();
    this.accessHistory.clear();
    this.importanceCache.clear();
    this.clusters.clear();
    this.consolidations.clear();
    this.initialized = false;
  }
}
