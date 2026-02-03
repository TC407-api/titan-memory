/**
 * CatBrain Category-Aware Merge Strategy
 * Different merge rules per category type
 */

import { MemoryCategory, MergeResult } from './types.js';
import { MemoryEntry } from '../types.js';

/**
 * Category-aware merge: determines how to handle duplicate/similar memories
 */
export function mergeByCategory(
  existing: MemoryEntry,
  incoming: MemoryEntry,
  category: MemoryCategory
): MergeResult {
  switch (category) {
    case 'knowledge':
      return mergeKnowledge(existing, incoming);
    case 'profile':
      return mergeProfile(existing, incoming);
    case 'event':
      return mergeEvent(existing, incoming);
    case 'behavior':
      return mergeBehavior(existing, incoming);
    case 'skill':
      return mergeSkill(existing, incoming);
  }
}

/**
 * Knowledge: merge definitions, keep latest for conflicts
 */
function mergeKnowledge(existing: MemoryEntry, incoming: MemoryEntry): MergeResult {
  const existingTime = new Date(existing.timestamp).getTime();
  const incomingTime = new Date(incoming.timestamp).getTime();

  // If very similar content, keep the newer one
  if (contentSimilarity(existing.content, incoming.content) > 0.8) {
    if (incomingTime > existingTime) {
      return {
        action: 'replaced',
        reason: 'Newer knowledge definition supersedes older',
        resultContent: incoming.content,
      };
    }
    return { action: 'skipped', reason: 'Older duplicate knowledge' };
  }

  // Different enough to merge
  return {
    action: 'merged',
    reason: 'Complementary knowledge merged',
    resultContent: `${existing.content}\n\n${incoming.content}`,
  };
}

/**
 * Profile: always replace with newest (preferences change)
 */
function mergeProfile(_existing: MemoryEntry, incoming: MemoryEntry): MergeResult {
  return {
    action: 'replaced',
    reason: 'Profile preferences updated to latest',
    resultContent: incoming.content,
  };
}

/**
 * Event: keep all (events are immutable historical records)
 */
function mergeEvent(_existing: MemoryEntry, _incoming: MemoryEntry): MergeResult {
  return {
    action: 'kept',
    reason: 'Events are immutable - both kept',
  };
}

/**
 * Behavior: merge patterns, track evolution
 */
function mergeBehavior(existing: MemoryEntry, incoming: MemoryEntry): MergeResult {
  if (contentSimilarity(existing.content, incoming.content) > 0.9) {
    return { action: 'skipped', reason: 'Near-duplicate behavior pattern' };
  }

  return {
    action: 'merged',
    reason: 'Behavior pattern evolution tracked',
    resultContent: `${existing.content}\n\n[Updated] ${incoming.content}`,
  };
}

/**
 * Skill: merge steps, keep best version
 */
function mergeSkill(existing: MemoryEntry, incoming: MemoryEntry): MergeResult {
  const existingTime = new Date(existing.timestamp).getTime();
  const incomingTime = new Date(incoming.timestamp).getTime();

  // Newer skill instructions supersede
  if (incomingTime > existingTime) {
    return {
      action: 'replaced',
      reason: 'Skill instructions updated to latest version',
      resultContent: incoming.content,
    };
  }

  return { action: 'skipped', reason: 'Older skill version' };
}

/**
 * Simple content similarity (Jaccard on word sets)
 */
function contentSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}
