/**
 * TitanMemory - Unified Cognitive Memory Manager
 * Orchestrates all 5 memory layers with intelligent routing
 *
 * Phase 3: Integrates Knowledge Graph, Decision Traces, World Models,
 * Behavioral Validation, and Adaptive Memory systems.
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
import {
  loadConfig,
  ensureDirectories,
  ensureProjectDirectories,
  listProjects,
} from './utils/config.js';
import { scoreImportance, calculatePatternBoost } from './utils/surprise.js';

// Phase 3 imports
import { KnowledgeGraph, ExtractionResult, GraphQueryResult } from './graph/knowledge-graph.js';
import { DecisionTraceManager, DecisionTrace, DecisionQueryResult } from './trace/decision-trace.js';
import { WorldModel, MetaNode, WorldState, AggregationResult } from './world/world-model.js';
import { BehavioralValidator, ValidationReport, QualityScore } from './validation/behavioral-validator.js';
import { AdaptiveMemory, FusionResult } from './adaptive/adaptive-memory.js';
import { ContinualLearner } from './learning/continual-learner.js';

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

  // Project isolation
  private activeProjectId?: string;

  // Phase 3: Cognitive Enhancement Systems
  private knowledgeGraph: KnowledgeGraph;
  private decisionTracer: DecisionTraceManager;
  private worldModel: WorldModel;
  private validator: BehavioralValidator;
  private adaptiveMemory: AdaptiveMemory;
  private continualLearner: ContinualLearner;

  constructor(configPath?: string, projectId?: string) {
    loadConfig(configPath);
    ensureDirectories();

    // Set active project and ensure project directories exist
    this.activeProjectId = projectId;
    if (projectId) {
      ensureProjectDirectories(projectId);
    }

    // Create layers with project isolation
    this.factualLayer = new FactualMemoryLayer(projectId);
    this.longTermLayer = new LongTermMemoryLayer(projectId);
    this.semanticLayer = new SemanticMemoryLayer(projectId);
    this.episodicLayer = new EpisodicMemoryLayer(projectId);

    this.layers = new Map<MemoryLayer, BaseMemoryLayer>([
      [MemoryLayer.FACTUAL, this.factualLayer as BaseMemoryLayer],
      [MemoryLayer.LONG_TERM, this.longTermLayer as BaseMemoryLayer],
      [MemoryLayer.SEMANTIC, this.semanticLayer as BaseMemoryLayer],
      [MemoryLayer.EPISODIC, this.episodicLayer as BaseMemoryLayer],
    ]);

    // Phase 3: Initialize cognitive systems
    this.knowledgeGraph = new KnowledgeGraph();
    this.decisionTracer = new DecisionTraceManager();
    this.worldModel = new WorldModel();
    this.validator = new BehavioralValidator();
    this.adaptiveMemory = new AdaptiveMemory();
    this.continualLearner = new ContinualLearner();
  }

  /**
   * Get the current active project ID
   */
  getActiveProject(): string | undefined {
    return this.activeProjectId;
  }

  /**
   * Set the active project - recreates all layer instances with new project isolation
   * This is a heavy operation and should be called sparingly
   * @param projectId - The project ID to switch to, or undefined for default
   */
  async setActiveProject(projectId?: string): Promise<void> {
    // Skip if already on this project
    if (this.activeProjectId === projectId) {
      return;
    }

    // Close existing layers if initialized
    if (this.initialized) {
      await this.close();
    }

    // Update active project
    this.activeProjectId = projectId;

    // Ensure project directories exist
    if (projectId) {
      ensureProjectDirectories(projectId);
    }

    // Recreate all layers with new projectId
    this.factualLayer = new FactualMemoryLayer(projectId);
    this.longTermLayer = new LongTermMemoryLayer(projectId);
    this.semanticLayer = new SemanticMemoryLayer(projectId);
    this.episodicLayer = new EpisodicMemoryLayer(projectId);

    this.layers = new Map<MemoryLayer, BaseMemoryLayer>([
      [MemoryLayer.FACTUAL, this.factualLayer as BaseMemoryLayer],
      [MemoryLayer.LONG_TERM, this.longTermLayer as BaseMemoryLayer],
      [MemoryLayer.SEMANTIC, this.semanticLayer as BaseMemoryLayer],
      [MemoryLayer.EPISODIC, this.episodicLayer as BaseMemoryLayer],
    ]);

    // Mark as not initialized so next operation triggers initialization
    this.initialized = false;
  }

  /**
   * List all available projects
   */
  static listProjects(): string[] {
    return listProjects();
  }

  /**
   * Initialize all memory layers and Phase 3 systems
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await Promise.all([
      // Core layers
      this.factualLayer.initialize(),
      this.longTermLayer.initialize(),
      this.semanticLayer.initialize(),
      this.episodicLayer.initialize(),
      // Phase 3 systems
      this.knowledgeGraph.initialize(),
      this.decisionTracer.initialize(),
      this.worldModel.initialize(),
      this.validator.initialize(),
      this.adaptiveMemory.initialize(),
      this.continualLearner.initialize(),
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
   * Add a memory (with intelligent routing and Phase 3 processing)
   */
  async add(
    content: string,
    metadata?: Partial<MemoryEntry['metadata']>
  ): Promise<MemoryEntry> {
    // Input validation
    if (typeof content !== 'string') {
      throw new Error('Content must be a string');
    }
    if (content.trim().length === 0) {
      throw new Error('Content cannot be empty');
    }
    if (content.length > 100000) {
      throw new Error('Content exceeds maximum length of 100,000 characters');
    }
    if (metadata !== undefined && metadata !== null && typeof metadata !== 'object') {
      throw new Error('Metadata must be an object or undefined');
    }

    if (!this.initialized) await this.initialize();

    const decision = this.gateStore(content);

    // Phase 3: Get context inheritance from world model
    const activeContext = this.worldModel.getWorldState().activeContext;
    const inheritance = await this.worldModel.getContextInheritance(activeContext);
    const inheritedTags = inheritance?.inheritedTags || [];

    const entry = {
      content,
      timestamp: new Date(),
      metadata: {
        ...metadata,
        routingReason: decision.reason,
        tags: [...(metadata?.tags || []), ...inheritedTags],
      },
    };

    // Phase 3: Validate before storing
    const validation = await this.validator.validateBeforeStore(entry as MemoryEntry);
    if (!validation.valid) {
      console.warn('Memory validation issues:', validation.issues.map(i => i.description));
    }

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

    // Phase 3: Post-storage processing (async, non-blocking)
    this.processPostStore(result, content).catch(error => {
      console.error('Post-store processing failed:', {
        memoryId: result.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return result;
  }

  /**
   * Phase 3: Process after storage (entity extraction, context linking, continual learning)
   */
  private async processPostStore(memory: MemoryEntry, content: string): Promise<void> {
    try {
      // Extract entities and relationships
      await this.knowledgeGraph.extract(content, memory.id);

      // Extract decision traces if present
      await this.decisionTracer.extractFromContent(content, {
        projectId: memory.metadata?.projectId as string,
        sessionId: memory.metadata?.sessionId as string,
      });

      // Detect and link to relevant contexts
      const contexts = await this.worldModel.detectContext(content);
      for (const context of contexts.slice(0, 3)) {
        await this.worldModel.linkMemory(context.id, memory.id, memory.layer);
      }

      // Record memory activity
      await this.worldModel.recordMemoryActivity(memory.id);

      // Process for continual learning
      await this.continualLearner.processNewMemory(memory);

      // Check for catastrophic forgetting
      const forgettingRisk = await this.continualLearner.checkForgettingRisk();
      if (forgettingRisk.alert) {
        console.warn('Forgetting risk detected:', forgettingRisk.riskLevel, forgettingRisk.affectedPatterns.length, 'patterns affected');
      }
    } catch (error) {
      // Non-critical, log and continue
      console.warn('Post-store processing error:', error);
    }
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
   * Query memories (with intelligent routing, fusion, and Phase 3 enhancements)
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
    let fusedMemories = this.fuseResults(results, decision.priority, limit);

    // Phase 3: Prioritize using adaptive memory
    fusedMemories = await this.adaptiveMemory.prioritizeForRecall(
      fusedMemories,
      query,
      limit
    );

    // Phase 3: Record access for each returned memory
    for (const memory of fusedMemories) {
      await this.adaptiveMemory.recordAccess(memory.id, query);
    }

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
      // Use full content hash for deduplication to avoid collision on documents with same prefix
      const contentKey = this.hashContent(memory.content);
      if (!seen.has(contentKey)) {
        seen.add(contentKey);
        fused.push(memory);
        if (fused.length >= limit) break;
      }
    }

    return fused;
  }

  /**
   * Generate a hash for content deduplication
   * Uses a simple but effective string hashing algorithm
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Include length to further reduce collisions
    return `${hash.toString(36)}_${content.length}`;
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
   * Close all layers and Phase 3 systems
   */
  async close(): Promise<void> {
    await Promise.all([
      // Core layers
      ...[...this.layers.values()].map(l => l.close()),
      // Phase 3 systems
      this.knowledgeGraph.close(),
      this.decisionTracer.close(),
      this.worldModel.close(),
      this.validator.close(),
      this.adaptiveMemory.close(),
      this.continualLearner.close(),
    ]);
    this.initialized = false;
  }

  // ==================== Phase 3 API Methods ====================

  // --- Knowledge Graph ---

  /**
   * Extract entities and relationships from content
   */
  async extractGraph(content: string): Promise<ExtractionResult> {
    if (!this.initialized) await this.initialize();
    return this.knowledgeGraph.extract(content);
  }

  /**
   * Query the knowledge graph
   */
  async queryGraph(entityNames: string[], options?: {
    maxDepth?: number;
    minStrength?: number;
  }): Promise<GraphQueryResult> {
    if (!this.initialized) await this.initialize();
    return this.knowledgeGraph.query(entityNames, options);
  }

  /**
   * Get knowledge graph statistics
   */
  async getGraphStats(): Promise<{
    entityCount: number;
    relationshipCount: number;
    avgConnections: number;
  }> {
    if (!this.initialized) await this.initialize();
    return this.knowledgeGraph.getStats();
  }

  // --- Decision Traces ---

  /**
   * Create a decision trace
   */
  async traceDecision(params: {
    type: DecisionTrace['type'];
    summary: string;
    description: string;
    rationale: string;
    alternatives?: Array<{
      description: string;
      pros?: string[];
      cons?: string[];
    }>;
    confidence?: number;
    tags?: string[];
  }): Promise<DecisionTrace> {
    if (!this.initialized) await this.initialize();
    return this.decisionTracer.createDecision(params);
  }

  /**
   * Record outcome for a decision
   */
  async recordDecisionOutcome(decisionId: string, outcome: {
    status: 'success' | 'partial' | 'failure';
    description?: string;
    feedback?: string;
  }): Promise<DecisionTrace | null> {
    if (!this.initialized) await this.initialize();
    return this.decisionTracer.recordOutcome(decisionId, outcome);
  }

  /**
   * Query decisions
   */
  async queryDecisions(options?: {
    type?: DecisionTrace['type'];
    outcomeStatus?: 'pending' | 'success' | 'failure';
    limit?: number;
  }): Promise<DecisionQueryResult> {
    if (!this.initialized) await this.initialize();
    return this.decisionTracer.query(options);
  }

  /**
   * Find similar past decisions
   */
  async findSimilarDecisions(summary: string, limit?: number): Promise<DecisionTrace[]> {
    if (!this.initialized) await this.initialize();
    return this.decisionTracer.findSimilar(summary, { limit });
  }

  // --- World Model ---

  /**
   * Create a context (project, session, domain, etc.)
   */
  async createContext(params: {
    type: MetaNode['type'];
    name: string;
    description?: string;
    parentId?: string;
  }): Promise<MetaNode> {
    if (!this.initialized) await this.initialize();
    return this.worldModel.createNode(params);
  }

  /**
   * Get or create a context by name
   */
  async getOrCreateContext(
    type: MetaNode['type'],
    name: string
  ): Promise<MetaNode> {
    if (!this.initialized) await this.initialize();
    return this.worldModel.getOrCreate(type, name);
  }

  /**
   * Set active context for memory operations
   */
  async setActiveContext(contextIds: string[]): Promise<void> {
    if (!this.initialized) await this.initialize();
    await this.worldModel.setActiveContext(contextIds);
  }

  /**
   * Get current world state
   */
  getWorldState(): WorldState {
    return this.worldModel.getWorldState();
  }

  /**
   * Aggregate insights for a context
   */
  async aggregateContext(contextId: string): Promise<AggregationResult> {
    if (!this.initialized) await this.initialize();
    const memoryIds = await this.worldModel.getMemoriesForNode(contextId);
    const memories: MemoryEntry[] = [];

    for (const id of memoryIds) {
      const memory = await this.get(id);
      if (memory) memories.push(memory);
    }

    return this.worldModel.aggregate(contextId, memories);
  }

  // --- Behavioral Validation ---

  /**
   * Run full validation on all memories
   */
  async validate(): Promise<ValidationReport> {
    if (!this.initialized) await this.initialize();

    // Collect all memories
    const memories: MemoryEntry[] = [];
    for (const layer of this.layers.values()) {
      const result = await layer.query('', { limit: 1000 });
      memories.push(...result.memories);
    }

    return this.validator.runFullValidation(memories);
  }

  /**
   * Get quality score for a memory
   */
  getQualityScore(memory: MemoryEntry): QualityScore {
    return this.validator.calculateQualityScore(memory);
  }

  /**
   * Get open validation issues
   */
  async getValidationIssues(severity?: 'critical' | 'warning' | 'info'): Promise<{
    issues: Array<{
      id: string;
      type: string;
      severity: string;
      description: string;
    }>;
  }> {
    if (!this.initialized) await this.initialize();
    const issues = await this.validator.getOpenIssues(severity);
    return {
      issues: issues.map(i => ({
        id: i.id,
        type: i.type,
        severity: i.severity,
        description: i.description,
      })),
    };
  }

  // --- Adaptive Memory ---

  /**
   * Consolidate similar memories
   */
  async consolidate(): Promise<{
    consolidated: number;
    mergedIds: string[][];
  }> {
    if (!this.initialized) await this.initialize();

    // Get all memories
    const memories: MemoryEntry[] = [];
    for (const layer of this.layers.values()) {
      const result = await layer.query('', { limit: 500 });
      memories.push(...result.memories);
    }

    // Find consolidation candidates
    const candidates = await this.adaptiveMemory.findConsolidationCandidates(memories);
    const mergedIds: string[][] = [];

    // Consolidate top candidates
    for (const candidate of candidates.slice(0, 10)) {
      await this.adaptiveMemory.consolidate(candidate.memory1, candidate.memory2);
      mergedIds.push([candidate.memory1.id, candidate.memory2.id]);
    }

    return {
      consolidated: mergedIds.length,
      mergedIds,
    };
  }

  /**
   * Fuse memories into coherent response
   */
  async fuseMemories(
    memoryIds: string[],
    strategy?: 'merge' | 'summarize' | 'extract'
  ): Promise<FusionResult> {
    if (!this.initialized) await this.initialize();

    const memories: MemoryEntry[] = [];
    for (const id of memoryIds) {
      const memory = await this.get(id);
      if (memory) memories.push(memory);
    }

    return this.adaptiveMemory.fuse(memories, strategy);
  }

  /**
   * Cluster related memories
   */
  async clusterMemories(): Promise<{
    clusters: Array<{
      id: string;
      memoryCount: number;
      avgImportance: number;
      commonTags: string[];
    }>;
  }> {
    if (!this.initialized) await this.initialize();

    // Get all memories
    const memories: MemoryEntry[] = [];
    for (const layer of this.layers.values()) {
      const result = await layer.query('', { limit: 500 });
      memories.push(...result.memories);
    }

    const clusters = await this.adaptiveMemory.clusterMemories(memories);

    return {
      clusters: clusters.map(c => ({
        id: c.id,
        memoryCount: c.memoryIds.length,
        avgImportance: c.avgImportance,
        commonTags: c.commonTags,
      })),
    };
  }

  /**
   * Get adaptive memory statistics
   */
  async getAdaptiveStats(): Promise<{
    totalConsolidations: number;
    clusterCount: number;
    avgImportance: number;
  }> {
    if (!this.initialized) await this.initialize();
    return this.adaptiveMemory.getStats();
  }

  // --- Continual Learning ---

  /**
   * Get pattern lifecycle for a memory
   */
  async getPatternLifecycle(memoryId: string): Promise<import('./types.js').PatternLifecycle | undefined> {
    if (!this.initialized) await this.initialize();
    return this.continualLearner.findPatternByMemoryId(memoryId);
  }

  /**
   * Check for catastrophic forgetting risk
   */
  async checkForgettingRisk(): Promise<import('./types.js').ForgettingRisk> {
    if (!this.initialized) await this.initialize();
    return this.continualLearner.checkForgettingRisk();
  }

  /**
   * Execute scheduled rehearsals (spaced repetition)
   */
  async runRehearsalCycle(): Promise<Array<{ patternId: string; newInterval: number }>> {
    if (!this.initialized) await this.initialize();
    return this.continualLearner.executeRehearsals();
  }

  /**
   * Get pending rehearsals
   */
  async getPendingRehearsals(): Promise<import('./types.js').RehearsalEntry[]> {
    if (!this.initialized) await this.initialize();
    return this.continualLearner.getPendingRehearsals();
  }

  /**
   * Distill core insights from a pattern
   */
  async distillPattern(memoryId: string): Promise<string | undefined> {
    if (!this.initialized) await this.initialize();
    const pattern = this.continualLearner.findPatternByMemoryId(memoryId);
    if (!pattern) return undefined;
    return this.continualLearner.distillPattern(pattern);
  }

  /**
   * Get plasticity index for a pattern
   */
  getPlasticityIndex(patternId: string): number {
    return this.continualLearner.getPlasticityIndex(patternId);
  }

  /**
   * Get stability index for a pattern
   */
  getStabilityIndex(patternId: string): number {
    return this.continualLearner.getStabilityIndex(patternId);
  }

  /**
   * Get all patterns by lifecycle stage
   */
  async getPatternsByStage(stage: import('./types.js').PatternStage): Promise<import('./types.js').PatternLifecycle[]> {
    if (!this.initialized) await this.initialize();
    return this.continualLearner.getPatternsByStage(stage);
  }

  /**
   * Get learning statistics
   */
  async getLearningStats(): Promise<import('./types.js').LearningStats> {
    if (!this.initialized) await this.initialize();
    return this.continualLearner.getStats();
  }

  /**
   * Get forgetting alerts history
   */
  async getForgettingAlerts(): Promise<import('./types.js').ForgettingRisk[]> {
    if (!this.initialized) await this.initialize();
    return this.continualLearner.getForgettingAlerts();
  }

  /**
   * Update domain learning rate based on success/failure feedback
   */
  updateDomainLearningRate(domain: string, success: boolean): void {
    this.continualLearner.updateDomainLearningRate(domain, success);
  }

  // --- Combined Phase 3 Stats ---

  /**
   * Get comprehensive Phase 3 statistics
   */
  async getPhase3Stats(): Promise<{
    graph: Awaited<ReturnType<KnowledgeGraph['getStats']>>;
    decisions: Awaited<ReturnType<DecisionTraceManager['getStats']>>;
    world: Awaited<ReturnType<WorldModel['getStats']>>;
    validation: Awaited<ReturnType<BehavioralValidator['getStats']>>;
    adaptive: Awaited<ReturnType<AdaptiveMemory['getStats']>>;
    learning: Awaited<ReturnType<ContinualLearner['getStats']>>;
  }> {
    if (!this.initialized) await this.initialize();

    const [graph, decisions, world, validation, adaptive, learning] = await Promise.all([
      this.knowledgeGraph.getStats(),
      this.decisionTracer.getStats(),
      this.worldModel.getStats(),
      this.validator.getStats(),
      this.adaptiveMemory.getStats(),
      this.continualLearner.getStats(),
    ]);

    return { graph, decisions, world, validation, adaptive, learning };
  }
}

// Export singleton instance
let instance: TitanMemory | null = null;

export function getTitan(projectId?: string): TitanMemory {
  if (!instance) {
    instance = new TitanMemory(undefined, projectId);
  }
  return instance;
}

export async function initTitan(
  configPath?: string,
  projectId?: string
): Promise<TitanMemory> {
  instance = new TitanMemory(configPath, projectId);
  await instance.initialize();
  return instance;
}

/**
 * Get or create a TitanMemory instance for a specific project
 * Use this when you need multiple projects simultaneously
 */
export async function initTitanForProject(projectId: string): Promise<TitanMemory> {
  const titan = new TitanMemory(undefined, projectId);
  await titan.initialize();
  return titan;
}
