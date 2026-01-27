/**
 * Data-Dependent Decay Strategies
 * Content-aware decay calculation based on memory type, utility, and access patterns
 */

import {
  ContentType,
  DataDependentDecayConfig,
  DecayStrategy,
  MemoryEntry,
  IMPORTANT_PATTERNS,
} from '../types.js';

/**
 * Default half-lives by content type (in days)
 * Based on typical relevance patterns for different memory types
 */
export const DEFAULT_HALF_LIVES: Record<ContentType, number> = {
  decision: 365,       // Decisions are long-lived, important for future context
  error: 90,           // Errors can be fixed, decay faster
  solution: 270,       // Solutions stay relevant for similar problems
  architecture: 365,   // Architecture decisions are persistent
  learning: 180,       // Learnings have medium persistence
  preference: 300,     // User preferences are relatively stable
  general: 180,        // Default for unclassified content
};

/**
 * Detect content type from text
 */
export function detectContentType(content: string): ContentType {
  const lower = content.toLowerCase();

  // Check patterns in priority order
  if (IMPORTANT_PATTERNS.DECISION.test(lower)) return 'decision';
  if (IMPORTANT_PATTERNS.ERROR.test(lower)) return 'error';
  if (IMPORTANT_PATTERNS.SOLUTION.test(lower)) return 'solution';
  if (IMPORTANT_PATTERNS.ARCHITECTURE.test(lower)) return 'architecture';
  if (IMPORTANT_PATTERNS.LEARNING.test(lower)) return 'learning';
  if (IMPORTANT_PATTERNS.PREFERENCE.test(lower)) return 'preference';

  return 'general';
}

/**
 * Calculate time-only decay (original implementation)
 */
export function calculateTimeOnlyDecay(
  createdAt: Date,
  lastAccessed: Date,
  halfLifeDays: number = 180
): number {
  const now = new Date();
  const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const daysSinceAccess = (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);

  // Use the more recent of creation or last access
  const effectiveDays = Math.min(daysSinceCreation, daysSinceAccess);

  // Exponential decay: factor = 2^(-t/halfLife)
  return Math.pow(2, -effectiveDays / halfLifeDays);
}

/**
 * Calculate data-dependent decay
 * Considers content type, utility score, and access patterns
 */
export function calculateDataDependentDecay(
  memory: MemoryEntry,
  config: DataDependentDecayConfig,
  overrideContentType?: ContentType
): number {
  const now = new Date();
  const createdAt = memory.timestamp;
  const lastAccessed = memory.metadata.lastAccessed
    ? new Date(memory.metadata.lastAccessed as string)
    : createdAt;

  // Detect content type
  const contentType = overrideContentType ?? detectContentType(memory.content);

  // Get base half-life for content type
  const baseHalfLife = config.halfLifeOverrides?.[contentType]
    ?? DEFAULT_HALF_LIVES[contentType];

  // Calculate utility multiplier (0.5x to 1.5x)
  const utilityScore = (memory.metadata.utilityScore as number) ?? 0.5;
  const utilityMultiplier = 0.5 + (utilityScore * (config.utilityWeight ?? 1.0));

  // Calculate access frequency multiplier (up to 1.5x)
  const accessCount = (memory.metadata.accessCount as number) ?? 0;
  const accessMultiplier = 1 + Math.min(0.5, accessCount * 0.05 * (config.accessWeight ?? 1.0));

  // Calculate effective half-life
  const effectiveHalfLife = baseHalfLife * utilityMultiplier * accessMultiplier;

  // Calculate days since creation/access
  const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const daysSinceAccess = (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
  const effectiveDays = Math.min(daysSinceCreation, daysSinceAccess);

  // Exponential decay with effective half-life
  return Math.pow(2, -effectiveDays / effectiveHalfLife);
}

/**
 * Decay calculator class for managing decay across memories
 */
export class DecayCalculator {
  private config: DataDependentDecayConfig;
  private strategy: DecayStrategy;

  constructor(config?: Partial<DataDependentDecayConfig>) {
    this.config = {
      strategy: config?.strategy ?? 'time-only',
      halfLifeOverrides: config?.halfLifeOverrides ?? {},
      utilityWeight: config?.utilityWeight ?? 1.0,
      accessWeight: config?.accessWeight ?? 1.0,
    };
    this.strategy = this.config.strategy;
  }

  /**
   * Calculate decay for a memory
   */
  calculate(memory: MemoryEntry, halfLifeDays?: number): number {
    if (this.strategy === 'time-only') {
      const lastAccessed = memory.metadata.lastAccessed
        ? new Date(memory.metadata.lastAccessed as string)
        : memory.timestamp;
      return calculateTimeOnlyDecay(
        memory.timestamp,
        lastAccessed,
        halfLifeDays ?? 180
      );
    }

    return calculateDataDependentDecay(memory, this.config);
  }

  /**
   * Calculate decay with content type override
   */
  calculateWithType(memory: MemoryEntry, contentType: ContentType): number {
    if (this.strategy === 'time-only') {
      const halfLife = DEFAULT_HALF_LIVES[contentType];
      const lastAccessed = memory.metadata.lastAccessed
        ? new Date(memory.metadata.lastAccessed as string)
        : memory.timestamp;
      return calculateTimeOnlyDecay(memory.timestamp, lastAccessed, halfLife);
    }

    return calculateDataDependentDecay(memory, this.config, contentType);
  }

  /**
   * Get effective half-life for a memory
   */
  getEffectiveHalfLife(memory: MemoryEntry): number {
    const contentType = detectContentType(memory.content);
    const baseHalfLife = this.config.halfLifeOverrides?.[contentType]
      ?? DEFAULT_HALF_LIVES[contentType];

    if (this.strategy === 'time-only') {
      return baseHalfLife;
    }

    // Calculate multipliers
    const utilityScore = (memory.metadata.utilityScore as number) ?? 0.5;
    const utilityMultiplier = 0.5 + (utilityScore * (this.config.utilityWeight ?? 1.0));

    const accessCount = (memory.metadata.accessCount as number) ?? 0;
    const accessMultiplier = 1 + Math.min(0.5, accessCount * 0.05 * (this.config.accessWeight ?? 1.0));

    return baseHalfLife * utilityMultiplier * accessMultiplier;
  }

  /**
   * Check if memory should be pruned based on decay threshold
   */
  shouldPrune(memory: MemoryEntry, threshold: number = 0.05): boolean {
    const decay = this.calculate(memory);
    return decay < threshold;
  }

  /**
   * Rank memories by effective relevance (decay-weighted)
   */
  rankByRelevance(memories: MemoryEntry[]): Array<{ memory: MemoryEntry; decay: number; effectiveScore: number }> {
    return memories
      .map(memory => {
        const decay = this.calculate(memory);
        const surpriseScore = (memory.metadata.surpriseScore as number) ?? 0.5;
        const effectiveScore = surpriseScore * decay;
        return { memory, decay, effectiveScore };
      })
      .sort((a, b) => b.effectiveScore - a.effectiveScore);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DataDependentDecayConfig>): void {
    this.config = { ...this.config, ...config };
    this.strategy = this.config.strategy;
  }

  /**
   * Get current strategy
   */
  getStrategy(): DecayStrategy {
    return this.strategy;
  }

  /**
   * Get content type half-lives
   */
  getHalfLives(): Record<ContentType, number> {
    return {
      ...DEFAULT_HALF_LIVES,
      ...this.config.halfLifeOverrides,
    };
  }
}

/**
 * Create a decay calculator with configuration
 */
export function createDecayCalculator(config?: Partial<DataDependentDecayConfig>): DecayCalculator {
  return new DecayCalculator(config);
}

/**
 * Estimate time until memory reaches decay threshold
 */
export function estimateTimeToDecay(
  memory: MemoryEntry,
  threshold: number = 0.05,
  config?: DataDependentDecayConfig
): number {
  const calculator = new DecayCalculator(config);
  const currentDecay = calculator.calculate(memory);

  if (currentDecay <= threshold) {
    return 0; // Already below threshold
  }

  const effectiveHalfLife = calculator.getEffectiveHalfLife(memory);

  // Solve for t in: threshold = 2^(-t/halfLife)
  // t = -halfLife * log2(threshold)
  const totalDays = -effectiveHalfLife * Math.log2(threshold);

  // Subtract time already elapsed
  const daysSinceCreation = (Date.now() - memory.timestamp.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, totalDays - daysSinceCreation);
}
