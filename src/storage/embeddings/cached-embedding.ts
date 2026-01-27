/**
 * Cached Embedding Generator
 * LRU cache wrapper for any embedding generator
 */

import { IEmbeddingGenerator } from '../vector-storage.js';
import { simpleHash } from '../../utils/hash.js';

export interface CacheConfig {
  maxSize: number;          // Maximum cache entries (default: 10000)
  ttlMs?: number;           // Optional TTL in milliseconds
  persistPath?: string;     // Optional file path for persistence
}

interface CacheEntry {
  embedding: number[];
  timestamp: number;
  accessCount: number;
}

/**
 * LRU Cache with optional TTL for embeddings
 */
class LRUCache<K, V> {
  private cache: Map<K, { value: V; timestamp: number }>;
  private readonly maxSize: number;
  private readonly ttlMs?: number;

  constructor(maxSize: number, ttlMs?: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (this.ttlMs && Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    // Delete if exists (to update position)
    this.cache.delete(key);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check TTL
    if (this.ttlMs && Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }

  entries(): Array<[K, V]> {
    const result: Array<[K, V]> = [];
    for (const [key, entry] of this.cache.entries()) {
      if (!this.ttlMs || Date.now() - entry.timestamp <= this.ttlMs) {
        result.push([key, entry.value]);
      }
    }
    return result;
  }
}

/**
 * Cached embedding generator wrapping any IEmbeddingGenerator
 * Uses LRU eviction to maintain bounded memory usage
 */
export class CachedEmbeddingGenerator implements IEmbeddingGenerator {
  private readonly generator: IEmbeddingGenerator;
  private readonly cache: LRUCache<string, CacheEntry>;
  private readonly config: CacheConfig;

  // Stats
  private hits: number = 0;
  private misses: number = 0;

  constructor(generator: IEmbeddingGenerator, config?: Partial<CacheConfig>) {
    this.generator = generator;
    this.config = {
      maxSize: config?.maxSize ?? 10000,
      ttlMs: config?.ttlMs,
      persistPath: config?.persistPath,
    };
    this.cache = new LRUCache(this.config.maxSize, this.config.ttlMs);
  }

  /**
   * Generate embedding with caching
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const cacheKey = this.computeCacheKey(text);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.hits++;
      cached.accessCount++;
      return cached.embedding;
    }

    // Cache miss - generate new embedding
    this.misses++;
    const embedding = await this.generator.generateEmbedding(text);

    // Store in cache
    this.cache.set(cacheKey, {
      embedding,
      timestamp: Date.now(),
      accessCount: 1,
    });

    return embedding;
  }

  /**
   * Generate embeddings for multiple texts with caching
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const results: number[][] = new Array(texts.length);
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      const cacheKey = this.computeCacheKey(texts[i]);
      const cached = this.cache.get(cacheKey);

      if (cached) {
        this.hits++;
        cached.accessCount++;
        results[i] = cached.embedding;
      } else {
        uncachedIndices.push(i);
        uncachedTexts.push(texts[i]);
      }
    }

    // Generate embeddings for uncached texts
    if (uncachedTexts.length > 0) {
      this.misses += uncachedTexts.length;

      // Check if generator supports batch
      const generator = this.generator as { generateBatchEmbeddings?: (texts: string[]) => Promise<number[][]> };
      let newEmbeddings: number[][];

      if (typeof generator.generateBatchEmbeddings === 'function') {
        newEmbeddings = await generator.generateBatchEmbeddings(uncachedTexts);
      } else {
        // Fall back to sequential generation
        newEmbeddings = await Promise.all(
          uncachedTexts.map(text => this.generator.generateEmbedding(text))
        );
      }

      // Store in cache and results
      for (let i = 0; i < uncachedIndices.length; i++) {
        const originalIndex = uncachedIndices[i];
        const text = uncachedTexts[i];
        const embedding = newEmbeddings[i];

        results[originalIndex] = embedding;

        const cacheKey = this.computeCacheKey(text);
        this.cache.set(cacheKey, {
          embedding,
          timestamp: Date.now(),
          accessCount: 1,
        });
      }
    }

    return results;
  }

  /**
   * Compute cache key for text
   */
  private computeCacheKey(text: string): string {
    // Use hash for efficient lookup
    return `emb_${simpleHash(text)}_${text.length}`;
  }

  getDimension(): number {
    return this.generator.getDimension();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size(),
      maxSize: this.config.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Preload embeddings into cache
   */
  async preload(texts: string[]): Promise<void> {
    await this.generateBatchEmbeddings(texts);
  }

  /**
   * Check if text is cached
   */
  isCached(text: string): boolean {
    const cacheKey = this.computeCacheKey(text);
    return this.cache.has(cacheKey);
  }

  /**
   * Get the underlying generator
   */
  getUnderlyingGenerator(): IEmbeddingGenerator {
    return this.generator;
  }
}
