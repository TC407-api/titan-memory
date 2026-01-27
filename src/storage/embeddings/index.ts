/**
 * Embedding Generators
 * Re-exports all embedding generator implementations
 */

export { VoyageEmbeddingGenerator, type VoyageEmbeddingConfig } from './voyage-embedding.js';
export { LocalEmbeddingGenerator, type LocalEmbeddingConfig } from './local-embedding.js';
export { CachedEmbeddingGenerator, type CacheConfig } from './cached-embedding.js';

import { IEmbeddingGenerator } from '../vector-storage.js';
import { VoyageEmbeddingGenerator } from './voyage-embedding.js';
import { LocalEmbeddingGenerator } from './local-embedding.js';
import { CachedEmbeddingGenerator } from './cached-embedding.js';
import { DefaultEmbeddingGenerator } from '../zilliz-client.js';
import { EmbeddingConfig } from '../../types.js';

/**
 * Create an embedding generator based on configuration
 * Automatically wraps with caching if cache size > 0
 */
export function createEmbeddingGenerator(config: EmbeddingConfig): IEmbeddingGenerator {
  let generator: IEmbeddingGenerator;

  switch (config.provider) {
    case 'voyage':
      generator = new VoyageEmbeddingGenerator({
        apiKey: config.apiKey,
        model: config.model,
        dimension: config.dimension,
        timeout: config.timeout,
        batchSize: config.batchSize,
      });
      break;

    case 'local':
      generator = new LocalEmbeddingGenerator({
        provider: 'ollama',
        model: config.model,
        dimension: config.dimension,
        timeout: config.timeout,
      });
      break;

    case 'hash':
    default:
      generator = new DefaultEmbeddingGenerator(config.dimension ?? 1536);
      break;
  }

  // Wrap with cache if configured
  if (config.cacheSize && config.cacheSize > 0) {
    generator = new CachedEmbeddingGenerator(generator, {
      maxSize: config.cacheSize,
    });
  }

  return generator;
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same dimension');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Calculate euclidean distance between two embeddings
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same dimension');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Find top-k most similar embeddings
 */
export function findTopK(
  query: number[],
  embeddings: number[][],
  k: number,
  metric: 'cosine' | 'euclidean' = 'cosine'
): Array<{ index: number; score: number }> {
  const scores: Array<{ index: number; score: number }> = [];

  for (let i = 0; i < embeddings.length; i++) {
    const score = metric === 'cosine'
      ? cosineSimilarity(query, embeddings[i])
      : -euclideanDistance(query, embeddings[i]); // Negative for sorting (lower distance = higher score)

    scores.push({ index: i, score });
  }

  // Sort by score descending and take top k
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, k);
}
