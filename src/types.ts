/**
 * Titan Memory Type Definitions
 * 5-Layer Cognitive Memory Architecture
 */

// Memory Layer Enum
export enum MemoryLayer {
  WORKING = 1,    // Transformer context (managed by LLM)
  FACTUAL = 2,    // O(1) hash lookup (Engram-inspired)
  LONG_TERM = 3,  // Surprise-based storage (Titans/MIRAS)
  SEMANTIC = 4,   // Continual learning patterns (Hope)
  EPISODIC = 5,   // Daily logs + curated (Clawdbot)
}

// Memory Entry Interface
export interface MemoryEntry {
  id: string;
  content: string;
  layer: MemoryLayer;
  timestamp: Date;
  metadata: MemoryMetadata;
}

export interface MemoryMetadata {
  // Allow any additional properties
  [key: string]: unknown;

  // Common fields
  source?: string;
  projectId?: string;
  sessionId?: string;
  tags?: string[];
  routingReason?: string;

  // CatBrain: Category classification
  category?: string;
  categoryConfidence?: number;
  entityStatus?: string;

  // FR-1: Utility Tracking (helpful/harmful)
  helpfulCount?: number;      // Incremented when memory aids task completion
  harmfulCount?: number;      // Incremented when memory causes confusion/error
  lastHelpful?: string;       // ISO timestamp
  lastHarmful?: string;       // ISO timestamp
  utilityScore?: number;      // Computed: helpful / (helpful + harmful)

  // Layer 2 (Factual) specific
  hashKey?: string;
  ngrams?: string[];

  // Layer 3 (Long-term) specific
  surpriseScore?: number;
  momentum?: number;
  decayFactor?: number;
  stored?: boolean;
  reason?: string;
  lastAccessed?: string;
  currentDecay?: number;
  effectiveScore?: number;

  // Layer 4 (Semantic) specific
  updateFrequency?: 'slow' | 'medium' | 'fast';
  updateCount?: number;
  lastUpdated?: string;
  reasoningChain?: string[];
  patternType?: string;
  importance?: number;

  // Layer 5 (Episodic) specific
  curated?: boolean;
  episodeDate?: string;
  contextBefore?: string;
  contextAfter?: string;
}

// Surprise Detection Result
export interface SurpriseResult {
  score: number;           // 0.0-1.0
  shouldStore: boolean;    // score > threshold
  noveltyScore: number;    // Inverse of max similarity
  patternBoost: number;    // Bonus for important patterns
  similarMemories: string[]; // IDs of similar existing memories
}

// FR-2: Recall Mode for Progressive Disclosure
export type RecallMode = 'full' | 'summary' | 'metadata';

// Query Options
export interface QueryOptions {
  layers?: MemoryLayer[];  // Which layers to query
  limit?: number;          // Max results
  threshold?: number;      // Similarity threshold
  projectId?: string;      // Filter by project
  dateRange?: {
    start: Date;
    end: Date;
  };
  tags?: string[];
  includeDecayed?: boolean; // Include memories below decay threshold
  mode?: RecallMode;       // FR-2: Progressive disclosure mode (default: 'full')
}

// FR-2: Memory Summary (for progressive disclosure modes)
export interface MemorySummary {
  id: string;
  summary: string;           // First 100 chars or generated summary
  tags: string[];
  layer: MemoryLayer;
  relevanceScore: number;
  tokenEstimate: number;     // Estimated tokens if loaded full
  timestamp: Date;
  utilityScore?: number;     // FR-1: Include utility for ranking
}

// Query Result
export interface QueryResult {
  memories: MemoryEntry[];
  layer: MemoryLayer;
  queryTimeMs: number;
  totalFound: number;
}

// Unified Query Result
export interface UnifiedQueryResult {
  results: QueryResult[];
  fusedMemories: MemoryEntry[];
  totalQueryTimeMs: number;
}

// Memory Stats
export interface MemoryStats {
  totalMemories: number;
  byLayer: Record<MemoryLayer, number>;
  avgSurpriseScore: number;
  avgRetrievalTimeMs: number;
  oldestMemory: Date;
  newestMemory: Date;
  projectCounts: Record<string, number>;
  storageBytes: number;
}

// Configuration
export interface TitanConfig {
  // Storage paths
  dataDir: string;
  episodicDir: string;
  factualDbPath: string;
  memoryMdPath: string;

  // Zilliz Cloud settings
  zillizUri: string;
  zillizToken: string;
  zillizCollectionName: string;

  // Thresholds
  surpriseThreshold: number;      // Default: 0.3
  decayHalfLife: number;          // Days, default: 180
  maxMemoriesPerLayer: number;    // Default: 10000

  // Performance
  hashTableSize: number;          // Default: 1000000
  batchSize: number;              // Default: 100
  maxConcurrentQueries: number;   // Default: 5

  // Features
  enablePreCompactionFlush: boolean;
  enableSurpriseFiltering: boolean;
  enableContinualLearning: boolean;
  offlineMode: boolean;

  // FR-3: Proactive Context Flush
  contextFlushThreshold: number;  // Default: 0.5 (50%)
  enableProactiveFlush: boolean;  // Default: true

  // CatBrain Configuration
  catBrain: {
    enabled: boolean;
    retrieveCount: number;
    highlightThreshold: number;
    classifierConfidenceThreshold: number;
    enableGuardrails: boolean;
    enableDriftMonitor: boolean;
    enableProjectHooks: boolean;
    bedrockRulesPath: string;
  };

  // MIRAS Enhancement Configurations
  embedding: EmbeddingConfig;
  semanticHighlight: SemanticHighlightConfig;
  semanticSurprise: SemanticSurpriseConfig;
  dataDependentDecay: DataDependentDecayConfig;
  contextCapture: ContextCaptureConfig;
  autoConsolidation: AutoConsolidationConfig;
  proactiveSuggestions: ProactiveSuggestionsConfig;
  crossProject: CrossProjectConfig;
  hybridSearch: HybridSearchConfig;
}

// Pre-compaction context
export interface CompactionContext {
  sessionId: string;
  timestamp?: Date;
  tokenCount?: number;
  importantInsights?: string[];
  insights?: string[];           // Alias for importantInsights
  decisions?: string[];
  errors?: string[];
  solutions?: string[];
  // FR-3: Proactive flush metadata
  metadata?: {
    reason?: 'proactive_context_management' | 'emergency' | 'manual';
    contextRatio?: number;
    triggerThreshold?: number;
    timestamp?: string;
    debounced?: boolean;
    [key: string]: unknown;
  };
}

// Pattern Types for Surprise Detection
export const IMPORTANT_PATTERNS = {
  DECISION: /(?:decided|decision|chose|choosing|went with|picked)/i,
  ERROR: /(?:error|bug|issue|problem|failed|failure|exception)/i,
  SOLUTION: /(?:fixed|solved|resolved|solution|workaround|fix was)/i,
  LEARNING: /(?:learned|discovered|realized|insight|understood)/i,
  ARCHITECTURE: /(?:architecture|design|pattern|structure|approach)/i,
  PREFERENCE: /(?:prefer|like|dislike|want|need|should)/i,
} as const;

// Hook Event Types
export type HookEvent =
  | 'pre_compaction'
  | 'post_response'
  | 'user_prompt_submit'
  | 'session_start'
  | 'session_end';

export interface HookPayload {
  event: HookEvent;
  timestamp: Date;
  sessionId: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

// Export/Import Format
export interface ExportFormat {
  version: string;
  exportedAt: Date;
  stats: MemoryStats;
  memories: MemoryEntry[];
}

// ==================== Continual Learning Types ====================

/**
 * Pattern lifecycle stages (Hope/Nested Learning inspired)
 * Patterns progress through stages as they mature
 */
export type PatternStage = 'immature' | 'developing' | 'mature' | 'stable' | 'archived';

/**
 * Update record for tracking pattern changes
 */
export interface UpdateRecord {
  timestamp: Date;
  changeType: 'create' | 'update' | 'reinforce' | 'decay' | 'distill';
  previousContent?: string;
  newContent: string;
  divergenceScore?: number;
}

/**
 * Pattern lifecycle tracking
 * Tracks maturity, plasticity, and stability of learned patterns
 */
export interface PatternLifecycle {
  id: string;
  memoryId: string;
  stage: PatternStage;
  createdAt: Date;
  maturityScore: number;        // 0-1, based on age + access + consistency
  plasticityIndex: number;      // How easily this pattern can change
  stabilityIndex: number;       // How resistant to forgetting
  updateHistory: UpdateRecord[];
  distilledContent?: string;    // Core insights extracted
  lastRehearsed?: Date;         // For spaced repetition
  rehearsalCount: number;
  snapshotContent: string;      // For catastrophic forgetting detection
  snapshotDate: Date;
  domain?: string;              // Domain for adaptive learning rates
}

/**
 * Forgetting risk assessment
 */
export interface ForgettingRisk {
  alert: boolean;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  affectedPatterns: Array<{
    patternId: string;
    divergence: number;
    description: string;
  }>;
  timestamp: Date;
}

/**
 * Rehearsal schedule entry
 */
export interface RehearsalEntry {
  patternId: string;
  scheduledFor: Date;
  interval: number;             // Current interval in days
  easeFactor: number;           // SM-2 ease factor
  lastReview?: Date;
  reviewCount: number;
}

/**
 * Learning statistics
 */
export interface LearningStats {
  totalPatterns: number;
  byStage: Record<PatternStage, number>;
  avgPlasticity: number;
  avgStability: number;
  forgettingAlerts: number;
  rehearsalsPending: number;
  distillationsPerformed: number;
  crossTransfers: number;
}

/**
 * Continual learner configuration
 */
export interface ContinualLearnerConfig {
  plasticityDecay: number;           // How fast patterns become less plastic (default: 0.05/day)
  stabilityThreshold: number;        // When to protect from updates (default: 0.8)
  forgettingAlertThreshold: number;  // Divergence to trigger alert (default: 0.4)
  rehearsalIntervals: number[];      // Spaced repetition schedule in days (default: [1, 3, 7, 14, 30, 90])
  distillationThreshold: number;     // Update count to trigger distillation (default: 10)
  snapshotInterval: number;          // Days between snapshots (default: 7)
  maturityAgeDays: number;           // Days to reach maturity (default: 30)
  stableAgeDays: number;             // Days to reach stability (default: 90)
  enableCrossTransfer: boolean;      // Enable cross-pattern learning (default: true)
}

// ==================== MIRAS Enhancement Types ====================

/**
 * Content types for data-dependent decay
 */
export type ContentType = 'decision' | 'error' | 'solution' | 'architecture' | 'learning' | 'preference' | 'general';

/**
 * Embedding provider options
 */
export type EmbeddingProvider = 'voyage' | 'local' | 'hash';

/**
 * Surprise algorithm options
 */
export type SurpriseAlgorithm = 'lsh' | 'semantic';

/**
 * Decay strategy options
 */
export type DecayStrategy = 'time-only' | 'data-dependent';

/**
 * Semantic highlight result
 */
export interface HighlightResult {
  highlightedSentences: string[];
  compressionRate: number;
  sentenceProbabilities: number[];
  originalSentenceCount: number;
  highlightedSentenceCount: number;
}

/**
 * Highlighted memory entry (extended with highlighting info)
 */
export interface HighlightedMemory extends MemoryEntry {
  highlightedContent?: string;
  highlightMetadata?: {
    compressionRate: number;
    originalLength: number;
    highlightedLength: number;
  };
}

/**
 * Context capture result
 */
export interface ContextCaptureResult {
  capturedBefore: string[];
  trigger: string;
  momentumPeak: number;
  timestamp: Date;
  linkedMemoryIds: string[];
}

/**
 * Proactive suggestion
 */
export interface ProactiveSuggestion {
  memoryId: string;
  content: string;
  highlightedContent?: string;
  relevanceScore: number;
  utilityScore: number;
  reason: string;
  tags: string[];
}

/**
 * Consolidation candidate
 */
export interface ConsolidationCandidate {
  memory1Id: string;
  memory2Id: string;
  similarity: number;
  detectedAt: Date;
}

/**
 * Cross-project pattern
 */
export interface TransferablePattern {
  patternId: string;
  sourceProject: string;
  content: string;
  distilledContent?: string;
  applicability: number;
  domain: string;
  stage: PatternStage;
  transferCount: number;
}

/**
 * Pattern match result for cross-project learning
 */
export interface PatternMatchResult {
  pattern: TransferablePattern;
  relevance: number;
  matchedTerms: string[];
}

// ==================== MIRAS Configuration Interfaces ====================

/**
 * Embedding configuration
 */
export interface EmbeddingConfig {
  provider: EmbeddingProvider;           // default: 'hash'
  model?: string;                        // default: 'voyage-4-lite' for voyage (best quality/cost)
  apiKey?: string;                       // or VOYAGE_API_KEY env
  dimension?: number;                    // default: 1024 (voyage-4 series)
  cacheSize?: number;                    // default: 10000
  batchSize?: number;                    // default: 32
  timeout?: number;                      // default: 30000ms
}

/**
 * Semantic highlighting configuration
 */
export interface SemanticHighlightConfig {
  enabled: boolean;                      // default: false
  threshold: number;                     // default: 0.5
  model?: string;                        // default: 'zilliz/semantic-highlight-bilingual-v1'
  highlightOnRecall: boolean;            // default: true (auto-highlight in recall)
  maxSentences?: number;                 // default: unlimited
}

/**
 * Semantic surprise configuration
 */
export interface SemanticSurpriseConfig {
  algorithm: SurpriseAlgorithm;          // default: 'lsh'
  similarityThreshold: number;           // default: 0.7
  comparisionLimit?: number;             // default: 50 (max memories to compare)
}

/**
 * Data-dependent decay configuration
 */
export interface DataDependentDecayConfig {
  strategy: DecayStrategy;               // default: 'time-only'
  halfLifeOverrides?: Partial<Record<ContentType, number>>;
  utilityWeight?: number;                // default: 1.0 (multiplier for utility impact)
  accessWeight?: number;                 // default: 1.0 (multiplier for access impact)
}

/**
 * Auto context capture configuration
 */
export interface ContextCaptureConfig {
  enabled: boolean;                      // default: false
  momentumThreshold: number;             // default: 0.7
  bufferSize: number;                    // default: 10
  captureWindowMs: number;               // default: 60000 (1 minute)
  linkToMemories: boolean;               // default: true
}

/**
 * Auto consolidation configuration
 */
export interface AutoConsolidationConfig {
  enabled: boolean;                      // default: false
  similarityThreshold: number;           // default: 0.9
  cooldownMs: number;                    // default: 60000
  maxPendingCandidates: number;          // default: 100
  autoMergeThreshold: number;            // default: 0.95 (auto-merge without review)
}

/**
 * Proactive suggestions configuration
 */
export interface ProactiveSuggestionsConfig {
  enabled: boolean;                      // default: false
  maxSuggestions: number;                // default: 5
  minUtility: number;                    // default: 0.6
  minRelevance: number;                  // default: 0.5
  includeHighlighting: boolean;          // default: true
}

/**
 * Cross-project learning configuration
 */
export interface CrossProjectConfig {
  enabled: boolean;                      // default: false
  minApplicability: number;              // default: 0.7
  minRelevance: number;                  // default: 0.6
  maxPatternsPerQuery: number;           // default: 10
  decayHalfLifeDays: number;             // default: 180
}

/**
 * Reranking strategy for hybrid search
 */
export type RerankStrategy = 'rrf' | 'weighted';

/**
 * Hybrid search configuration
 * Combines dense semantic search with BM25 sparse keyword search
 */
export interface HybridSearchConfig {
  enabled: boolean;                      // default: false
  rerankStrategy: RerankStrategy;        // default: 'rrf'
  rrfK: number;                          // RRF smoothing parameter, default: 60
  denseWeight: number;                   // Weight for dense search (0-1), default: 0.5
  sparseWeight: number;                  // Weight for sparse search (0-1), default: 0.5
  candidateMultiplier: number;           // Retrieve N * limit candidates from each, default: 3
  bm25K1: number;                        // BM25 term frequency saturation, default: 1.2
  bm25B: number;                         // BM25 length normalization, default: 0.75
}

/**
 * Hybrid search result with combined scoring
 */
export interface HybridSearchResult {
  id: string;
  content: string;
  score: number;                         // Combined/reranked score
  denseScore?: number;                   // Original dense search score
  sparseScore?: number;                  // Original sparse/BM25 score
  metadata: Record<string, unknown>;
}
