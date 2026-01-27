/**
 * Pattern Matcher
 * Efficient pattern matching for cross-project learning
 */

import { TransferablePattern, PatternMatchResult } from '../types.js';
import { contentSimilarity } from '../utils/similarity.js';
import { IEmbeddingGenerator } from '../storage/vector-storage.js';
import { cosineSimilarity } from '../storage/embeddings/index.js';

/**
 * Match options
 */
export interface MatchOptions {
  minRelevance: number;
  maxResults: number;
  domains?: string[];
  excludeProjects?: string[];
  boostDistilled?: boolean;  // Prefer patterns with distilled content
}

const DEFAULT_OPTIONS: Required<MatchOptions> = {
  minRelevance: 0.5,
  maxResults: 10,
  domains: [],
  excludeProjects: [],
  boostDistilled: true,
};

/**
 * Pattern Matcher
 * Provides efficient matching of queries against pattern library
 */
export class PatternMatcher {
  private embeddingGenerator?: IEmbeddingGenerator;
  private embeddingCache: Map<string, number[]> = new Map();

  constructor(embeddingGenerator?: IEmbeddingGenerator) {
    this.embeddingGenerator = embeddingGenerator;
  }

  /**
   * Set embedding generator
   */
  setEmbeddingGenerator(generator: IEmbeddingGenerator): void {
    this.embeddingGenerator = generator;
    this.embeddingCache.clear();
  }

  /**
   * Match query against patterns
   */
  async match(
    query: string,
    patterns: TransferablePattern[],
    options?: Partial<MatchOptions>
  ): Promise<PatternMatchResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Filter patterns
    let filtered = patterns;

    // Filter by domain
    if (opts.domains && opts.domains.length > 0) {
      filtered = filtered.filter(p =>
        opts.domains!.includes(p.domain) || p.domain === 'general'
      );
    }

    // Filter by excluded projects
    if (opts.excludeProjects && opts.excludeProjects.length > 0) {
      filtered = filtered.filter(p =>
        !opts.excludeProjects!.includes(p.sourceProject)
      );
    }

    // Calculate relevance for each pattern
    const results: PatternMatchResult[] = [];

    for (const pattern of filtered) {
      const relevance = await this.calculateRelevance(query, pattern, opts.boostDistilled);

      if (relevance >= opts.minRelevance) {
        results.push({
          pattern,
          relevance,
          matchedTerms: this.findMatchedTerms(query, pattern),
        });
      }
    }

    // Sort and limit
    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, opts.maxResults);
  }

  /**
   * Calculate relevance between query and pattern
   */
  private async calculateRelevance(
    query: string,
    pattern: TransferablePattern,
    boostDistilled: boolean
  ): Promise<number> {
    // Content to match (prefer distilled if available)
    const contentToMatch = boostDistilled && pattern.distilledContent
      ? pattern.distilledContent
      : pattern.content;

    let relevance: number;

    // Use semantic similarity if embedding generator available
    if (this.embeddingGenerator) {
      try {
        relevance = await this.calculateSemanticRelevance(query, contentToMatch);
      } catch {
        relevance = contentSimilarity(query, contentToMatch);
      }
    } else {
      relevance = contentSimilarity(query, contentToMatch);
    }

    // Apply applicability bonus
    relevance *= (0.7 + pattern.applicability * 0.3);

    // Apply distilled bonus
    if (boostDistilled && pattern.distilledContent) {
      relevance *= 1.1;
    }

    return Math.min(1, relevance);
  }

  /**
   * Calculate semantic relevance using embeddings
   */
  private async calculateSemanticRelevance(query: string, content: string): Promise<number> {
    if (!this.embeddingGenerator) {
      return contentSimilarity(query, content);
    }

    const queryEmbedding = await this.getEmbedding(query);
    const contentEmbedding = await this.getEmbedding(content);

    return Math.max(0, cosineSimilarity(queryEmbedding, contentEmbedding));
  }

  /**
   * Get embedding with caching
   */
  private async getEmbedding(text: string): Promise<number[]> {
    const cacheKey = this.hashContent(text);

    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    const embedding = await this.embeddingGenerator!.generateEmbedding(text);

    // Limit cache size
    if (this.embeddingCache.size >= 1000) {
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey) {
        this.embeddingCache.delete(firstKey);
      }
    }
    this.embeddingCache.set(cacheKey, embedding);

    return embedding;
  }

  /**
   * Hash content for cache key
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
   * Find matching terms between query and pattern
   */
  private findMatchedTerms(query: string, pattern: TransferablePattern): string[] {
    const content = pattern.distilledContent || pattern.content;

    const queryTerms = new Set(
      query.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(t => t.length > 2)
    );

    const contentTerms = new Set(
      content.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(t => t.length > 2)
    );

    const matched: string[] = [];
    for (const term of queryTerms) {
      if (contentTerms.has(term)) {
        matched.push(term);
      }
    }

    return matched;
  }

  /**
   * Find best matching pattern
   */
  async findBestMatch(
    query: string,
    patterns: TransferablePattern[],
    options?: Partial<MatchOptions>
  ): Promise<PatternMatchResult | null> {
    const results = await this.match(query, patterns, { ...options, maxResults: 1 });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Group patterns by domain
   */
  groupByDomain(patterns: TransferablePattern[]): Map<string, TransferablePattern[]> {
    const grouped = new Map<string, TransferablePattern[]>();

    for (const pattern of patterns) {
      const domain = pattern.domain || 'general';
      if (!grouped.has(domain)) {
        grouped.set(domain, []);
      }
      grouped.get(domain)!.push(pattern);
    }

    return grouped;
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
 * Create a pattern matcher
 */
export function createPatternMatcher(embeddingGenerator?: IEmbeddingGenerator): PatternMatcher {
  return new PatternMatcher(embeddingGenerator);
}

/**
 * Quick pattern match (convenience function)
 */
export async function quickMatch(
  query: string,
  patterns: TransferablePattern[],
  minRelevance: number = 0.5
): Promise<PatternMatchResult[]> {
  const matcher = new PatternMatcher();
  return matcher.match(query, patterns, { minRelevance });
}
