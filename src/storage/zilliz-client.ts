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
} from './vector-storage.js';

/**
 * Default embedding generator using deterministic hash-based pseudo-embeddings
 * In production, replace with OpenAI, Cohere, or other embedding service
 */
export class DefaultEmbeddingGenerator implements IEmbeddingGenerator {
  private readonly dimension: number;

  constructor(dimension: number = 1536) {
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
  private isInitialized: boolean = false;

  constructor(
    config: VectorStorageConfig,
    embeddingGenerator?: IEmbeddingGenerator
  ) {
    this.uri = config.uri;
    this.token = config.token;
    this.collection = config.collection;
    this.dimension = config.dimension ?? 1536;
    this.metricType = config.metricType ?? 'COSINE';
    this.embeddingGenerator = embeddingGenerator ?? new DefaultEmbeddingGenerator(this.dimension);
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
