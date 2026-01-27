/**
 * Zilliz Cloud Vector Storage Client
 * Implements IVectorStorage interface for Zilliz Cloud
 */

import { MemoryEntry } from '../types.js';
import { simpleHash } from '../utils/hash.js';
import { isValidUUID, sanitizeFilterValue } from '../utils/auth.js';
import {
  IVectorStorage,
  IEmbeddingGenerator,
  VectorSearchResult,
  VectorStorageConfig,
  HybridSearchOptions,
} from './vector-storage.js';

/**
 * Default embedding generator using deterministic hash-based pseudo-embeddings
 * In production, replace with OpenAI, Cohere, or other embedding service
 */
export class DefaultEmbeddingGenerator implements IEmbeddingGenerator {
  private readonly dimension: number;

  constructor(dimension: number = 1024) { // Match voyage-4 series default
    this.dimension = dimension;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Deterministic pseudo-embedding based on content hash
    // Production: Replace with actual embedding API call
    const hash = simpleHash(text);
    const embedding: number[] = [];
    for (let i = 0; i < this.dimension; i++) {
      embedding.push(Math.sin(hash * (i + 1)) * 0.5);
    }
    return embedding;
  }

  getDimension(): number {
    return this.dimension;
  }
}

/**
 * Zilliz Cloud client implementing the vector storage interface
 */
export class ZillizClient implements IVectorStorage {
  private readonly uri: string;
  private readonly token: string;
  private readonly collection: string;
  private readonly dimension: number;
  private readonly metricType: string;
  private readonly embeddingGenerator: IEmbeddingGenerator;
  private readonly enableHybridSearch: boolean;
  private readonly bm25K1: number;
  private readonly bm25B: number;
  private isInitialized: boolean = false;

  constructor(
    config: VectorStorageConfig,
    embeddingGenerator?: IEmbeddingGenerator
  ) {
    this.uri = config.uri;
    this.token = config.token;
    this.collection = config.collection;
    this.dimension = config.dimension ?? 1024; // voyage-4 series default
    this.metricType = config.metricType ?? 'COSINE';
    this.embeddingGenerator = embeddingGenerator ?? new DefaultEmbeddingGenerator(this.dimension);
    // Hybrid search configuration
    this.enableHybridSearch = config.enableHybridSearch ?? false;
    this.bm25K1 = config.bm25K1 ?? 1.2;
    this.bm25B = config.bm25B ?? 0.75;
  }

  /**
   * Check if hybrid search is available
   */
  isHybridSearchEnabled(): boolean {
    return this.enableHybridSearch;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const response = await fetch(`${this.uri}/v2/vectordb/collections/describe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ collectionName: this.collection }),
      });

      if (!response.ok) {
        // Collection doesn't exist, create it
        await this.createCollection();
      }
      this.isInitialized = true;
    } catch {
      // Fallback to offline mode
      console.warn('Could not connect to Zilliz, running in offline mode');
      this.isInitialized = true;
    }
  }

  private async createCollection(): Promise<void> {
    if (this.enableHybridSearch) {
      // Create collection with hybrid search schema (dense + sparse vectors)
      await this.createHybridCollection();
    } else {
      // Create simple collection with dense vectors only
      await fetch(`${this.uri}/v2/vectordb/collections/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collectionName: this.collection,
          dimension: this.dimension,
          metricType: this.metricType,
          primaryField: 'id',
          vectorField: 'embedding',
        }),
      });
    }
  }

  /**
   * Create collection with hybrid search schema supporting both dense and sparse vectors
   */
  private async createHybridCollection(): Promise<void> {
    // Define schema with both dense and sparse vector fields
    const schema = {
      autoId: false,
      enableDynamicField: true,
      fields: [
        {
          fieldName: 'id',
          dataType: 'VarChar',
          isPrimary: true,
          maxLength: 64,
        },
        {
          fieldName: 'content',
          dataType: 'VarChar',
          maxLength: 8000,
          enableAnalyzer: true, // Enable text analysis for BM25
        },
        {
          fieldName: 'embedding',
          dataType: 'FloatVector',
          dim: this.dimension,
        },
        {
          fieldName: 'sparse_embedding',
          dataType: 'SparseFloatVector',
        },
        {
          fieldName: 'timestamp',
          dataType: 'VarChar',
          maxLength: 64,
        },
        {
          fieldName: 'metadata',
          dataType: 'VarChar',
          maxLength: 16000,
        },
      ],
      functions: [
        {
          name: 'content_bm25',
          type: 'BM25',
          inputFieldNames: ['content'],
          outputFieldNames: ['sparse_embedding'],
        },
      ],
    };

    // Create collection with schema
    await fetch(`${this.uri}/v2/vectordb/collections/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        collectionName: this.collection,
        schema,
      }),
    });

    // Create indexes for both dense and sparse vectors
    await this.createHybridIndexes();
  }

  /**
   * Create indexes for hybrid search (dense + sparse)
   */
  private async createHybridIndexes(): Promise<void> {
    // Create index for dense vectors
    await fetch(`${this.uri}/v2/vectordb/indexes/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        collectionName: this.collection,
        indexParams: [
          {
            fieldName: 'embedding',
            indexName: 'dense_idx',
            indexType: 'AUTOINDEX',
            metricType: this.metricType,
          },
          {
            fieldName: 'sparse_embedding',
            indexName: 'sparse_idx',
            indexType: 'AUTOINDEX',
            metricType: 'BM25',
            params: {
              bm25_k1: this.bm25K1,
              bm25_b: this.bm25B,
            },
          },
        ],
      }),
    });
  }

  async insert(entry: MemoryEntry): Promise<void> {
    const embedding = await this.embeddingGenerator.generateEmbedding(entry.content);

    await fetch(`${this.uri}/v2/vectordb/entities/insert`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        collectionName: this.collection,
        data: [{
          id: entry.id,
          content: entry.content,
          embedding,
          timestamp: entry.timestamp.toISOString(),
          metadata: JSON.stringify(entry.metadata),
        }],
      }),
    });
  }

  async search(query: string, limit: number): Promise<VectorSearchResult[]> {
    const embedding = await this.embeddingGenerator.generateEmbedding(query);

    const response = await fetch(`${this.uri}/v2/vectordb/entities/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        collectionName: this.collection,
        vector: embedding,
        limit,
        outputFields: ['id', 'content', 'timestamp', 'metadata'],
      }),
    });

    const data = await response.json() as { results?: Array<Record<string, unknown>> };
    return (data.results || []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      content: r.content as string,
      score: r.score as number,
      metadata: JSON.parse(r.metadata as string),
    }));
  }

  /**
   * Hybrid search combining dense semantic search with BM25 sparse keyword search
   * Uses Reciprocal Rank Fusion (RRF) or weighted reranking to combine results
   */
  async hybridSearch(
    query: string,
    limit: number,
    options: HybridSearchOptions = { rerankStrategy: 'rrf' }
  ): Promise<VectorSearchResult[]> {
    if (!this.enableHybridSearch) {
      // Fallback to regular search if hybrid not enabled
      return this.search(query, limit);
    }

    const embedding = await this.embeddingGenerator.generateEmbedding(query);
    const candidateLimit = limit * 3; // Retrieve more candidates for reranking

    // Build reranker configuration based on strategy
    let rerank: Record<string, unknown>;
    if (options.rerankStrategy === 'weighted') {
      rerank = {
        strategy: 'weighted',
        params: {
          weights: [options.denseWeight ?? 0.5, options.sparseWeight ?? 0.5],
        },
      };
    } else {
      // Default to RRF
      rerank = {
        strategy: 'rrf',
        params: {
          k: options.rrfK ?? 60,
        },
      };
    }

    // Build hybrid search request
    const searchRequest = {
      collectionName: this.collection,
      search: [
        {
          // Dense vector search (semantic)
          data: [embedding],
          annsField: 'embedding',
          limit: candidateLimit,
          params: {
            metric_type: this.metricType,
          },
        },
        {
          // Sparse vector search (BM25 keyword)
          data: [query], // Raw text - Zilliz converts to sparse vector via BM25 function
          annsField: 'sparse_embedding',
          limit: candidateLimit,
          params: {
            metric_type: 'BM25',
          },
        },
      ],
      rerank,
      limit,
      outputFields: ['id', 'content', 'timestamp', 'metadata'],
    };

    // Add filter if provided
    if (options.filter) {
      (searchRequest as Record<string, unknown>).filter = options.filter;
    }

    const response = await fetch(`${this.uri}/v2/vectordb/entities/hybrid_search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(searchRequest),
    });

    const data = await response.json() as { results?: Array<Record<string, unknown>> };
    return (data.results || []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      content: r.content as string,
      score: r.score as number,
      metadata: JSON.parse(r.metadata as string),
    }));
  }

  async get(id: string): Promise<VectorSearchResult | null> {
    const response = await fetch(`${this.uri}/v2/vectordb/entities/get`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        collectionName: this.collection,
        ids: [id],
        outputFields: ['id', 'content', 'timestamp', 'metadata'],
      }),
    });

    const data = await response.json() as { results?: Array<Record<string, unknown>> };
    if (data.results && data.results.length > 0) {
      const r = data.results[0];
      return {
        id: r.id as string,
        content: r.content as string,
        score: 1.0,
        metadata: JSON.parse(r.metadata as string),
      };
    }
    return null;
  }

  async getRecent(limit: number): Promise<VectorSearchResult[]> {
    const response = await fetch(`${this.uri}/v2/vectordb/entities/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        collectionName: this.collection,
        filter: '',
        limit,
        outputFields: ['id', 'content', 'timestamp', 'metadata'],
      }),
    });

    const data = await response.json() as { results?: Array<Record<string, unknown>> };
    return (data.results || []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      content: r.content as string,
      score: 1.0,
      metadata: JSON.parse(r.metadata as string),
    }));
  }

  async delete(id: string): Promise<boolean> {
    // Validate ID format to prevent injection attacks
    if (!isValidUUID(id)) {
      console.warn(`Invalid UUID format for delete: ${id}`);
      return false;
    }

    // Sanitize the ID value even after validation for defense in depth
    const sanitizedId = sanitizeFilterValue(id);

    const response = await fetch(`${this.uri}/v2/vectordb/entities/delete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        collectionName: this.collection,
        filter: `id == "${sanitizedId}"`,
      }),
    });

    return response.ok;
  }

  async count(): Promise<number> {
    const response = await fetch(`${this.uri}/v2/vectordb/collections/describe`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ collectionName: this.collection }),
    });

    const data = await response.json() as { collection?: { rowCount: number } };
    return data.collection?.rowCount || 0;
  }

  async close(): Promise<void> {
    this.isInitialized = false;
    // Cleanup if needed
  }
}
