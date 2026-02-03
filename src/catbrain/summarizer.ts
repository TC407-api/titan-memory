/**
 * CatBrain Category Summarizer
 * Add/update only - NEVER deletes (from memU's category.py)
 * Maintains versioned summaries per category
 */

import { MemoryCategory, CategorySummary } from './types.js';

/**
 * Category Summarizer - maintains rolling summaries per category
 */
export class CategorySummarizer {
  private summaries: Map<MemoryCategory, CategorySummary> = new Map();

  /**
   * Update the summary for a category with new content
   * Add-only: never deletes existing summary data
   */
  updateSummary(category: MemoryCategory, content: string): CategorySummary {
    const existing = this.summaries.get(category);

    if (existing) {
      // Update existing: append key terms, increment version
      const newTerms = extractKeyTerms(content);
      const mergedTerms = mergeTerms(existing.keyTerms, newTerms);

      const updated: CategorySummary = {
        category,
        version: existing.version + 1,
        summary: updateSummaryText(existing.summary, content),
        entryCount: existing.entryCount + 1,
        lastUpdated: new Date(),
        keyTerms: mergedTerms,
      };

      this.summaries.set(category, updated);
      return updated;
    }

    // Create new
    const summary: CategorySummary = {
      category,
      version: 1,
      summary: generateInitialSummary(content),
      entryCount: 1,
      lastUpdated: new Date(),
      keyTerms: extractKeyTerms(content),
    };

    this.summaries.set(category, summary);
    return summary;
  }

  /**
   * Get summary for a specific category
   */
  getSummary(category: MemoryCategory): CategorySummary | undefined {
    return this.summaries.get(category);
  }

  /**
   * Get all summaries
   */
  getAllSummaries(): CategorySummary[] {
    return [...this.summaries.values()];
  }

  /**
   * Get summary statistics
   */
  getStats(): { totalCategories: number; totalEntries: number; avgVersion: number } {
    const all = this.getAllSummaries();
    const totalEntries = all.reduce((sum, s) => sum + s.entryCount, 0);
    const avgVersion = all.length > 0
      ? all.reduce((sum, s) => sum + s.version, 0) / all.length
      : 0;

    return {
      totalCategories: all.length,
      totalEntries,
      avgVersion,
    };
  }

  /**
   * Load summaries from serialized data
   */
  loadSummaries(data: CategorySummary[]): void {
    for (const summary of data) {
      this.summaries.set(summary.category, {
        ...summary,
        lastUpdated: new Date(summary.lastUpdated),
      });
    }
  }

  /**
   * Export all summaries for persistence
   */
  exportSummaries(): CategorySummary[] {
    return this.getAllSummaries();
  }
}

/**
 * Extract key terms from content
 */
function extractKeyTerms(content: string): string[] {
  const words = content
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);

  // Count frequency
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  // Return top terms by frequency
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term]) => term);
}

/**
 * Merge term lists, keeping unique terms
 */
function mergeTerms(existing: string[], newTerms: string[]): string[] {
  const set = new Set([...existing, ...newTerms]);
  // Cap at 20 terms
  return [...set].slice(0, 20);
}

/**
 * Generate initial summary from first content
 */
function generateInitialSummary(content: string): string {
  // Take first 200 chars as initial summary
  const trimmed = content.trim();
  if (trimmed.length <= 200) return trimmed;
  return trimmed.substring(0, 200) + '...';
}

/**
 * Update summary text with new content (append, never replace)
 */
function updateSummaryText(existing: string, newContent: string): string {
  const newSnippet = newContent.trim().substring(0, 100);
  const updated = `${existing} | ${newSnippet}`;
  // Cap at 500 chars
  if (updated.length > 500) {
    return updated.substring(0, 500) + '...';
  }
  return updated;
}
