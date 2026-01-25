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
