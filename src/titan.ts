/**
 * TitanMemory - Unified Cognitive Memory Manager
 * Orchestrates all 5 memory layers with intelligent routing
 */

import {
  MemoryEntry,
  MemoryLayer,
  QueryOptions,
  QueryResult,
  UnifiedQueryResult,
  MemoryStats,
  CompactionContext,
} from './types.js';
import {
  BaseMemoryLayer,
  FactualMemoryLayer,
  LongTermMemoryLayer,
  SemanticMemoryLayer,
  EpisodicMemoryLayer,
} from './layers/index.js';
import { loadConfig, ensureDirectories } from './utils/config.js';
import { scoreImportance, calculatePatternBoost } from './utils/surprise.js';

/**
 * Gating decisions for intelligent routing
 */
interface GatingDecision {
  layers: MemoryLayer[];
  priority: MemoryLayer;
  reason: string;
}

export class TitanMemory {
  private factualLayer: FactualMemoryLayer;
  private longTermLayer: LongTermMemoryLayer;
  private semanticLayer: SemanticMemoryLayer;
  private episodicLayer: EpisodicMemoryLayer;
  private layers: Map<MemoryLayer, BaseMemoryLayer>;
  private initialized: boolean = false;

  constructor(configPath?: string) {
    loadConfig(configPath);
    ensureDirectories();

    this.factualLayer = new FactualMemoryLayer();
    this.longTermLayer = new LongTermMemoryLayer();
    this.semanticLayer = new SemanticMemoryLayer();
    this.episodicLayer = new EpisodicMemoryLayer();

    this.layers = new Map<MemoryLayer, BaseMemoryLayer>([
      [MemoryLayer.FACTUAL, this.factualLayer as BaseMemoryLayer],
      [MemoryLayer.LONG_TERM, this.longTermLayer as BaseMemoryLayer],
      [MemoryLayer.SEMANTIC, this.semanticLayer as BaseMemoryLayer],
      [MemoryLayer.EPISODIC, this.episodicLayer as BaseMemoryLayer],
    ]);
  }

  /**
   * Initialize all memory layers
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await Promise.all([
      this.factualLayer.initialize(),
      this.longTermLayer.initialize(),
      this.semanticLayer.initialize(),
      this.episodicLayer.initialize(),
    ]);

    this.initialized = true;
  }

  /**
   * Intelligent routing - decide which layers to use
   */
  private gateQuery(content: string): GatingDecision {
    const lower = content.toLowerCase();
    const layers: MemoryLayer[] = [];
    let priority = MemoryLayer.LONG_TERM;
    let reason = 'Default semantic search';

    // Check for factual lookup patterns (definitions, constants, etc.)
    if (/\b(?:what is|define|definition of|meaning of)\b/.test(lower)) {
      layers.push(MemoryLayer.FACTUAL);
      priority = MemoryLayer.FACTUAL;
      reason = 'Factual lookup query';
    }

    // Check for reasoning/pattern queries
    if (/\b(?:how to|why|because|pattern|approach|strategy)\b/.test(lower)) {
      layers.push(MemoryLayer.SEMANTIC);
      priority = MemoryLayer.SEMANTIC;
      reason = 'Reasoning/pattern query';
    }

    // Check for temporal queries
    if (/\b(?:yesterday|today|last week|when did|history of)\b/.test(lower)) {
      layers.push(MemoryLayer.EPISODIC);
      priority = MemoryLayer.EPISODIC;
      reason = 'Temporal/episodic query';
    }

    // Check for personal/preference queries
    if (/\b(?:i prefer|my|user wants|style|preference)\b/.test(lower)) {
      layers.push(MemoryLayer.EPISODIC);
      layers.push(MemoryLayer.SEMANTIC);
      priority = MemoryLayer.EPISODIC;
      reason = 'Preference query';
    }

    // Always include long-term for semantic search fallback
    if (!layers.includes(MemoryLayer.LONG_TERM)) {
      layers.push(MemoryLayer.LONG_TERM);
    }

    // Default to all layers if nothing specific matched
    if (layers.length === 1) {
      layers.push(MemoryLayer.FACTUAL, MemoryLayer.SEMANTIC, MemoryLayer.EPISODIC);
      reason = 'Broad search across all layers';
    }

    return { layers, priority, reason };
  }

  /**
   * Intelligent routing - decide which layer to store in
   */
  private gateStore(content: string): GatingDecision {
    const importance = scoreImportance(content);
    const patternBoost = calculatePatternBoost(content);
    const lower = content.toLowerCase();

    // High importance + patterns = semantic layer
    if (importance > 0.7 || patternBoost > 0.3) {
      return {
        layers: [MemoryLayer.SEMANTIC, MemoryLayer.LONG_TERM],
        priority: MemoryLayer.SEMANTIC,
        reason: 'High-value pattern detected',
      };
    }

    // Factual definitions
    if (/\b(?:is defined as|means|refers to|is a|is the)\b/.test(lower)) {
      return {
        layers: [MemoryLayer.FACTUAL],
        priority: MemoryLayer.FACTUAL,
        reason: 'Factual definition',
      };
    }

    // Episode/event markers
    if (/\b(?:happened|occurred|did|completed|started|finished)\b/.test(lower)) {
      return {
        layers: [MemoryLayer.EPISODIC],
        priority: MemoryLayer.EPISODIC,
        reason: 'Event/episode',
      };
    }

    // Default to long-term with surprise filtering
    return {
      layers: [MemoryLayer.LONG_TERM],
      priority: MemoryLayer.LONG_TERM,
      reason: 'Default storage with surprise filtering',
    };
  }

  /**
   * Add a memory (with intelligent routing)
   */
  async add(
    content: string,
    metadata?: Partial<MemoryEntry['metadata']>
  ): Promise<MemoryEntry> {
    if (!this.initialized) await this.initialize();

    const decision = this.gateStore(content);
    const entry = {
      content,
      timestamp: new Date(),
      metadata: { ...metadata, routingReason: decision.reason },
    };

    // Store in primary layer
    const layer = this.layers.get(decision.priority)!;
    const result = await layer.store(entry);

    // Optionally store in secondary layers
    for (const layerId of decision.layers) {
      if (layerId !== decision.priority) {
        try {
          await this.layers.get(layerId)!.store(entry);
        } catch {
          // Secondary storage failures are acceptable
        }
      }
    }

    return result;
  }

  /**
   * Store directly to a specific layer (bypass routing)
   */
  async addToLayer(
    layer: MemoryLayer,
    content: string,
    metadata?: Partial<MemoryEntry['metadata']>
  ): Promise<MemoryEntry> {
    if (!this.initialized) await this.initialize();

    const targetLayer = this.layers.get(layer);
    if (!targetLayer) {
      throw new Error(`Invalid layer: ${layer}`);
    }

    return targetLayer.store({
      content,
      timestamp: new Date(),
      metadata: metadata || {},
    });
  }

  /**
   * Query memories (with intelligent routing and fusion)
   */
  async recall(query: string, options?: QueryOptions): Promise<UnifiedQueryResult> {
    if (!this.initialized) await this.initialize();

    const startTime = performance.now();
    const decision = this.gateQuery(query);
    const targetLayers = options?.layers || decision.layers;
    const limit = options?.limit || 10;

    // Query all target layers in parallel
    const queryPromises = targetLayers.map(layerId => {
      const layer = this.layers.get(layerId);
      if (!layer) return Promise.resolve(null);
      return layer.query(query, { ...options, limit: limit * 2 }); // Get extra for fusion
    });

    const results = (await Promise.all(queryPromises)).filter(
      (r): r is QueryResult => r !== null
    );

    // Fuse results with priority weighting
    const fusedMemories = this.fuseResults(results, decision.priority, limit);

    const totalQueryTimeMs = performance.now() - startTime;

    return {
      results,
      fusedMemories,
      totalQueryTimeMs,
    };
  }

  /**
   * Fuse results from multiple layers with intelligent ranking
   */
  private fuseResults(
    results: QueryResult[],
    priorityLayer: MemoryLayer,
    limit: number
  ): MemoryEntry[] {
    const allMemories: Array<{ memory: MemoryEntry; score: number }> = [];

    for (const result of results) {
      const layerWeight = result.layer === priorityLayer ? 1.5 : 1.0;
      const positionDecay = 0.9; // Earlier results get higher scores

      result.memories.forEach((memory, idx) => {
        const positionScore = Math.pow(positionDecay, idx);
        const score = layerWeight * positionScore;
        allMemories.push({ memory, score });
      });
    }

    // Sort by score and deduplicate by content similarity
    allMemories.sort((a, b) => b.score - a.score);

    const seen = new Set<string>();
    const fused: MemoryEntry[] = [];

    for (const { memory } of allMemories) {
      // Simple deduplication by content hash
      const contentKey = memory.content.substring(0, 100).toLowerCase();
      if (!seen.has(contentKey)) {
        seen.add(contentKey);
        fused.push(memory);
        if (fused.length >= limit) break;
      }
    }

    return fused;
  }

  /**
   * Get a specific memory by ID
   */
  async get(id: string): Promise<MemoryEntry | null> {
    if (!this.initialized) await this.initialize();

    // Search through all layers
    for (const layer of this.layers.values()) {
      const memory = await layer.get(id);
      if (memory) return memory;
    }

    return null;
  }

  /**
   * Delete a memory
   */
  async delete(id: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();

    for (const layer of this.layers.values()) {
      const deleted = await layer.delete(id);
      if (deleted) return true;
    }

    return false;
  }

  /**
   * Pre-compaction flush - save important context before compaction
   */
  async flushPreCompaction(context: CompactionContext): Promise<MemoryEntry[]> {
    if (!this.initialized) await this.initialize();

    // Use episodic layer's specialized flush
    return this.episodicLayer.flushPreCompaction(context);
  }

  /**
   * Add to curated MEMORY.md
   */
  async curate(content: string, section?: string): Promise<void> {
    if (!this.initialized) await this.initialize();

    await this.episodicLayer.addToCurated(content, section);
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<MemoryStats> {
    if (!this.initialized) await this.initialize();

    const [factualCount, longTermCount, semanticCount, episodicCount] =
      await Promise.all([
        this.factualLayer.count(),
        this.longTermLayer.count(),
        this.semanticLayer.count(),
        this.episodicLayer.count(),
      ]);

    const totalMemories =
      factualCount + longTermCount + semanticCount + episodicCount;

    return {
      totalMemories,
      byLayer: {
        [MemoryLayer.WORKING]: 0, // Managed by LLM
        [MemoryLayer.FACTUAL]: factualCount,
        [MemoryLayer.LONG_TERM]: longTermCount,
        [MemoryLayer.SEMANTIC]: semanticCount,
        [MemoryLayer.EPISODIC]: episodicCount,
      },
      avgSurpriseScore: 0, // TODO: Calculate from long-term layer
      avgRetrievalTimeMs: 0, // TODO: Track over time
      oldestMemory: new Date(), // TODO: Track
      newestMemory: new Date(),
      projectCounts: {}, // TODO: Track by project
      storageBytes: 0, // TODO: Calculate
    };
  }

  /**
   * Prune old/decayed memories
   */
  async prune(options?: {
    decayThreshold?: number;
    maxAge?: number; // days
  }): Promise<{ pruned: number }> {
    if (!this.initialized) await this.initialize();

    let pruned = 0;

    // Prune long-term layer
    pruned += await this.longTermLayer.pruneDecayed(
      options?.decayThreshold || 0.05
    );

    return { pruned };
  }

  /**
   * Get today's episodic entries
   */
  async getToday(): Promise<MemoryEntry[]> {
    if (!this.initialized) await this.initialize();
    return this.episodicLayer.getToday();
  }

  /**
   * Generate daily summary
   */
  async summarizeDay(date?: string): Promise<string> {
    if (!this.initialized) await this.initialize();

    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.episodicLayer.generateDailySummary(targetDate);
  }

  /**
   * Get hash statistics (factual layer)
   */
  async getHashStats(): Promise<{
    totalHashes: number;
    avgEntriesPerHash: number;
    collisionRate: number;
  }> {
    if (!this.initialized) await this.initialize();
    return this.factualLayer.getHashStats();
  }

  /**
   * Get semantic pattern stats
   */
  async getPatternStats(): Promise<{
    byType: Record<string, number>;
    byFrequency: Record<string, number>;
  }> {
    if (!this.initialized) await this.initialize();

    const [typeStats, freqStats] = await Promise.all([
      this.semanticLayer.getTypeStats(),
      this.semanticLayer.getFrequencyStats(),
    ]);

    return {
      byType: typeStats,
      byFrequency: freqStats,
    };
  }

  /**
   * Get available episodic dates
   */
  async getAvailableDates(): Promise<string[]> {
    if (!this.initialized) await this.initialize();
    return this.episodicLayer.getAvailableDates();
  }

  /**
   * Get current momentum (from long-term layer)
   */
  getCurrentMomentum(): number {
    return this.longTermLayer.getCurrentMomentum();
  }

  /**
   * Export all memories
   */
  async export(): Promise<{
    version: string;
    exportedAt: Date;
    stats: MemoryStats;
    layers: Record<string, MemoryEntry[]>;
  }> {
    if (!this.initialized) await this.initialize();

    const stats = await this.getStats();
    const layers: Record<string, MemoryEntry[]> = {};

    // Export each layer
    for (const [layerId, layer] of this.layers) {
      const result = await layer.query('', { limit: 10000 });
      layers[MemoryLayer[layerId]] = result.memories;
    }

    return {
      version: '1.0.0',
      exportedAt: new Date(),
      stats,
      layers,
    };
  }

  /**
   * Close all layers
   */
  async close(): Promise<void> {
    await Promise.all([...this.layers.values()].map(l => l.close()));
    this.initialized = false;
  }
}

// Export singleton instance
let instance: TitanMemory | null = null;

export function getTitan(): TitanMemory {
  if (!instance) {
    instance = new TitanMemory();
  }
  return instance;
}

export async function initTitan(configPath?: string): Promise<TitanMemory> {
  instance = new TitanMemory(configPath);
  await instance.initialize();
  return instance;
}
