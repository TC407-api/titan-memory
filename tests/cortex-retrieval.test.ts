/**
 * Cortex Retrieval Tests
 */

import { getRelevantCategories, checkSufficiency, filterByCategory, expandCategories, sortByCategoryRelevance } from '../src/cortex/retrieval';
import { MemoryEntry, MemoryLayer } from '../src/types';

describe('Cortex Retrieval', () => {
  const createMemory = (id: string, category?: string): MemoryEntry => ({
    id,
    content: `Content for ${id}`,
    layer: MemoryLayer.LONG_TERM,
    timestamp: new Date(),
    metadata: { category },
  });

  describe('getRelevantCategories', () => {
    it('should identify knowledge queries', () => {
      const cats = getRelevantCategories('What is the API rate limit?');
      expect(cats).toContain('knowledge');
    });

    it('should identify profile queries', () => {
      const cats = getRelevantCategories('What are my preferences for coding style?');
      expect(cats).toContain('profile');
    });

    it('should identify event queries', () => {
      const cats = getRelevantCategories('What happened yesterday with the deployment?');
      expect(cats).toContain('event');
    });
  });

  describe('checkSufficiency', () => {
    it('should report sufficient when all categories covered', () => {
      const memories = [
        createMemory('1', 'knowledge'),
        createMemory('2', 'profile'),
      ];
      const result = checkSufficiency(memories, ['knowledge', 'profile']);
      expect(result.sufficient).toBe(true);
      expect(result.coverageRatio).toBe(1);
    });

    it('should report insufficient when categories missing', () => {
      const memories = [createMemory('1', 'knowledge')];
      const result = checkSufficiency(memories, ['knowledge', 'profile']);
      expect(result.sufficient).toBe(false);
      expect(result.missingCategories).toContain('profile');
    });

    it('should return breakdown by category', () => {
      const memories = [
        createMemory('1', 'knowledge'),
        createMemory('2', 'knowledge'),
        createMemory('3', 'event'),
      ];
      const result = checkSufficiency(memories, ['knowledge', 'event']);
      expect(result.categoryBreakdown.knowledge).toBe(2);
      expect(result.categoryBreakdown.event).toBe(1);
    });
  });

  describe('filterByCategory', () => {
    it('should filter to specified categories', () => {
      const memories = [
        createMemory('1', 'knowledge'),
        createMemory('2', 'profile'),
        createMemory('3', 'event'),
      ];
      const filtered = filterByCategory(memories, ['knowledge', 'event']);
      expect(filtered).toHaveLength(2);
    });

    it('should return empty for no matches', () => {
      const memories = [createMemory('1', 'knowledge')];
      const filtered = filterByCategory(memories, ['event']);
      expect(filtered).toHaveLength(0);
    });
  });

  describe('expandCategories', () => {
    it('should expand knowledge to include skill and behavior', () => {
      const expanded = expandCategories(['knowledge']);
      expect(expanded).toContain('skill');
      expect(expanded).toContain('behavior');
    });

    it('should not duplicate categories', () => {
      const expanded = expandCategories(['knowledge', 'behavior']);
      const uniqueCount = new Set(expanded).size;
      expect(expanded.length).toBe(uniqueCount);
    });
  });

  describe('sortByCategoryRelevance', () => {
    it('should prioritize target categories', () => {
      const memories = [
        createMemory('1', 'profile'),
        createMemory('2', 'knowledge'),
        createMemory('3', 'event'),
      ];
      const sorted = sortByCategoryRelevance(memories, ['knowledge']);
      expect(sorted[0].id).toBe('2');
    });
  });
});
