/**
 * Surprise Detection Algorithm (Titans/MIRAS-inspired)
 * Determines whether new content is novel enough to store
 */

import { IMPORTANT_PATTERNS, SurpriseResult, MemoryEntry } from '../types.js';
import { tokenize, lshHash } from './hash.js';

/**
 * Calculate surprise score for new content
 * Returns 0.0-1.0 where higher = more surprising/novel
 */
export function calculateSurprise(
  newContent: string,
  existingMemories: MemoryEntry[],
  threshold: number = 0.3
): SurpriseResult {
  // Calculate semantic similarity using LSH
  const newLsh = new Set(lshHash(newContent));
  let maxSimilarity = 0;
  const similarMemories: string[] = [];

  for (const memory of existingMemories) {
    const memoryLsh = new Set(lshHash(memory.content));
    const similarity = jaccardSimilarity(newLsh, memoryLsh);

    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
    }

    if (similarity > 0.5) {
      similarMemories.push(memory.id);
    }
  }

  // Novelty is inverse of max similarity
  const noveltyScore = 1.0 - maxSimilarity;

  // Calculate pattern boost for important content types
  const patternBoost = calculatePatternBoost(newContent);

  // Final surprise score
  const score = Math.min(1.0, noveltyScore + patternBoost);

  return {
    score,
    shouldStore: score >= threshold,
    noveltyScore,
    patternBoost,
    similarMemories,
  };
}

/**
 * Calculate Jaccard similarity between two sets
 */
function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Calculate pattern boost for important content types
 */
export function calculatePatternBoost(content: string): number {
  let boost = 0;

  // Check for important patterns
  if (IMPORTANT_PATTERNS.DECISION.test(content)) {
    boost += 0.2;
  }
  if (IMPORTANT_PATTERNS.ERROR.test(content)) {
    boost += 0.3;
  }
  if (IMPORTANT_PATTERNS.SOLUTION.test(content)) {
    boost += 0.25;
  }
  if (IMPORTANT_PATTERNS.LEARNING.test(content)) {
    boost += 0.25;
  }
  if (IMPORTANT_PATTERNS.ARCHITECTURE.test(content)) {
    boost += 0.15;
  }
  if (IMPORTANT_PATTERNS.PREFERENCE.test(content)) {
    boost += 0.1;
  }

  // Cap at 0.5 to prevent auto-storing everything with keywords
  return Math.min(0.5, boost);
}

/**
 * Calculate momentum for related context capture
 * Titans uses momentum to capture context around surprising events
 */
export function calculateMomentum(
  recentSurprises: number[],
  windowSize: number = 5
): number {
  if (recentSurprises.length === 0) return 0;

  // Take the last windowSize surprises
  const recent = recentSurprises.slice(-windowSize);

  // Exponential weighted average (more recent = higher weight)
  let momentum = 0;
  let weight = 1;
  let totalWeight = 0;

  for (let i = recent.length - 1; i >= 0; i--) {
    momentum += recent[i] * weight;
    totalWeight += weight;
    weight *= 0.7; // Decay factor
  }

  return momentum / totalWeight;
}

/**
 * Calculate decay factor for memory aging
 * Memories decay over time unless reinforced
 */
export function calculateDecay(
  createdAt: Date,
  lastAccessed: Date,
  halfLifeDays: number = 180
): number {
  const now = new Date();
  const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const daysSinceAccess = (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);

  // Use the OLDER of creation or last access for decay calculation
  // If memory was accessed recently, it should decay less (higher value)
  // If memory hasn't been accessed in a while, it should decay more (lower value)
  const effectiveDays = Math.max(daysSinceCreation, daysSinceAccess);

  // Exponential decay: factor = 2^(-t/halfLife)
  return Math.pow(2, -effectiveDays / halfLifeDays);
}

/**
 * Extract key insights from content for pre-compaction flush
 */
export function extractInsights(content: string): {
  decisions: string[];
  errors: string[];
  solutions: string[];
  learnings: string[];
} {
  const lines = content.split('\n');
  const insights = {
    decisions: [] as string[],
    errors: [] as string[],
    solutions: [] as string[],
    learnings: [] as string[],
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 10) continue;

    if (IMPORTANT_PATTERNS.DECISION.test(trimmed)) {
      insights.decisions.push(trimmed);
    }
    if (IMPORTANT_PATTERNS.ERROR.test(trimmed)) {
      insights.errors.push(trimmed);
    }
    if (IMPORTANT_PATTERNS.SOLUTION.test(trimmed)) {
      insights.solutions.push(trimmed);
    }
    if (IMPORTANT_PATTERNS.LEARNING.test(trimmed)) {
      insights.learnings.push(trimmed);
    }
  }

  return insights;
}

/**
 * Score content importance for prioritized storage
 */
export function scoreImportance(content: string): number {
  let score = 0;

  // Base score from length (longer = potentially more valuable)
  const words = tokenize(content);
  score += Math.min(0.2, words.length / 500);

  // Pattern-based scoring
  score += calculatePatternBoost(content);

  // Code block presence (technical content)
  if (/```[\s\S]*```/.test(content)) {
    score += 0.15;
  }

  // Bullet points or numbered lists (structured content)
  if (/^[\s]*[-*•]\s/m.test(content) || /^[\s]*\d+\.\s/m.test(content)) {
    score += 0.1;
  }

  // Questions (clarifications, decisions)
  if (/\?/.test(content)) {
    score += 0.05;
  }

  return Math.min(1.0, score);
}
