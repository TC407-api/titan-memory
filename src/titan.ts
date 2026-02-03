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
  MemorySummary,
  ProactiveSuggestion,
  PatternMatchResult,
  TransferablePattern,
  ContextCaptureResult,
  HighlightedMemory,
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
import {
  UtilitySignal,
  applyFeedback,
  getUtilityTracker,
  weightByUtility,
  shouldPruneByUtility,
} from './utils/utility.js';

// Phase 3 imports
import { KnowledgeGraph, ExtractionResult, GraphQueryResult } from './graph/knowledge-graph.js';
import { DecisionTraceManager, DecisionTrace, DecisionQueryResult } from './trace/decision-trace.js';
import { WorldModel, MetaNode, WorldState, AggregationResult } from './world/world-model.js';
import { BehavioralValidator, ValidationReport, QualityScore } from './validation/behavioral-validator.js';
import { AdaptiveMemory, FusionResult } from './adaptive/adaptive-memory.js';
import { ContinualLearner } from './learning/continual-learner.js';

// CatBrain imports
import { CatBrainPipeline } from './catbrain/pipeline.js';
import { CategorySummarizer } from './catbrain/summarizer.js';
import { IntentGuardrails } from './catbrain/guardrails.js';
import { DriftMonitor } from './catbrain/drift-monitor.js';
import { ProjectHooksManager } from './catbrain/project-hooks.js';
import type { MemoryCategory, CategoryClassification, SufficiencyResult } from './catbrain/types.js';
import { classifyContent } from './catbrain/classifier.js';
import { checkSufficiency, getRelevantCategories } from './catbrain/retrieval.js';

// MIRAS Enhancement imports
import { createEmbeddingGenerator, IEmbeddingGenerator } from './storage/index.js';
import { SemanticHighlighter, createSemanticHighlighter } from './utils/semantic-highlight.js';
import { createSurpriseCalculator, ISurpriseCalculator } from './utils/semantic-surprise.js';
import { DecayCalculator, createDecayCalculator } from './utils/decay-strategies.js';
import { ContextCaptureManager, createContextCaptureManager } from './utils/context-capture.js';
import { AutoConsolidationManager, createAutoConsolidationManager } from './adaptive/auto-consolidation.js';
import { ProactiveSuggestionsManager, createProactiveSuggestionsManager } from './mcp/proactive-suggestions.js';
import { CrossProjectLearningManager, createCrossProjectLearningManager } from './learning/cross-project.js';
import { PatternMatcher, createPatternMatcher } from './learning/pattern-matcher.js';

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

  // CatBrain Systems
  private catBrainPipeline?: CatBrainPipeline;
  private categorySummarizer?: CategorySummarizer;
  private intentGuardrails?: IntentGuardrails;
  private driftMonitor?: DriftMonitor;
  private projectHooks?: ProjectHooksManager;

  // MIRAS Enhancement Systems
  private embeddingGenerator?: IEmbeddingGenerator;
  private semanticHighlighter?: SemanticHighlighter;
  private surpriseCalculator?: ISurpriseCalculator;
  private decayCalculator?: DecayCalculator;
  private contextCaptureManager?: ContextCaptureManager;
  private autoConsolidationManager?: AutoConsolidationManager;
  private proactiveSuggestionsManager?: ProactiveSuggestionsManager;
  private crossProjectLearner?: CrossProjectLearningManager;
  private patternMatcher?: PatternMatcher;

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

    // MIRAS Enhancements: Initialize based on config
    this.initializeMirasEnhancements();

    // CatBrain: Initialize if enabled
    this.initializeCatBrain();
  }

  /**
   * Initialize MIRAS enhancement systems based on configuration
   */
  private initializeMirasEnhancements(): void {
    const config = loadConfig();

    // Feature 1: Embedding generator (with caching)
    if (config.embedding.provider !== 'hash') {
      try {
        this.embeddingGenerator = createEmbeddingGenerator(config.embedding);
      } catch (error) {
        console.warn('Failed to create embedding generator, falling back to hash:', error);
      }
    }

    // Feature 1b: Semantic highlighting
    if (config.semanticHighlight.enabled) {
      this.semanticHighlighter = createSemanticHighlighter(
        config.semanticHighlight,
        this.embeddingGenerator
      );
    }

    // Feature 2: Semantic surprise calculator
    this.surpriseCalculator = createSurpriseCalculator(
      config.semanticSurprise,
      this.embeddingGenerator
    );

    // Feature 3: Data-dependent decay calculator
    this.decayCalculator = createDecayCalculator(config.dataDependentDecay);

    // Feature 4: Auto context capture
    if (config.contextCapture.enabled) {
      this.contextCaptureManager = createContextCaptureManager(config.contextCapture);
    }

    // Feature 5: Auto consolidation
    if (config.autoConsolidation.enabled) {
      this.autoConsolidationManager = createAutoConsolidationManager(config.autoConsolidation);
    }

    // Feature 6: Proactive suggestions
    if (config.proactiveSuggestions.enabled) {
      this.proactiveSuggestionsManager = createProactiveSuggestionsManager(
        config.proactiveSuggestions,
        this.embeddingGenerator
      );
    }

    // Feature 7: Cross-project learning
    if (config.crossProject.enabled) {
      this.crossProjectLearner = createCrossProjectLearningManager(config.crossProject);
      this.patternMatcher = createPatternMatcher(this.embeddingGenerator);
    }
  }

  /**
   * Initialize CatBrain systems based on configuration
   */
  private initializeCatBrain(): void {
    const config = loadConfig();
    const catBrainConfig = config.catBrain;

    if (!catBrainConfig?.enabled) return;

    try {
      // Core pipeline (uses existing semantic highlighter)
      this.catBrainPipeline = new CatBrainPipeline(
        catBrainConfig,
        this.semanticHighlighter
      );

      // Category summarizer
      this.categorySummarizer = new CategorySummarizer();

      // Intent guardrails
      if (catBrainConfig.enableGuardrails) {
        this.intentGuardrails = new IntentGuardrails(catBrainConfig);
      }

      // Drift monitor
      if (catBrainConfig.enableDriftMonitor) {
        this.driftMonitor = new DriftMonitor({
          enabled: true,
          alertThreshold: 0.7,
        });
      }

      // Project hooks
      if (catBrainConfig.enableProjectHooks) {
        this.projectHooks = new ProjectHooksManager({
          enabled: true,
        });
      }
    } catch (error) {
      console.warn('Failed to initialize CatBrain:', error);
      this.catBrainPipeline = undefined;
    }
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

    const initPromises = [
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
    ];

    // MIRAS: Add cross-project learner initialization
    if (this.crossProjectLearner) {
      initPromises.push(this.crossProjectLearner.initialize());
    }

    await Promise.all(initPromises);

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

    // CatBrain Hook 1: Classify content and enrich metadata
    let catBrainMeta: Record<string, unknown> = {};
    if (this.catBrainPipeline) {
      try {
        const pipelineResult = this.catBrainPipeline.processForStore(content);
        catBrainMeta = pipelineResult.enrichedMetadata;
      } catch (error) {
        // CatBrain failures are non-blocking
        console.warn('CatBrain classification failed:', error);
      }
    }

    // Phase 3: Get context inheritance from world model
    const activeContext = this.worldModel.getWorldState().activeContext;
    const inheritance = await this.worldModel.getContextInheritance(activeContext);
    const inheritedTags = inheritance?.inheritedTags || [];

    const entry = {
      content,
      timestamp: new Date(),
      metadata: {
        ...metadata,
        ...catBrainMeta,
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

      // CatBrain Hook 2: Update category summaries
      if (this.categorySummarizer && memory.metadata?.category) {
        try {
          this.categorySummarizer.updateSummary(
            memory.metadata.category as MemoryCategory,
            content
          );
        } catch {
          // Non-critical
        }
      }

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
   * FR-1: Results weighted by utility score
   * FR-2: Supports progressive disclosure modes (full/summary/metadata)
   */
  async recall(query: string, options?: QueryOptions): Promise<UnifiedQueryResult | { summaries: MemorySummary[]; totalQueryTimeMs: number }> {
    if (!this.initialized) await this.initialize();

    const startTime = performance.now();
    const decision = this.gateQuery(query);
    const targetLayers = options?.layers || decision.layers;
    const limit = options?.limit || 10;
    const mode = options?.mode || 'full';

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

    // FR-1: Apply utility weighting to results
    const baseScores = fusedMemories.map((_, idx) => 1.0 - (idx * 0.05)); // Position-based scores
    const weightedResults = weightByUtility(fusedMemories, baseScores);
    weightedResults.sort((a, b) => b.weightedScore - a.weightedScore);
    fusedMemories = weightedResults.map(w => w.memory).slice(0, limit);

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

    // CatBrain Hook 3: Enrich results with category info
    if (this.catBrainPipeline) {
      try {
        for (const memory of fusedMemories) {
          if (!memory.metadata.category) {
            const classification = classifyContent(memory.content);
            memory.metadata.category = classification.category;
            memory.metadata.categoryConfidence = classification.confidence;
          }
        }
      } catch {
        // Non-critical
      }
    }

    const totalQueryTimeMs = performance.now() - startTime;

    // FR-2: Progressive disclosure - return based on mode
    if (mode === 'metadata' || mode === 'summary') {
      const summaries: MemorySummary[] = fusedMemories.map((memory, idx) => ({
        id: memory.id,
        summary: mode === 'summary'
          ? memory.content.substring(0, 100) + (memory.content.length > 100 ? '...' : '')
          : '',
        tags: (memory.metadata.tags as string[]) || [],
        layer: memory.layer,
        relevanceScore: weightedResults[idx]?.weightedScore || 0,
        tokenEstimate: Math.ceil(memory.content.length / 4), // Rough token estimate
        timestamp: memory.timestamp,
        utilityScore: memory.metadata.utilityScore as number | undefined,
      }));

      return {
        summaries,
        totalQueryTimeMs,
      };
    }

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
   * Delete a memory from ALL layers (memories may exist in multiple layers)
   */
  async delete(id: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();

    let deletedFromAny = false;

    // Delete from ALL layers since memories can be stored in multiple layers
    for (const layer of this.layers.values()) {
      try {
        const deleted = await layer.delete(id);
        if (deleted) deletedFromAny = true;
      } catch (error) {
        // Log but continue - try to delete from all layers
        console.error(`Delete failed in layer: ${error}`);
      }
    }

    return deletedFromAny;
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

    const [factualCount, longTermCount, semanticCount, episodicCount, availableDates] =
      await Promise.all([
        this.factualLayer.count(),
        this.longTermLayer.count(),
        this.semanticLayer.count(),
        this.episodicLayer.count(),
        this.episodicLayer.getAvailableDates(),
      ]);

    const totalMemories =
      factualCount + longTermCount + semanticCount + episodicCount;

    // Dates are returned newest-first; last entry is oldest
    const oldestMemory = availableDates.length > 0
      ? new Date(availableDates[availableDates.length - 1])
      : new Date();
    const newestMemory = availableDates.length > 0
      ? new Date(availableDates[0])
      : new Date();

    const projectKey = this.activeProjectId || 'default';

    return {
      totalMemories,
      byLayer: {
        [MemoryLayer.WORKING]: 0, // Managed by LLM
        [MemoryLayer.FACTUAL]: factualCount,
        [MemoryLayer.LONG_TERM]: longTermCount,
        [MemoryLayer.SEMANTIC]: semanticCount,
        [MemoryLayer.EPISODIC]: episodicCount,
      },
      avgSurpriseScore: 0, // Requires O(n) scan across all memories
      avgRetrievalTimeMs: 0, // Requires query-time instrumentation
      oldestMemory,
      newestMemory,
      projectCounts: { [projectKey]: totalMemories },
      storageBytes: 0, // Requires storage-layer API
    };
  }

  /**
   * Prune old/decayed memories
   * FR-1: Also prunes memories with low utility scores
   */
  async prune(options?: {
    decayThreshold?: number;
    maxAge?: number; // days
    utilityThreshold?: number; // FR-1: Utility threshold for pruning
  }): Promise<{ pruned: number; prunedByDecay: number; prunedByUtility: number }> {
    if (!this.initialized) await this.initialize();

    let prunedByDecay = 0;
    let prunedByUtility = 0;

    // Prune long-term layer by decay
    prunedByDecay = await this.longTermLayer.pruneDecayed(
      options?.decayThreshold || 0.05
    );

    // FR-1: Prune by utility score
    if (options?.utilityThreshold !== undefined) {
      // Get all memories and check utility
      for (const layer of this.layers.values()) {
        const result = await layer.query('', { limit: 1000 });
        for (const memory of result.memories) {
          if (shouldPruneByUtility(memory.metadata, options.utilityThreshold)) {
            const deleted = await layer.delete(memory.id);
            if (deleted) prunedByUtility++;
          }
        }
      }
    }

    return {
      pruned: prunedByDecay + prunedByUtility,
      prunedByDecay,
      prunedByUtility,
    };
  }

  /**
   * FR-1: Record utility feedback for a memory
   * @param id - Memory ID
   * @param signal - 'helpful' or 'harmful'
   * @param sessionId - Optional session ID for idempotency
   * @param context - Optional context about why helpful/harmful
   */
  async recordFeedback(
    id: string,
    signal: UtilitySignal,
    sessionId?: string,
    context?: string
  ): Promise<{
    success: boolean;
    memoryId: string;
    signal: UtilitySignal;
    newUtilityScore?: number;
    message?: string;
  }> {
    if (!this.initialized) await this.initialize();

    // Find the memory
    const memory = await this.get(id);
    if (!memory) {
      return {
        success: false,
        memoryId: id,
        signal,
        message: `Memory not found: ${id}`,
      };
    }

    // Check for duplicate feedback in same session
    const tracker = getUtilityTracker();
    const recorded = tracker.recordFeedback(id, signal, sessionId, context);

    if (!recorded) {
      return {
        success: false,
        memoryId: id,
        signal,
        newUtilityScore: memory.metadata.utilityScore as number | undefined,
        message: 'Feedback already recorded in this session (idempotent)',
      };
    }

    // Apply the feedback to the memory metadata
    const updatedMetadata = applyFeedback(memory.metadata, signal);

    // Update the memory in its layer
    // We need to find which layer it's in and update it
    for (const [, layer] of this.layers) {
      const existingMemory = await layer.get(id);
      if (existingMemory) {
        // Update the memory with new metadata
        // First delete, then re-store with updated metadata
        await layer.delete(id);
        await layer.store({
          content: existingMemory.content,
          timestamp: existingMemory.timestamp,
          metadata: updatedMetadata,
        });
        break;
      }
    }

    return {
      success: true,
      memoryId: id,
      signal,
      newUtilityScore: updatedMetadata.utilityScore,
    };
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
   * Close all layers, Phase 3 systems, and MIRAS systems
   */
  async close(): Promise<void> {
    const closePromises: Promise<void>[] = [
      // Core layers
      ...[...this.layers.values()].map(l => l.close()),
      // Phase 3 systems
      this.knowledgeGraph.close(),
      this.decisionTracer.close(),
      this.worldModel.close(),
      this.validator.close(),
      this.adaptiveMemory.close(),
      this.continualLearner.close(),
    ];

    // MIRAS: Close cross-project learner (the only MIRAS system that needs explicit closing)
    if (this.crossProjectLearner) {
      closePromises.push(this.crossProjectLearner.close());
    }

    await Promise.all(closePromises);
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

  // ==================== MIRAS Enhancement API Methods ====================

  /**
   * Get proactive memory suggestions based on current context
   * Feature 6: Proactive Suggestions
   */
  async suggest(context: string, options?: {
    limit?: number;
    minRelevance?: number;
    includeHighlighting?: boolean;
  }): Promise<ProactiveSuggestion[]> {
    if (!this.initialized) await this.initialize();

    if (!this.proactiveSuggestionsManager) {
      return [];
    }

    // Get available memories for suggestions
    const memories: MemoryEntry[] = [];
    for (const layer of this.layers.values()) {
      const result = await layer.query('', { limit: 100 });
      memories.push(...result.memories);
    }

    return this.proactiveSuggestionsManager.suggest(context, memories, options);
  }

  /**
   * Highlight relevant portions of memories for a query
   * Feature 1b: Semantic Highlighting
   */
  async highlightMemories(
    query: string,
    memories: MemoryEntry[],
    threshold?: number
  ): Promise<HighlightedMemory[]> {
    if (!this.initialized) await this.initialize();

    if (!this.semanticHighlighter) {
      // Return memories without highlighting if not enabled
      return memories.map(m => ({
        ...m,
        highlightedContent: m.content,
        highlightMetadata: {
          compressionRate: 0,
          originalLength: m.content.length,
          highlightedLength: m.content.length,
        },
      }));
    }

    const results: HighlightedMemory[] = [];
    for (const memory of memories) {
      const highlighted = await this.semanticHighlighter.highlight(
        query,
        memory.content,
        threshold
      );
      const highlightedContent = highlighted.highlightedSentences.join(' ');
      results.push({
        ...memory,
        highlightedContent,
        highlightMetadata: {
          compressionRate: highlighted.compressionRate,
          originalLength: memory.content.length,
          highlightedLength: highlightedContent.length,
        },
      });
    }

    return results;
  }

  /**
   * Find relevant patterns from cross-project learning
   * Feature 7: Cross-Project Learning
   */
  async findRelevantPatterns(
    query: string,
    options?: {
      limit?: number;
      minRelevance?: number;
      domain?: string;
    }
  ): Promise<PatternMatchResult[]> {
    if (!this.initialized) await this.initialize();

    if (!this.crossProjectLearner || !this.patternMatcher) {
      return [];
    }

    const patterns = this.crossProjectLearner.getAllPatterns();
    return this.patternMatcher.match(query, patterns, {
      maxResults: options?.limit || 10,
      minRelevance: options?.minRelevance || 0.6,
      domains: options?.domain ? [options.domain] : undefined,
    });
  }

  /**
   * Extract transferable patterns from current project
   * Feature 7: Cross-Project Learning
   */
  async extractTransferablePatterns(): Promise<TransferablePattern[]> {
    if (!this.initialized) await this.initialize();

    if (!this.crossProjectLearner) {
      return [];
    }

    const projectId = this.activeProjectId || 'default';
    const stablePatterns = await this.continualLearner.getPatternsByStage('stable');
    const maturePatterns = await this.continualLearner.getPatternsByStage('mature');

    return this.crossProjectLearner.extractPatterns(
      projectId,
      [...stablePatterns, ...maturePatterns]
    );
  }

  /**
   * Record a pattern transfer for analytics
   * Feature 7: Cross-Project Learning
   */
  async recordPatternTransfer(patternId: string): Promise<boolean> {
    if (!this.crossProjectLearner) {
      return false;
    }

    const projectId = this.activeProjectId || 'default';
    return this.crossProjectLearner.recordTransfer(patternId, projectId);
  }

  /**
   * Capture context automatically based on momentum
   * Feature 4: Auto Context Capture
   */
  async captureContext(
    trigger: string,
    momentum?: number
  ): Promise<ContextCaptureResult | null> {
    if (!this.contextCaptureManager) {
      return null;
    }

    const currentMomentum = momentum ?? this.getCurrentMomentum();
    return this.contextCaptureManager.captureContext(trigger, currentMomentum);
  }

  /**
   * Update context buffer for auto-capture
   * Feature 4: Auto Context Capture
   */
  updateContextBuffer(content: string): void {
    if (this.contextCaptureManager) {
      this.contextCaptureManager.addToBuffer(content);
    }
  }

  /**
   * Get MIRAS enhancement statistics
   */
  async getMirasStats(): Promise<{
    embeddingEnabled: boolean;
    highlightingEnabled: boolean;
    surpriseAlgorithm: string;
    decayStrategy: string;
    contextCaptureEnabled: boolean;
    autoConsolidationEnabled: boolean;
    proactiveSuggestionsEnabled: boolean;
    crossProjectEnabled: boolean;
    autoConsolidationStats?: {
      pendingCandidates: number;
      totalConsolidations: number;
    };
    crossProjectStats?: {
      totalPatterns: number;
      totalTransfers: number;
      avgApplicability: number;
    };
  }> {
    const config = loadConfig();

    const result = {
      embeddingEnabled: config.embedding.provider !== 'hash',
      highlightingEnabled: config.semanticHighlight.enabled,
      surpriseAlgorithm: config.semanticSurprise.algorithm,
      decayStrategy: config.dataDependentDecay.strategy,
      contextCaptureEnabled: config.contextCapture.enabled,
      autoConsolidationEnabled: config.autoConsolidation.enabled,
      proactiveSuggestionsEnabled: config.proactiveSuggestions.enabled,
      crossProjectEnabled: config.crossProject.enabled,
      autoConsolidationStats: undefined as { pendingCandidates: number; totalConsolidations: number } | undefined,
      crossProjectStats: undefined as { totalPatterns: number; totalTransfers: number; avgApplicability: number } | undefined,
    };

    if (this.autoConsolidationManager) {
      const stats = this.autoConsolidationManager.getStats();
      result.autoConsolidationStats = {
        pendingCandidates: stats.pendingCount,
        totalConsolidations: stats.historyCount,
      };
    }

    if (this.crossProjectLearner) {
      const stats = this.crossProjectLearner.getStats();
      result.crossProjectStats = {
        totalPatterns: stats.totalPatterns,
        totalTransfers: stats.totalTransfers,
        avgApplicability: stats.avgApplicability,
      };
    }

    // Include CatBrain status
    (result as Record<string, unknown>).catBrain = this.getCatBrainStatus();

    return result;
  }

  // ==================== CatBrain API Methods ====================

  /**
   * Classify content into a memory category
   */
  classifyContent(content: string): CategoryClassification {
    return classifyContent(content);
  }

  /**
   * Get category summary for a specific category
   */
  getCategorySummary(category: MemoryCategory): { category: string; summary: string; entryCount: number; version: number } | null {
    if (!this.categorySummarizer) return null;
    const summary = this.categorySummarizer.getSummary(category);
    if (!summary) return null;
    return {
      category: summary.category,
      summary: summary.summary,
      entryCount: summary.entryCount,
      version: summary.version,
    };
  }

  /**
   * Check sufficiency of recall results across categories
   */
  checkCategorySufficiency(memories: MemoryEntry[], query: string): SufficiencyResult {
    const targetCategories = getRelevantCategories(query);
    return checkSufficiency(memories, targetCategories);
  }

  /**
   * Inspect a tool call via intent guardrails
   */
  inspectIntent(toolName: string, args: Record<string, unknown>): { action: string; reason: string; rule?: string } {
    if (!this.intentGuardrails) {
      return { action: 'allow', reason: 'Guardrails not enabled' };
    }
    return this.intentGuardrails.inspect(toolName, args);
  }

  /**
   * Record drift feedback for a categorized memory
   */
  recordDriftFeedback(memoryId: string, category: MemoryCategory, signal: 'helpful' | 'harmful'): void {
    if (this.driftMonitor) {
      this.driftMonitor.recordFeedback(memoryId, category, signal);
    }
  }

  /**
   * Get CatBrain status for MIRAS stats
   */
  getCatBrainStatus(): {
    enabled: boolean;
    pipelineActive: boolean;
    guardrailsEnabled: boolean;
    driftMonitorEnabled: boolean;
    projectHooksEnabled: boolean;
    categorySummaries: number;
  } {
    return {
      enabled: !!this.catBrainPipeline,
      pipelineActive: this.catBrainPipeline?.isEnabled() ?? false,
      guardrailsEnabled: this.intentGuardrails?.isEnabled() ?? false,
      driftMonitorEnabled: this.driftMonitor?.isEnabled() ?? false,
      projectHooksEnabled: this.projectHooks?.isEnabled() ?? false,
      categorySummaries: this.categorySummarizer?.getAllSummaries().length ?? 0,
    };
  }

  /**
   * Get the embedding generator (for advanced use cases)
   */
  getEmbeddingGenerator(): IEmbeddingGenerator | undefined {
    return this.embeddingGenerator;
  }

  /**
   * Calculate semantic surprise for content
   * Feature 2: Semantic Surprise
   */
  async calculateSurprise(
    content: string,
    recentMemories?: MemoryEntry[]
  ): Promise<{ score: number; shouldStore: boolean }> {
    if (!this.surpriseCalculator) {
      return { score: 0.5, shouldStore: true };
    }

    const memories = recentMemories || [];
    if (memories.length === 0) {
      // Get recent memories from long-term layer
      const result = await this.longTermLayer.query('', { limit: 50 });
      memories.push(...result.memories);
    }

    return this.surpriseCalculator.calculateSurprise(content, memories);
  }

  /**
   * Calculate decay score for a memory
   * Feature 3: Data-Dependent Decay
   */
  calculateDecay(memory: MemoryEntry): number {
    if (!this.decayCalculator) {
      // Simple time-based decay fallback
      const ageMs = Date.now() - new Date(memory.timestamp).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      return Math.pow(2, -ageDays / 180);
    }

    return this.decayCalculator.calculate(memory);
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
