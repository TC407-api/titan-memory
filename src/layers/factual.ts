/**
 * Layer 2: Factual Memory (Engram-inspired)
 * O(1) N-gram hash lookup for fast fact retrieval
 * Uses JSON-based storage with in-memory hash indices
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BaseMemoryLayer } from './base.js';
import { MemoryEntry, MemoryLayer, QueryOptions, QueryResult } from '../types.js';
import { computeNgramHash, extractNgrams, createContentHash } from '../utils/hash.js';
import { getConfig, getProjectPaths, ensureProjectDirectories } from '../utils/config.js';

interface FactEntry {
  id: string;
  content: string;
  contentHash: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

interface HashEntry {
  factId: string;
  nSize: number;
  ngram: string;
}

interface FactsStore {
  version: string;
  facts: FactEntry[];
  hashIndex: Record<number, HashEntry[]>; // hash -> entries
}

export class FactualMemoryLayer extends BaseMemoryLayer {
  private facts: Map<string, FactEntry> = new Map();
  private contentHashIndex: Map<string, string> = new Map(); // contentHash -> id
  private hashIndex: Map<number, HashEntry[]> = new Map();
  private tableSize: number;
  private dataPath: string;
  private dirty: boolean = false;

  constructor(projectId?: string) {
    super(MemoryLayer.FACTUAL, projectId);
    this.tableSize = getConfig().hashTableSize;

    // Use project-specific path for physical isolation
    const paths = getProjectPaths(projectId);
    this.dataPath = paths.factualDbPath;

    // Ensure project directories exist
    ensureProjectDirectories(projectId);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.loadFromDisk();
    this.initialized = true;
  }

  private async loadFromDisk(): Promise<void> {
    if (fs.existsSync(this.dataPath)) {
      try {
        const data: FactsStore = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));

        for (const fact of data.facts) {
          this.facts.set(fact.id, fact);
          this.contentHashIndex.set(fact.contentHash, fact.id);
        }

        for (const [hashStr, entries] of Object.entries(data.hashIndex)) {
          this.hashIndex.set(parseInt(hashStr), entries);
        }
      } catch (error) {
        console.warn('Failed to load factual memory:', error);
      }
    }
  }

  private async saveToDisk(): Promise<void> {
    if (!this.dirty) return;

    const dir = path.dirname(this.dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const store: FactsStore = {
      version: '1.0',
      facts: [...this.facts.values()],
      hashIndex: Object.fromEntries(this.hashIndex),
    };

    fs.writeFileSync(this.dataPath, JSON.stringify(store, null, 2));
    this.dirty = false;
  }

  async store(entry: Omit<MemoryEntry, 'id' | 'layer'>): Promise<MemoryEntry> {
    const contentHash = createContentHash(entry.content);

    // Check for duplicate content
    const existingId = this.contentHashIndex.get(contentHash);
    if (existingId) {
      const existing = await this.get(existingId);
      if (existing) return existing;
    }

    const id = uuidv4();
    const timestamp = entry.timestamp.toISOString();

    const factEntry: FactEntry = {
      id,
      content: entry.content,
      contentHash,
      timestamp,
      metadata: entry.metadata || {},
    };

    this.facts.set(id, factEntry);
    this.contentHashIndex.set(contentHash, id);

    // Generate and index n-gram hashes
    const ngrams1 = extractNgrams(entry.content, 1);
    const ngrams2 = extractNgrams(entry.content, 2);
    const ngrams3 = extractNgrams(entry.content, 3);

    this.indexNgrams(ngrams1, 1, id);
    this.indexNgrams(ngrams2, 2, id);
    this.indexNgrams(ngrams3, 3, id);

    this.dirty = true;
    await this.saveToDisk();

    return {
      id,
      content: entry.content,
      layer: MemoryLayer.FACTUAL,
      timestamp: entry.timestamp,
      metadata: {
        ...entry.metadata,
        hashKey: contentHash,
        ngrams: [...ngrams1.map(n => n.join(' ')), ...ngrams2.map(n => n.join(' '))].slice(0, 10),
      },
    };
  }

  private indexNgrams(ngrams: string[][], nSize: number, factId: string): void {
    for (let k = 0; k < ngrams.length; k++) {
      const hashKey = computeNgramHash(ngrams[k], nSize, k, this.tableSize);
      const entry: HashEntry = {
        factId,
        nSize,
        ngram: ngrams[k].join(' '),
      };

      if (!this.hashIndex.has(hashKey)) {
        this.hashIndex.set(hashKey, []);
      }

      const entries = this.hashIndex.get(hashKey)!;
      // Avoid duplicates
      if (!entries.some(e => e.factId === factId && e.ngram === entry.ngram)) {
        entries.push(entry);
      }
    }
  }

  async query(queryText: string, options?: QueryOptions): Promise<QueryResult> {
    const startTime = performance.now();
    const limit = options?.limit || 10;

    // Extract query n-grams
    const ngrams1 = extractNgrams(queryText, 1);
    const ngrams2 = extractNgrams(queryText, 2);
    const ngrams3 = extractNgrams(queryText, 3);

    // Collect all hash keys
    const hashKeys: Array<{ hash: number; nSize: number }> = [];
    for (let k = 0; k < ngrams1.length; k++) {
      hashKeys.push({ hash: computeNgramHash(ngrams1[k], 1, k, this.tableSize), nSize: 1 });
    }
    for (let k = 0; k < ngrams2.length; k++) {
      hashKeys.push({ hash: computeNgramHash(ngrams2[k], 2, k, this.tableSize), nSize: 2 });
    }
    for (let k = 0; k < ngrams3.length; k++) {
      hashKeys.push({ hash: computeNgramHash(ngrams3[k], 3, k, this.tableSize), nSize: 3 });
    }

    // O(1) hash lookup for each key, then aggregate scores
    const factScores = new Map<string, number>();

    for (const { hash, nSize } of hashKeys) {
      const entries = this.hashIndex.get(hash);
      if (entries) {
        for (const entry of entries) {
          // Weight by n-gram size (longer matches are more valuable)
          const currentScore = factScores.get(entry.factId) || 0;
          factScores.set(entry.factId, currentScore + nSize);
        }
      }
    }

    // Sort by score and get top facts
    const sortedFacts = [...factScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    // Fetch full fact data
    const memories: MemoryEntry[] = [];
    for (const [factId] of sortedFacts) {
      const fact = this.facts.get(factId);
      if (fact) {
        memories.push({
          id: fact.id,
          content: fact.content,
          layer: MemoryLayer.FACTUAL,
          timestamp: new Date(fact.timestamp),
          metadata: fact.metadata,
        });
      }
    }

    const queryTimeMs = performance.now() - startTime;

    return {
      memories,
      layer: MemoryLayer.FACTUAL,
      queryTimeMs,
      totalFound: factScores.size,
    };
  }

  /**
   * Fast exact lookup by content hash
   */
  async lookupExact(content: string): Promise<MemoryEntry | null> {
    const contentHash = createContentHash(content);
    const id = this.contentHashIndex.get(contentHash);
    if (!id) return null;
    return this.get(id);
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const fact = this.facts.get(id);
    if (!fact) return null;

    return {
      id: fact.id,
      content: fact.content,
      layer: MemoryLayer.FACTUAL,
      timestamp: new Date(fact.timestamp),
      metadata: fact.metadata,
    };
  }

  async delete(id: string): Promise<boolean> {
    const fact = this.facts.get(id);
    if (!fact) return false;

    // Remove from content hash index
    this.contentHashIndex.delete(fact.contentHash);

    // Remove from hash index
    for (const entries of this.hashIndex.values()) {
      const idx = entries.findIndex(e => e.factId === id);
      if (idx !== -1) {
        entries.splice(idx, 1);
      }
    }

    this.facts.delete(id);
    this.dirty = true;
    await this.saveToDisk();

    return true;
  }

  async count(): Promise<number> {
    return this.facts.size;
  }

  /**
   * Get hash table statistics
   */
  async getHashStats(): Promise<{
    totalHashes: number;
    avgEntriesPerHash: number;
    collisionRate: number;
  }> {
    const hashCounts = [...this.hashIndex.entries()].map(([_, entries]) => entries.length);
    const totalHashes = hashCounts.length;
    const totalEntries = hashCounts.reduce((sum, count) => sum + count, 0);
    const avgEntries = totalHashes > 0 ? totalEntries / totalHashes : 0;
    const collisions = hashCounts.filter(count => count > 1).length;
    const collisionRate = totalHashes > 0 ? collisions / totalHashes : 0;

    return {
      totalHashes,
      avgEntriesPerHash: avgEntries,
      collisionRate,
    };
  }

  async close(): Promise<void> {
    await this.saveToDisk();
    this.facts.clear();
    this.contentHashIndex.clear();
    this.hashIndex.clear();
    this.initialized = false;
  }
}
