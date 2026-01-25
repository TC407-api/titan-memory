/**
 * Layer 4: Semantic Memory (Hope/Nested Learning-inspired)
 * Multi-frequency update tiers for continual learning without forgetting
 * Stores reasoning chains and patterns with different update frequencies
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BaseMemoryLayer } from './base.js';
import { MemoryEntry, MemoryLayer, QueryOptions, QueryResult } from '../types.js';
import { getProjectPaths, ensureProjectDirectories } from '../utils/config.js';
import { calculateDecay, scoreImportance } from '../utils/surprise.js';
import { lshHash } from '../utils/hash.js';

type UpdateFrequency = 'slow' | 'medium' | 'fast';

interface SemanticPattern {
  id: string;
  content: string;
  frequency: UpdateFrequency;
  updateCount: number;
  lastUpdated: Date;
  createdAt: Date;
  reasoningChain: string[];
  patternType: string;
  importance: number;
  lshSignatures: string[];
}

/**
 * Multi-frequency tiers for Continuum Memory System (CMS)
 * Inspired by Hope's nested learning approach
 */
const FREQUENCY_CONFIG = {
  slow: {
    halfLifeDays: 365,    // Long-term knowledge, rarely updated
    minUpdateInterval: 7 * 24 * 60 * 60 * 1000, // 7 days
    weight: 1.0,          // Highest weight in retrieval
  },
  medium: {
    halfLifeDays: 90,     // Session-level knowledge
    minUpdateInterval: 24 * 60 * 60 * 1000, // 1 day
    weight: 0.8,
  },
  fast: {
    halfLifeDays: 30,     // Recent patterns
    minUpdateInterval: 60 * 60 * 1000, // 1 hour
    weight: 0.6,
  },
};

export class SemanticMemoryLayer extends BaseMemoryLayer {
  private patterns: Map<string, SemanticPattern> = new Map();
  private patternsByType: Map<string, Set<string>> = new Map();
  private lshIndex: Map<string, Set<string>> = new Map(); // LSH signature -> pattern IDs
  private dataPath: string;

  constructor(projectId?: string) {
    super(MemoryLayer.SEMANTIC, projectId);

    // Use project-specific path for physical isolation
    const paths = getProjectPaths(projectId);
    this.dataPath = path.join(paths.semanticDir, 'patterns.json');

    // Ensure project directories exist
    ensureProjectDirectories(projectId);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load existing patterns from disk
    await this.loadFromDisk();

    this.initialized = true;
  }

  private async loadFromDisk(): Promise<void> {
    if (fs.existsSync(this.dataPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
        for (const pattern of data.patterns || []) {
          pattern.lastUpdated = new Date(pattern.lastUpdated);
          pattern.createdAt = new Date(pattern.createdAt);
          this.patterns.set(pattern.id, pattern);
          this.indexPattern(pattern);
        }
      } catch (error) {
        console.warn('Failed to load semantic patterns:', error);
      }
    }
  }

  private async saveToDisk(): Promise<void> {
    const dir = path.dirname(this.dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = {
      version: '1.0',
      savedAt: new Date().toISOString(),
      patterns: [...this.patterns.values()],
    };

    fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
  }

  private indexPattern(pattern: SemanticPattern): void {
    // Index by type
    if (!this.patternsByType.has(pattern.patternType)) {
      this.patternsByType.set(pattern.patternType, new Set());
    }
    this.patternsByType.get(pattern.patternType)!.add(pattern.id);

    // Index by LSH signatures
    for (const sig of pattern.lshSignatures) {
      if (!this.lshIndex.has(sig)) {
        this.lshIndex.set(sig, new Set());
      }
      this.lshIndex.get(sig)!.add(pattern.id);
    }
  }

  async store(entry: Omit<MemoryEntry, 'id' | 'layer'>): Promise<MemoryEntry> {
    const id = uuidv4();
    const importance = scoreImportance(entry.content);

    // Determine update frequency based on importance
    let frequency: UpdateFrequency = 'fast';
    if (importance > 0.7) {
      frequency = 'slow'; // High importance = long-term storage
    } else if (importance > 0.4) {
      frequency = 'medium';
    }

    // Extract reasoning chain from content structure
    const reasoningChain = this.extractReasoningChain(entry.content);

    // Detect pattern type
    const patternType = this.detectPatternType(entry.content);

    // Generate LSH signatures for similarity search
    const lshSignatures = lshHash(entry.content);

    // Check for similar existing pattern (for updates vs new creation)
    const similar = await this.findSimilar(entry.content, 0.8);
    if (similar && this.canUpdate(similar)) {
      // Update existing pattern instead of creating new
      return await this.updatePattern(similar.id, entry.content, reasoningChain);
    }

    const pattern: SemanticPattern = {
      id,
      content: entry.content,
      frequency,
      updateCount: 1,
      lastUpdated: new Date(),
      createdAt: new Date(),
      reasoningChain,
      patternType,
      importance,
      lshSignatures,
    };

    this.patterns.set(id, pattern);
    this.indexPattern(pattern);
    await this.saveToDisk();

    return this.patternToEntry(pattern);
  }

  private async updatePattern(
    id: string,
    newContent: string,
    newChain: string[]
  ): Promise<MemoryEntry> {
    const pattern = this.patterns.get(id)!;

    // Merge content (append new insights)
    pattern.content = this.mergeContent(pattern.content, newContent);

    // Merge reasoning chains
    pattern.reasoningChain = [...new Set([...pattern.reasoningChain, ...newChain])];

    pattern.updateCount++;
    pattern.lastUpdated = new Date();

    // Re-calculate importance
    pattern.importance = scoreImportance(pattern.content);

    // Update LSH signatures
    const oldSigs = new Set(pattern.lshSignatures);
    pattern.lshSignatures = lshHash(pattern.content);

    // Update LSH index
    for (const sig of oldSigs) {
      if (!pattern.lshSignatures.includes(sig)) {
        this.lshIndex.get(sig)?.delete(id);
      }
    }
    for (const sig of pattern.lshSignatures) {
      if (!oldSigs.has(sig)) {
        if (!this.lshIndex.has(sig)) {
          this.lshIndex.set(sig, new Set());
        }
        this.lshIndex.get(sig)!.add(id);
      }
    }

    await this.saveToDisk();
    return this.patternToEntry(pattern);
  }

  private canUpdate(pattern: SemanticPattern): boolean {
    const config = FREQUENCY_CONFIG[pattern.frequency];
    const timeSinceUpdate = Date.now() - pattern.lastUpdated.getTime();
    return timeSinceUpdate >= config.minUpdateInterval;
  }

  private mergeContent(existing: string, newContent: string): string {
    // Simple merge: append if significantly different
    if (existing.includes(newContent) || newContent.includes(existing)) {
      return existing.length > newContent.length ? existing : newContent;
    }

    // Append with separator
    return `${existing}\n\n---\n\n${newContent}`;
  }

  private extractReasoningChain(content: string): string[] {
    const chain: string[] = [];

    // Look for numbered steps
    const numberedSteps = content.match(/^\d+\.\s+(.+)$/gm);
    if (numberedSteps) {
      chain.push(...numberedSteps);
    }

    // Look for "because", "therefore", "thus" patterns
    const reasoningPatterns = content.match(/(?:because|therefore|thus|since|hence)\s+[^.]+\./gi);
    if (reasoningPatterns) {
      chain.push(...reasoningPatterns);
    }

    // Look for "if...then" patterns
    const conditionals = content.match(/if\s+[^,]+,\s+(?:then\s+)?[^.]+\./gi);
    if (conditionals) {
      chain.push(...conditionals);
    }

    return chain.slice(0, 10); // Limit to 10 steps
  }

  private detectPatternType(content: string): string {
    const lowerContent = content.toLowerCase();

    if (/\b(?:architecture|design|pattern|structure)\b/.test(lowerContent)) {
      return 'architecture';
    }
    if (/\b(?:error|bug|fix|debug)\b/.test(lowerContent)) {
      return 'debugging';
    }
    if (/\b(?:prefer|like|want|style)\b/.test(lowerContent)) {
      return 'preference';
    }
    if (/\b(?:workflow|process|step|procedure)\b/.test(lowerContent)) {
      return 'workflow';
    }
    if (/\b(?:learned|discovered|insight|realized)\b/.test(lowerContent)) {
      return 'learning';
    }
    if (/\b(?:api|endpoint|request|response)\b/.test(lowerContent)) {
      return 'api';
    }
    if (/\b(?:test|spec|assert|expect)\b/.test(lowerContent)) {
      return 'testing';
    }

    return 'general';
  }

  private async findSimilar(content: string, threshold: number): Promise<SemanticPattern | null> {
    const querySigs = new Set(lshHash(content));
    let bestMatch: SemanticPattern | null = null;
    let bestSimilarity = 0;

    // Find candidates from LSH index
    const candidates = new Set<string>();
    for (const sig of querySigs) {
      const matches = this.lshIndex.get(sig);
      if (matches) {
        for (const id of matches) {
          candidates.add(id);
        }
      }
    }

    // Calculate Jaccard similarity for candidates
    for (const id of candidates) {
      const pattern = this.patterns.get(id);
      if (!pattern) continue;

      const patternSigs = new Set(pattern.lshSignatures);
      const intersection = new Set([...querySigs].filter(x => patternSigs.has(x)));
      const union = new Set([...querySigs, ...patternSigs]);
      const similarity = intersection.size / union.size;

      if (similarity >= threshold && similarity > bestSimilarity) {
        bestMatch = pattern;
        bestSimilarity = similarity;
      }
    }

    return bestMatch;
  }

  async query(queryText: string, options?: QueryOptions): Promise<QueryResult> {
    const startTime = performance.now();
    const limit = options?.limit || 10;

    const results: Array<{ pattern: SemanticPattern; score: number }> = [];
    const querySigs = new Set(lshHash(queryText));

    for (const pattern of this.patterns.values()) {
      // Calculate similarity using LSH
      const patternSigs = new Set(pattern.lshSignatures);
      const intersection = new Set([...querySigs].filter(x => patternSigs.has(x)));
      const union = new Set([...querySigs, ...patternSigs]);
      const similarity = union.size > 0 ? intersection.size / union.size : 0;

      // Apply frequency weight
      const frequencyWeight = FREQUENCY_CONFIG[pattern.frequency].weight;

      // Apply decay
      const config = FREQUENCY_CONFIG[pattern.frequency];
      const decay = calculateDecay(
        pattern.createdAt,
        pattern.lastUpdated,
        config.halfLifeDays
      );

      // Combined score
      const score = similarity * frequencyWeight * decay * (1 + pattern.importance);

      if (score > 0.1) {
        results.push({ pattern, score });
      }
    }

    // Sort by score and take top N
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, limit);

    const queryTimeMs = performance.now() - startTime;

    return {
      memories: topResults.map(r => this.patternToEntry(r.pattern)),
      layer: MemoryLayer.SEMANTIC,
      queryTimeMs,
      totalFound: results.length,
    };
  }

  /**
   * Query by pattern type
   */
  async queryByType(patternType: string, limit: number = 10): Promise<MemoryEntry[]> {
    const patternIds = this.patternsByType.get(patternType);
    if (!patternIds) return [];

    const patterns = [...patternIds]
      .map(id => this.patterns.get(id)!)
      .filter(p => p)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);

    return patterns.map(p => this.patternToEntry(p));
  }

  /**
   * Get reasoning chain for a topic
   */
  async getReasoningChain(topic: string): Promise<string[]> {
    const result = await this.query(topic, { limit: 5 });
    const chains: string[] = [];

    for (const memory of result.memories) {
      const pattern = this.patterns.get(memory.id);
      if (pattern?.reasoningChain) {
        chains.push(...pattern.reasoningChain);
      }
    }

    return [...new Set(chains)]; // Deduplicate
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const pattern = this.patterns.get(id);
    return pattern ? this.patternToEntry(pattern) : null;
  }

  async delete(id: string): Promise<boolean> {
    const pattern = this.patterns.get(id);
    if (!pattern) return false;

    // Remove from indices
    this.patternsByType.get(pattern.patternType)?.delete(id);
    for (const sig of pattern.lshSignatures) {
      this.lshIndex.get(sig)?.delete(id);
    }

    this.patterns.delete(id);
    await this.saveToDisk();
    return true;
  }

  async count(): Promise<number> {
    return this.patterns.size;
  }

  /**
   * Get statistics by pattern type
   */
  async getTypeStats(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {};
    for (const [type, ids] of this.patternsByType) {
      stats[type] = ids.size;
    }
    return stats;
  }

  /**
   * Get statistics by frequency tier
   */
  async getFrequencyStats(): Promise<Record<UpdateFrequency, number>> {
    const stats: Record<UpdateFrequency, number> = {
      slow: 0,
      medium: 0,
      fast: 0,
    };

    for (const pattern of this.patterns.values()) {
      stats[pattern.frequency]++;
    }

    return stats;
  }

  private patternToEntry(pattern: SemanticPattern): MemoryEntry {
    return {
      id: pattern.id,
      content: pattern.content,
      layer: MemoryLayer.SEMANTIC,
      timestamp: pattern.createdAt,
      metadata: {
        updateFrequency: pattern.frequency,
        updateCount: pattern.updateCount,
        lastUpdated: pattern.lastUpdated.toISOString(),
        reasoningChain: pattern.reasoningChain,
        patternType: pattern.patternType,
        importance: pattern.importance,
      },
    };
  }

  async close(): Promise<void> {
    await this.saveToDisk();
    this.patterns.clear();
    this.patternsByType.clear();
    this.lshIndex.clear();
    this.initialized = false;
  }
}
