/**
 * FR-1: Utility Tracking Module
 * Tracks helpful/harmful feedback for evidence-based memory pruning
 */

import { MemoryEntry, MemoryMetadata } from '../types.js';

export type UtilitySignal = 'helpful' | 'harmful';

export interface FeedbackRecord {
  memoryId: string;
  signal: UtilitySignal;
  timestamp: Date;
  context?: string;
  sessionId?: string;
}

export interface UtilityStats {
  helpfulCount: number;
  harmfulCount: number;
  utilityScore: number;
  lastHelpful?: Date;
  lastHarmful?: Date;
}

/**
 * Calculate utility score from helpful/harmful counts
 * Returns 0.5 if no interactions (neutral), otherwise helpful/(helpful+harmful)
 */
export function calculateUtilityScore(
  helpfulCount: number,
  harmfulCount: number
): number {
  const total = helpfulCount + harmfulCount;
  if (total === 0) {
    return 0.5; // Neutral score for memories with no feedback
  }
  return helpfulCount / total;
}

/**
 * Update memory metadata with utility feedback
 */
export function applyFeedback(
  metadata: MemoryMetadata,
  signal: UtilitySignal
): MemoryMetadata {
  const now = new Date().toISOString();
  const updated = { ...metadata };

  if (signal === 'helpful') {
    updated.helpfulCount = (updated.helpfulCount || 0) + 1;
    updated.lastHelpful = now;
  } else {
    updated.harmfulCount = (updated.harmfulCount || 0) + 1;
    updated.lastHarmful = now;
  }

  // Recalculate utility score
  updated.utilityScore = calculateUtilityScore(
    updated.helpfulCount || 0,
    updated.harmfulCount || 0
  );

  return updated;
}

/**
 * Get utility stats from memory metadata
 */
export function getUtilityStats(metadata: MemoryMetadata): UtilityStats {
  const helpfulCount = metadata.helpfulCount || 0;
  const harmfulCount = metadata.harmfulCount || 0;

  return {
    helpfulCount,
    harmfulCount,
    utilityScore: calculateUtilityScore(helpfulCount, harmfulCount),
    lastHelpful: metadata.lastHelpful ? new Date(metadata.lastHelpful) : undefined,
    lastHarmful: metadata.lastHarmful ? new Date(metadata.lastHarmful) : undefined,
  };
}

/**
 * Check if memory should be pruned based on utility
 * Memories with harmful > helpful should be pruned
 * Memories with no interactions are preserved (cold start protection)
 */
export function shouldPruneByUtility(
  metadata: MemoryMetadata,
  utilityThreshold: number = 0.4
): boolean {
  const helpfulCount = metadata.helpfulCount || 0;
  const harmfulCount = metadata.harmfulCount || 0;
  const total = helpfulCount + harmfulCount;

  // Cold start protection: don't prune memories with no feedback
  if (total === 0) {
    return false;
  }

  // Prune if utility score is below threshold
  const utilityScore = calculateUtilityScore(helpfulCount, harmfulCount);
  return utilityScore < utilityThreshold;
}

/**
 * Weight recall results by utility score
 * Higher utility = higher weight in results
 */
export function weightByUtility(
  memories: MemoryEntry[],
  baseScores: number[]
): Array<{ memory: MemoryEntry; weightedScore: number }> {
  return memories.map((memory, idx) => {
    const baseScore = baseScores[idx] || 1.0;
    const utilityScore = memory.metadata.utilityScore ?? 0.5; // Default neutral

    // Utility weighting: boost helpful, penalize harmful
    // Range: 0.7x (harmful) to 1.3x (helpful)
    const utilityWeight = 0.7 + (utilityScore * 0.6);

    return {
      memory,
      weightedScore: baseScore * utilityWeight,
    };
  });
}

/**
 * UtilityTracker class for managing feedback across sessions
 */
export class UtilityTracker {
  private feedbackHistory: FeedbackRecord[] = [];
  private sessionFeedback: Map<string, Set<string>> = new Map();

  /**
   * Record feedback for a memory
   * Returns true if feedback was recorded, false if duplicate in session
   */
  recordFeedback(
    memoryId: string,
    signal: UtilitySignal,
    sessionId?: string,
    context?: string
  ): boolean {
    // Check for duplicate feedback in same session (idempotent)
    if (sessionId) {
      const sessionKey = `${sessionId}-${memoryId}-${signal}`;
      const sessionSet = this.sessionFeedback.get(sessionId) || new Set();

      if (sessionSet.has(sessionKey)) {
        return false; // Already recorded this feedback in this session
      }

      sessionSet.add(sessionKey);
      this.sessionFeedback.set(sessionId, sessionSet);
    }

    // Record the feedback
    this.feedbackHistory.push({
      memoryId,
      signal,
      timestamp: new Date(),
      context,
      sessionId,
    });

    return true;
  }

  /**
   * Get feedback history for a memory
   */
  getFeedbackHistory(memoryId: string): FeedbackRecord[] {
    return this.feedbackHistory.filter(f => f.memoryId === memoryId);
  }

  /**
   * Get all feedback since a timestamp
   */
  getFeedbackSince(since: Date): FeedbackRecord[] {
    return this.feedbackHistory.filter(f => f.timestamp >= since);
  }

  /**
   * Clear session tracking (call at session end)
   */
  clearSession(sessionId: string): void {
    this.sessionFeedback.delete(sessionId);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalFeedback: number;
    helpfulCount: number;
    harmfulCount: number;
    uniqueMemories: number;
    activeSessions: number;
  } {
    const uniqueMemories = new Set(this.feedbackHistory.map(f => f.memoryId));
    const helpfulCount = this.feedbackHistory.filter(f => f.signal === 'helpful').length;
    const harmfulCount = this.feedbackHistory.filter(f => f.signal === 'harmful').length;

    return {
      totalFeedback: this.feedbackHistory.length,
      helpfulCount,
      harmfulCount,
      uniqueMemories: uniqueMemories.size,
      activeSessions: this.sessionFeedback.size,
    };
  }
}

// Singleton instance
let utilityTrackerInstance: UtilityTracker | null = null;

export function getUtilityTracker(): UtilityTracker {
  if (!utilityTrackerInstance) {
    utilityTrackerInstance = new UtilityTracker();
  }
  return utilityTrackerInstance;
}
