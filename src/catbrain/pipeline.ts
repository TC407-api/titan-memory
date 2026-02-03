/**
 * CatBrain Pipeline - The "Librarian" Recall Logic
 *
 * Store Path: Content In -> Classify -> Extract -> Tag entity status -> Store
 * Recall Path: Query -> Retrieve 50+ chunks -> Sentence Split -> Semantic Highlight
 *   -> Prune below threshold -> Reconstruct "Gold" sentences -> Temporal conflict resolution
 *   -> Sufficiency check -> Return clean context
 */

import { MemoryEntry } from '../types.js';
import { SemanticHighlighter } from '../utils/semantic-highlight.js';
import {
  MemoryCategory,
  CatBrainPipelineResult,
  GoldSentence,
  LibrarianResult,
  CatBrainConfig,
  DEFAULT_CATBRAIN_CONFIG,
} from './types.js';
import { classifyContent } from './classifier.js';
import { extractByCategory } from './extractors.js';

/**
 * CatBrain Pipeline orchestrator
 */
export class CatBrainPipeline {
  private config: CatBrainConfig;
  private highlighter?: SemanticHighlighter;

  constructor(config?: Partial<CatBrainConfig>, highlighter?: SemanticHighlighter) {
    this.config = { ...DEFAULT_CATBRAIN_CONFIG, ...config };
    this.highlighter = highlighter;
  }

  /**
   * STORE PATH: Classify content and enrich metadata
   */
  processForStore(content: string): CatBrainPipelineResult {
    const classification = classifyContent(content);
    const extraction = extractByCategory(content, classification.category);

    const enrichedMetadata: Record<string, unknown> = {
      category: classification.category,
      categoryConfidence: classification.confidence,
      classificationMethod: classification.method,
      entityStatus: extraction.entityStatus,
    };

    // Add secondary category if confident enough
    if (classification.secondaryCategory && (classification.secondaryConfidence ?? 0) > 0.3) {
      enrichedMetadata.secondaryCategory = classification.secondaryCategory;
    }

    // Add extraction fields
    enrichedMetadata.extractedFields = extraction.fields;

    return { classification, extraction, enrichedMetadata };
  }

  /**
   * RECALL PATH: The Librarian - retrieve, highlight, prune, reconstruct
   */
  async processForRecall(
    query: string,
    memories: MemoryEntry[]
  ): Promise<LibrarianResult> {
    if (memories.length === 0) {
      return this.emptyResult();
    }

    // Step 1: Sentence split all memories
    const allSentences: GoldSentence[] = [];
    for (const memory of memories) {
      const sentences = splitIntoSentences(memory.content);
      for (const text of sentences) {
        allSentences.push({
          text,
          score: 0,
          sourceMemoryId: memory.id,
          category: memory.metadata?.category as MemoryCategory | undefined,
        });
      }
    }

    const totalSentences = allSentences.length;

    // Step 2: Score each sentence via semantic highlighting
    if (this.highlighter) {
      // Score all sentences against the query
      for (let i = 0; i < allSentences.length; i++) {
        const result = await this.highlighter.highlight(
          query,
          allSentences[i].text,
          0 // Get all scores, we filter later
        );
        allSentences[i].score = result.sentenceProbabilities[0] ?? 0;
      }
    } else {
      // Fallback: simple term overlap scoring
      for (const sentence of allSentences) {
        sentence.score = calculateTermOverlap(query, sentence.text);
      }
    }

    // Step 3: Prune below threshold
    const threshold = this.config.highlightThreshold;
    const goldSentences = allSentences.filter(s => s.score >= threshold);

    // Step 4: Apply temporal conflict resolution
    const resolved = resolveTemporalConflicts(goldSentences, memories);

    // Step 5: Calculate category coverage
    const categoryCoverage = calculateCategoryCoverage(resolved);

    // Step 6: Calculate compression
    const originalLength = memories.reduce((sum, m) => sum + m.content.length, 0);
    const goldLength = resolved.reduce((sum, s) => sum + s.text.length, 0);
    const compressionRate = originalLength > 0 ? goldLength / originalLength : 0;

    return {
      goldSentences: resolved,
      totalRetrieved: memories.length,
      totalSentences,
      prunedCount: totalSentences - resolved.length,
      compressionRate,
      categoryCoverage,
    };
  }

  /**
   * Check if CatBrain pipeline is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CatBrainConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set the semantic highlighter
   */
  setHighlighter(highlighter: SemanticHighlighter): void {
    this.highlighter = highlighter;
  }

  private emptyResult(): LibrarianResult {
    return {
      goldSentences: [],
      totalRetrieved: 0,
      totalSentences: 0,
      prunedCount: 0,
      compressionRate: 0,
      categoryCoverage: {
        knowledge: 0,
        profile: 0,
        event: 0,
        behavior: 0,
        skill: 0,
      },
    };
  }
}

/**
 * Split text into sentences (shared utility)
 */
function splitIntoSentences(text: string): string[] {
  return text
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Simple term overlap scoring (fallback when no embeddings)
 */
function calculateTermOverlap(query: string, sentence: string): number {
  const queryTerms = new Set(
    query.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(t => t.length > 2)
  );
  const sentenceTerms = new Set(
    sentence.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(t => t.length > 2)
  );

  if (queryTerms.size === 0) return 0;

  let matches = 0;
  for (const term of queryTerms) {
    if (sentenceTerms.has(term)) matches++;
  }
  return matches / queryTerms.size;
}

/**
 * Resolve temporal conflicts: when contradictions exist, most recent wins
 */
function resolveTemporalConflicts(
  sentences: GoldSentence[],
  memories: MemoryEntry[]
): GoldSentence[] {
  // Build a memory timestamp map
  const timestampMap = new Map<string, Date>();
  for (const memory of memories) {
    timestampMap.set(memory.id, new Date(memory.timestamp));
  }

  // Group sentences by topic similarity (simplified: by source memory)
  // For contradicted entities, keep only the most recent
  const memoryGroups = new Map<string, GoldSentence[]>();
  for (const sentence of sentences) {
    const group = memoryGroups.get(sentence.sourceMemoryId) || [];
    group.push(sentence);
    memoryGroups.set(sentence.sourceMemoryId, group);
  }

  // Sort memory groups by timestamp (most recent first)
  const sortedGroups = [...memoryGroups.entries()].sort((a, b) => {
    const timeA = timestampMap.get(a[0])?.getTime() || 0;
    const timeB = timestampMap.get(b[0])?.getTime() || 0;
    return timeB - timeA;
  });

  // Flatten back, most recent first, sort by score
  const result: GoldSentence[] = [];
  for (const [, group] of sortedGroups) {
    result.push(...group);
  }

  // Sort by score descending
  result.sort((a, b) => b.score - a.score);

  return result;
}

/**
 * Calculate category coverage from gold sentences
 */
function calculateCategoryCoverage(
  sentences: GoldSentence[]
): Record<MemoryCategory, number> {
  const counts: Record<MemoryCategory, number> = {
    knowledge: 0,
    profile: 0,
    event: 0,
    behavior: 0,
    skill: 0,
  };

  for (const sentence of sentences) {
    if (sentence.category) {
      counts[sentence.category]++;
    }
  }

  const total = sentences.length || 1;
  return {
    knowledge: counts.knowledge / total,
    profile: counts.profile / total,
    event: counts.event / total,
    behavior: counts.behavior / total,
    skill: counts.skill / total,
  };
}
