/**
 * Vector Storage Interface
 * Abstraction layer for vector database operations
 * Enables swapping between Zilliz, Pinecone, local storage, etc.
 */

import { MemoryEntry } from '../types.js';

/**
 * Result from vector similarity search
 */
export interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

/**
 * Configuration for vector storage
 */
export interface VectorStorageConfig {
  uri: string;
  token: string;
  collection: string;
  dimension?: number;
  metricType?: 'COSINE' | 'L2' | 'IP';
  // Hybrid search options
  enableHybridSearch?: boolean;
  bm25K1?: number;                // BM25 term frequency saturation (default: 1.2)
  bm25B?: number;                 // BM25 length normalization (default: 0.75)
}

/**
 * Options for hybrid search
 */
export interface HybridSearchOptions {
  rerankStrategy: 'rrf' | 'weighted';
  rrfK?: number;                  // RRF smoothing parameter (default: 60)
  denseWeight?: number;           // Weight for dense search (default: 0.5)
  sparseWeight?: number;          // Weight for sparse search (default: 0.5)
  filter?: string;                // Optional filter expression
}

/**
 * Interface for vector storage implementations
 * Allows dependency injection and easy mocking for tests
 */
export interface IVectorStorage {
  /**
   * Initialize the storage and ensure collection exists
   */
  initialize(): Promise<void>;

  /**
   * Insert a memory entry into the vector store
   */
  insert(entry: MemoryEntry): Promise<void>;

  /**
   * Search for similar entries using semantic similarity
   */
  search(query: string, limit: number): Promise<VectorSearchResult[]>;

  /**
   * Hybrid search combining dense semantic search with BM25 sparse keyword search
   * Falls back to regular search if hybrid search is not enabled/supported
   */
  hybridSearch?(query: string, limit: number, options?: HybridSearchOptions): Promise<VectorSearchResult[]>;

  /**
   * Check if hybrid search is available
   */
  isHybridSearchEnabled?(): boolean;

  /**
   * Get a specific entry by ID
   */
  get(id: string): Promise<VectorSearchResult | null>;

  /**
   * Get recent entries (ordered by timestamp)
   */
  getRecent(limit: number): Promise<VectorSearchResult[]>;

  /**
   * Delete an entry by ID
   */
  delete(id: string): Promise<boolean>;

  /**
   * Get total count of entries
   */
  count(): Promise<number>;

  /**
   * Close connection and cleanup resources
   */
  close(): Promise<void>;
}

/**
 * Embedding generator interface for customizable embedding strategies
 */
export interface IEmbeddingGenerator {
  /**
   * Generate embedding vector for text content
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Get the dimension of embeddings produced
   */
  getDimension(): number;
}
