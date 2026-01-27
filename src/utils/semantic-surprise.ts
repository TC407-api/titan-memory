/**
 * Semantic Surprise Calculator
 * Uses embedding cosine similarity for more accurate novelty detection
 *
 * Replaces LSH-based surprise with semantic embeddings for higher accuracy
 */

import { SurpriseResult, MemoryEntry, SemanticSurpriseConfig } from '../types.js';
import { IEmbeddingGenerator } from '../storage/vector-storage.js';
import { cosineSimilarity } from '../storage/embeddings/index.js';
import { calculateSurprise as calculateLshSurprise, calculatePatternBoost } from './surprise.js';

const DEFAULT_CONFIG: Required<SemanticSurpriseConfig> = {
  algorithm: 'lsh',
  similarityThreshold: 0.7,
  comparisionLimit: 50,
};

/**
 * Semantic surprise calculator interface
 */
export interface ISurpriseCalculator {
  calculateSurprise(
    newContent: string,
    existingMemories: MemoryEntry[],
    threshold?: number
  ): Promise<SurpriseResult>;
}

/**
 * LSH-based surprise calculator (existing implementation)
 */
export class LshSurpriseCalculator implements ISurpriseCalculator {
  async calculateSurprise(
    newContent: string,
    existingMemories: MemoryEntry[],
    threshold: number = 0.3
  ): Promise<SurpriseResult> {
    // Use existing LSH implementation
    return calculateLshSurprise(newContent, existingMemories, threshold);
  }
}

/**
 * Semantic embedding-based surprise calculator
 * Uses cosine similarity on embeddings for more accurate novelty detection
 */
export class SemanticSurpriseCalculator implements ISurpriseCalculator {
  private embeddingGenerator: IEmbeddingGenerator;
  private config: Required<SemanticSurpriseConfig>;
  private embeddingCache: Map<string, number[]> = new Map();

  constructor(
    embeddingGenerator: IEmbeddingGenerator,
    config?: Partial<SemanticSurpriseConfig>
  ) {
    this.embeddingGenerator = embeddingGenerator;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate semantic surprise using embedding similarity
   */
  async calculateSurprise(
    newContent: string,
    existingMemories: MemoryEntry[],
    threshold: number = 0.3
  ): Promise<SurpriseResult> {
    // Generate embedding for new content
    const newEmbedding = await this.getEmbedding(newContent);

    // Compare with existing memories (limited for performance)
    const memoriesToCompare = existingMemories.slice(0, this.config.comparisionLimit);

    let maxSimilarity = 0;
    const similarMemories: string[] = [];

    for (const memory of memoriesToCompare) {
      const memoryEmbedding = await this.getEmbedding(memory.content);
      const similarity = cosineSimilarity(newEmbedding, memoryEmbedding);

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }

      // Track highly similar memories
      if (similarity > this.config.similarityThreshold) {
        similarMemories.push(memory.id);
      }
    }

    // Novelty is inverse of max similarity
    const noveltyScore = 1.0 - maxSimilarity;

    // Calculate pattern boost for important content types (same as LSH)
    const patternBoost = calculatePatternBoost(newContent);

    // Final surprise score
    const score = Math.min(1.0, noveltyScore + patternBoost);

    return {
      score,
      shouldStore: score >= threshold,
      noveltyScore,
      patternBoost,
      similarMemories,
    };
  }

  /**
   * Get embedding with caching
   */
  private async getEmbedding(content: string): Promise<number[]> {
    const cacheKey = this.hashContent(content);

    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    const embedding = await this.embeddingGenerator.generateEmbedding(content);

    // Cache with size limit
    if (this.embeddingCache.size >= 1000) {
      // Remove oldest entry (first key)
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey) {
        this.embeddingCache.delete(firstKey);
      }
    }
    this.embeddingCache.set(cacheKey, embedding);

    return embedding;
  }

  /**
   * Simple hash for cache key
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < Math.min(content.length, 1000); i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash = hash & hash;
    }
    return `${hash}_${content.length}`;
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return { size: this.embeddingCache.size, maxSize: 1000 };
  }
}

/**
 * Factory function to create appropriate surprise calculator
 */
export function createSurpriseCalculator(
  config: SemanticSurpriseConfig,
  embeddingGenerator?: IEmbeddingGenerator
): ISurpriseCalculator {
  if (config.algorithm === 'semantic' && embeddingGenerator) {
    return new SemanticSurpriseCalculator(embeddingGenerator, config);
  }

  // Default to LSH
  return new LshSurpriseCalculator();
}

/**
 * Hybrid surprise calculator that combines LSH and semantic methods
 * Useful for high-accuracy scenarios
 */
export class HybridSurpriseCalculator implements ISurpriseCalculator {
  private lshCalculator: LshSurpriseCalculator;
  private semanticCalculator: SemanticSurpriseCalculator;
  private semanticWeight: number;

  constructor(
    embeddingGenerator: IEmbeddingGenerator,
    semanticWeight: number = 0.7,
    config?: Partial<SemanticSurpriseConfig>
  ) {
    this.lshCalculator = new LshSurpriseCalculator();
    this.semanticCalculator = new SemanticSurpriseCalculator(embeddingGenerator, config);
    this.semanticWeight = semanticWeight;
  }

  async calculateSurprise(
    newContent: string,
    existingMemories: MemoryEntry[],
    threshold: number = 0.3
  ): Promise<SurpriseResult> {
    // Calculate both
    const [lshResult, semanticResult] = await Promise.all([
      this.lshCalculator.calculateSurprise(newContent, existingMemories, threshold),
      this.semanticCalculator.calculateSurprise(newContent, existingMemories, threshold),
    ]);

    // Weighted combination
    const lshWeight = 1 - this.semanticWeight;
    const combinedScore = (
      lshResult.score * lshWeight +
      semanticResult.score * this.semanticWeight
    );

    const combinedNovelty = (
      lshResult.noveltyScore * lshWeight +
      semanticResult.noveltyScore * this.semanticWeight
    );

    // Merge similar memories (deduplicated)
    const allSimilar = new Set([...lshResult.similarMemories, ...semanticResult.similarMemories]);

    return {
      score: combinedScore,
      shouldStore: combinedScore >= threshold,
      noveltyScore: combinedNovelty,
      patternBoost: lshResult.patternBoost, // Same for both
      similarMemories: [...allSimilar],
    };
  }
}

/**
 * Calculate semantic surprise directly (convenience function)
 */
export async function calculateSemanticSurprise(
  newContent: string,
  existingMemories: MemoryEntry[],
  embeddingGenerator: IEmbeddingGenerator,
  threshold: number = 0.3,
  config?: Partial<SemanticSurpriseConfig>
): Promise<SurpriseResult> {
  const calculator = new SemanticSurpriseCalculator(embeddingGenerator, config);
  return calculator.calculateSurprise(newContent, existingMemories, threshold);
}
