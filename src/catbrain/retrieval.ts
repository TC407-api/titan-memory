/**
 * CatBrain Hierarchical Retrieval
 * Category-aware retrieval wrapping fuseResults
 */

import { MemoryEntry } from '../types.js';
import { MemoryCategory, SufficiencyResult } from './types.js';
import { classifyContent } from './classifier.js';

/**
 * Determine which categories are relevant for a query
 */
export function getRelevantCategories(query: string): MemoryCategory[] {
  const classification = classifyContent(query);
  const categories: MemoryCategory[] = [classification.category];

  if (classification.secondaryCategory) {
    categories.push(classification.secondaryCategory);
  }

  return categories;
}

/**
 * Check sufficiency of recall results across categories
 */
export function checkSufficiency(
  memories: MemoryEntry[],
  targetCategories: MemoryCategory[]
): SufficiencyResult {
  const categoryBreakdown: Record<MemoryCategory, number> = {
    knowledge: 0,
    profile: 0,
    event: 0,
    behavior: 0,
    skill: 0,
  };

  for (const memory of memories) {
    const category = memory.metadata?.category as MemoryCategory | undefined;
    if (category && category in categoryBreakdown) {
      categoryBreakdown[category]++;
    }
  }

  const missingCategories = targetCategories.filter(cat => categoryBreakdown[cat] === 0);
  const coveredCount = targetCategories.filter(cat => categoryBreakdown[cat] > 0).length;
  const coverageRatio = targetCategories.length > 0
    ? coveredCount / targetCategories.length
    : 1;

  return {
    sufficient: missingCategories.length === 0,
    coverageRatio,
    missingCategories,
    categoryBreakdown,
  };
}

/**
 * Filter memories by category
 */
export function filterByCategory(
  memories: MemoryEntry[],
  categories: MemoryCategory[]
): MemoryEntry[] {
  return memories.filter(m => {
    const category = m.metadata?.category as MemoryCategory | undefined;
    return category && categories.includes(category);
  });
}

/**
 * Expand retrieval to adjacent categories if insufficient
 */
export function expandCategories(
  current: MemoryCategory[]
): MemoryCategory[] {
  const adjacencyMap: Record<MemoryCategory, MemoryCategory[]> = {
    knowledge: ['skill', 'behavior'],
    profile: ['behavior'],
    event: ['behavior', 'knowledge'],
    behavior: ['skill', 'knowledge', 'event'],
    skill: ['knowledge', 'behavior'],
  };

  const expanded = new Set(current);
  for (const cat of current) {
    for (const adj of adjacencyMap[cat]) {
      expanded.add(adj);
    }
  }

  return [...expanded];
}

/**
 * Sort memories by category relevance to query
 */
export function sortByCategoryRelevance(
  memories: MemoryEntry[],
  targetCategories: MemoryCategory[]
): MemoryEntry[] {
  return [...memories].sort((a, b) => {
    const catA = a.metadata?.category as MemoryCategory | undefined;
    const catB = b.metadata?.category as MemoryCategory | undefined;

    const scoreA = catA && targetCategories.includes(catA) ? 1 : 0;
    const scoreB = catB && targetCategories.includes(catB) ? 1 : 0;

    return scoreB - scoreA;
  });
}
