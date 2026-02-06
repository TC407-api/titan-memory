/**
 * Storage Module
 * Provides vector storage abstraction for memory persistence
 */

export {
  IVectorStorage,
  IEmbeddingGenerator,
  VectorSearchResult,
  VectorStorageConfig,
  HybridSearchOptions,
} from './vector-storage.js';

export {
  ZillizClient,
  DefaultEmbeddingGenerator,
} from './zilliz-client.js';

// MIRAS Enhancement: Embedding generators + reranker
export {
  VoyageEmbeddingGenerator,
  VoyageReranker,
  LocalEmbeddingGenerator,
  CachedEmbeddingGenerator,
  createEmbeddingGenerator,
  cosineSimilarity,
  euclideanDistance,
  findTopK,
} from './embeddings/index.js';

export type {
  VoyageEmbeddingConfig,
  VoyageRerankerConfig,
  RerankResult,
  LocalEmbeddingConfig,
  CacheConfig,
} from './embeddings/index.js';
