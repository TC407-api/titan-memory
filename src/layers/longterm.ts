/**
 * Layer 3: Long-Term Memory (Titans/MIRAS-inspired)
 * Surprise-based selective storage with momentum and adaptive forgetting
 * Uses Zilliz Cloud for vector storage with surprise scores
 */

import { v4 as uuidv4 } from 'uuid';
import { BaseMemoryLayer } from './base.js';
import { MemoryEntry, MemoryLayer, QueryOptions, QueryResult } from '../types.js';
import { calculateSurprise, calculateMomentum, calculateDecay } from '../utils/surprise.js';
import { getConfig, getProjectCollectionName } from '../utils/config.js';

interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export class LongTermMemoryLayer extends BaseMemoryLayer {
  private recentSurprises: number[] = [];
  private memoryCache: Map<string, MemoryEntry> = new Map();
  private zillizClient: ZillizClient | null = null;

  constructor(projectId?: string) {
    super(MemoryLayer.LONG_TERM, projectId);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const config = getConfig();

    if (!config.offlineMode && config.zillizUri && config.zillizToken) {
      // Use project-specific collection name for physical isolation
      const collectionName = getProjectCollectionName(this.projectId) + '_longterm';
      this.zillizClient = new ZillizClient(
        config.zillizUri,
        config.zillizToken,
        collectionName
      );
      await this.zillizClient.ensureCollection();
    }

    this.initialized = true;
  }

  /**
   * Store with surprise-based filtering
   */
  async store(entry: Omit<MemoryEntry, 'id' | 'layer'>): Promise<MemoryEntry> {
    const config = getConfig();

    // Get recent memories for surprise calculation
    const recentMemories = await this.getRecentMemories(50);

    // Calculate surprise score
    const surpriseResult = calculateSurprise(
      entry.content,
      recentMemories,
      config.surpriseThreshold
    );

    // Track surprise for momentum calculation
    this.recentSurprises.push(surpriseResult.score);
    if (this.recentSurprises.length > 100) {
      this.recentSurprises.shift();
    }

    // Check if we should store (surprise filtering)
    if (config.enableSurpriseFiltering && !surpriseResult.shouldStore) {
      // Return a "ghost" entry that wasn't actually stored
      return {
        id: `ghost_${uuidv4()}`,
        content: entry.content,
        layer: MemoryLayer.LONG_TERM,
        timestamp: entry.timestamp,
        metadata: {
          ...entry.metadata,
          stored: false,
          surpriseScore: surpriseResult.score,
          reason: 'Below surprise threshold',
        },
      };
    }

    const id = uuidv4();
    const momentum = calculateMomentum(this.recentSurprises);

    const memoryEntry: MemoryEntry = {
      id,
      content: entry.content,
      layer: MemoryLayer.LONG_TERM,
      timestamp: entry.timestamp,
      metadata: {
        ...entry.metadata,
        stored: true,
        surpriseScore: surpriseResult.score,
        momentum,
        decayFactor: 1.0, // Fresh memories have no decay
        lastAccessed: entry.timestamp.toISOString(),
      },
    };

    // Store in Zilliz if available
    if (this.zillizClient) {
      await this.zillizClient.insert(memoryEntry);
    }

    // Also cache locally
    this.memoryCache.set(id, memoryEntry);

    return memoryEntry;
  }

  /**
   * Query with decay-aware scoring
   */
  async query(queryText: string, options?: QueryOptions): Promise<QueryResult> {
    const startTime = performance.now();
    const limit = options?.limit || 10;
    const config = getConfig();
    const includeDecayed = options?.includeDecayed ?? false;

    let memories: MemoryEntry[] = [];

    if (this.zillizClient) {
      // Vector search in Zilliz
      const results = await this.zillizClient.search(queryText, limit * 2); // Get extra for decay filtering

      memories = results.map(r => ({
        id: r.id,
        content: r.content,
        layer: MemoryLayer.LONG_TERM,
        timestamp: new Date(r.metadata.timestamp as string),
        metadata: r.metadata as MemoryEntry['metadata'],
      }));
    } else {
      // Fallback to cache
      memories = [...this.memoryCache.values()];
    }

    // Apply decay filtering and scoring
    const scoredMemories = memories
      .map(m => {
        const createdAt = m.timestamp;
        const lastAccessed = m.metadata.lastAccessed
          ? new Date(m.metadata.lastAccessed as string)
          : createdAt;
        const decay = calculateDecay(createdAt, lastAccessed, config.decayHalfLife);

        return {
          memory: m,
          effectiveScore: (m.metadata.surpriseScore as number || 0.5) * decay,
          decay,
        };
      })
      .filter(item => includeDecayed || item.decay >= 0.1) // Filter heavily decayed unless requested
      .sort((a, b) => b.effectiveScore - a.effectiveScore)
      .slice(0, limit);

    const queryTimeMs = performance.now() - startTime;

    return {
      memories: scoredMemories.map(s => ({
        ...s.memory,
        metadata: {
          ...s.memory.metadata,
          currentDecay: s.decay,
          effectiveScore: s.effectiveScore,
        },
      })),
      layer: MemoryLayer.LONG_TERM,
      queryTimeMs,
      totalFound: scoredMemories.length,
    };
  }

  async get(id: string): Promise<MemoryEntry | null> {
    // Check cache first
    if (this.memoryCache.has(id)) {
      const memory = this.memoryCache.get(id)!;
      // Update last accessed
      memory.metadata.lastAccessed = new Date().toISOString();
      return memory;
    }

    if (this.zillizClient) {
      const result = await this.zillizClient.get(id);
      if (result) {
        const memory: MemoryEntry = {
          id: result.id,
          content: result.content,
          layer: MemoryLayer.LONG_TERM,
          timestamp: new Date(result.metadata.timestamp as string),
          metadata: result.metadata as MemoryEntry['metadata'],
        };
        this.memoryCache.set(id, memory);
        return memory;
      }
    }

    return null;
  }

  async delete(id: string): Promise<boolean> {
    this.memoryCache.delete(id);

    if (this.zillizClient) {
      return await this.zillizClient.delete(id);
    }

    return true;
  }

  async count(): Promise<number> {
    if (this.zillizClient) {
      return await this.zillizClient.count();
    }
    return this.memoryCache.size;
  }

  /**
   * Get recent memories for surprise calculation
   */
  private async getRecentMemories(limit: number): Promise<MemoryEntry[]> {
    if (this.zillizClient) {
      const results = await this.zillizClient.getRecent(limit);
      return results.map(r => ({
        id: r.id,
        content: r.content,
        layer: MemoryLayer.LONG_TERM,
        timestamp: new Date(r.metadata.timestamp as string),
        metadata: r.metadata as MemoryEntry['metadata'],
      }));
    }

    return [...this.memoryCache.values()]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Prune heavily decayed memories
   */
  async pruneDecayed(threshold: number = 0.05): Promise<number> {
    const config = getConfig();
    const allMemories = await this.getRecentMemories(1000);
    let pruned = 0;

    for (const memory of allMemories) {
      const createdAt = memory.timestamp;
      const lastAccessed = memory.metadata.lastAccessed
        ? new Date(memory.metadata.lastAccessed as string)
        : createdAt;
      const decay = calculateDecay(createdAt, lastAccessed, config.decayHalfLife);

      if (decay < threshold) {
        await this.delete(memory.id);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Get current momentum (used for context capture)
   */
  getCurrentMomentum(): number {
    return calculateMomentum(this.recentSurprises);
  }

  async close(): Promise<void> {
    this.memoryCache.clear();
    this.recentSurprises = [];
    if (this.zillizClient) {
      await this.zillizClient.close();
    }
    this.initialized = false;
  }
}

/**
 * Simple Zilliz Cloud client wrapper
 * In production, this would use the official Zilliz SDK
 */
class ZillizClient {
  private uri: string;
  private token: string;
  private collection: string;

  constructor(uri: string, token: string, collection: string) {
    this.uri = uri;
    this.token = token;
    this.collection = collection;
  }

  async ensureCollection(): Promise<void> {
    // Create collection if not exists
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
    } catch {
      // Fallback to offline mode
      console.warn('Could not connect to Zilliz, running in offline mode');
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
        dimension: 1536, // OpenAI embedding dimension
        metricType: 'COSINE',
        primaryField: 'id',
        vectorField: 'embedding',
      }),
    });
  }

  async insert(entry: MemoryEntry): Promise<void> {
    // In production, would generate embedding and insert
    // For now, store as-is with placeholder embedding
    const embedding = await this.generateEmbedding(entry.content);

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
    const embedding = await this.generateEmbedding(query);

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
    const response = await fetch(`${this.uri}/v2/vectordb/entities/delete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        collectionName: this.collection,
        filter: `id == "${id}"`,
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

  private async generateEmbedding(text: string): Promise<number[]> {
    // In production, would call OpenAI or other embedding API
    // For now, return deterministic pseudo-embedding based on content hash
    const hash = simpleHash(text);
    const embedding: number[] = [];
    for (let i = 0; i < 1536; i++) {
      embedding.push(Math.sin(hash * (i + 1)) * 0.5);
    }
    return embedding;
  }

  async close(): Promise<void> {
    // Cleanup if needed
  }
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}
