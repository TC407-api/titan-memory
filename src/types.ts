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
}

// Pre-compaction context
export interface CompactionContext {
  sessionId: string;
  timestamp: Date;
  tokenCount: number;
  importantInsights: string[];
  decisions: string[];
  errors: string[];
  solutions: string[];
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
