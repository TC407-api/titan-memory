/**
 * Storage Module
 * Provides vector storage abstraction for memory persistence
 */

export {
  IVectorStorage,
  IEmbeddingGenerator,
  VectorSearchResult,
  VectorStorageConfig,
} from './vector-storage.js';

export {
  ZillizClient,
  DefaultEmbeddingGenerator,
} from './zilliz-client.js';

// MIRAS Enhancement: Embedding generators
export {
  VoyageEmbeddingGenerator,
  LocalEmbeddingGenerator,
  CachedEmbeddingGenerator,
  createEmbeddingGenerator,
  cosineSimilarity,
  euclideanDistance,
  findTopK,
} from './embeddings/index.js';

export type {
  VoyageEmbeddingConfig,
  LocalEmbeddingConfig,
  CacheConfig,
} from './embeddings/index.js';
