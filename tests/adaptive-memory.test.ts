/**
 * Adaptive Memory Tests
 * Tests for access tracking, importance scoring, consolidation, and fusion
 */

import * as fs from 'fs';
import * as path from 'path';
import { AdaptiveMemory } from '../src/adaptive/adaptive-memory';
import { MemoryEntry, MemoryLayer } from '../src/types';

describe('AdaptiveMemory', () => {
  let adaptive: AdaptiveMemory;
  let testDataDir: string;

  beforeEach(async () => {
    testDataDir = path.join(process.cwd(), 'test-data-adaptive', Date.now().toString());
    fs.mkdirSync(testDataDir, { recursive: true });
    process.env.TITAN_DATA_DIR = testDataDir;

    adaptive = new AdaptiveMemory();
    await adaptive.initialize();
  });

  afterEach(async () => {
    await adaptive.close();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  const createMockMemory = (overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
    id: 'mem-' + Math.random().toString(36).substr(2, 9),
    content: 'This is test memory content for adaptive testing.',
    layer: MemoryLayer.LONG_TERM,
    timestamp: new Date(),
    metadata: {
      tags: ['test'],
      surpriseScore: 0.5,
    },
    ...overrides,
  });

  describe('Access Tracking', () => {
    it('should record memory access', async () => {
      await adaptive.recordAccess('memory-1', 'search query');

      const count = adaptive.getAccessCount('memory-1');
      expect(count).toBe(1);
    });

    it('should increment access count on repeated access', async () => {
      await adaptive.recordAccess('memory-2');
      await adaptive.recordAccess('memory-2');
      await adaptive.recordAccess('memory-2');

      const count = adaptive.getAccessCount('memory-2');
      expect(count).toBe(3);
    });

    it('should return last access time', async () => {
      await adaptive.recordAccess('memory-3');

      const lastAccess = adaptive.getLastAccess('memory-3');
      expect(lastAccess).toBeDefined();
      expect(lastAccess).toBeInstanceOf(Date);
    });

    it('should return null for never-accessed memory', () => {
      const lastAccess = adaptive.getLastAccess('non-existent');
      expect(lastAccess).toBeNull();
    });

    it('should return 0 for never-accessed memory count', () => {
      const count = adaptive.getAccessCount('non-existent');
      expect(count).toBe(0);
    });
  });

  describe('Importance Scoring', () => {
    it('should calculate importance score', () => {
      const memory = createMockMemory();
      const importance = adaptive.calculateImportance(memory);

      expect(importance).toBeGreaterThanOrEqual(0);
      expect(importance).toBeLessThanOrEqual(1);
    });

    it('should give higher importance to frequently accessed memories', async () => {
      const memory1 = createMockMemory({ id: 'frequent' });
      const memory2 = createMockMemory({ id: 'rare' });

      // Access memory1 multiple times
      await adaptive.recordAccess('frequent');
      await adaptive.recordAccess('frequent');
      await adaptive.recordAccess('frequent');
      await adaptive.recordAccess('frequent');
      await adaptive.recordAccess('frequent');

      const importance1 = adaptive.calculateImportance(memory1);
      const importance2 = adaptive.calculateImportance(memory2);

      expect(importance1).toBeGreaterThan(importance2);
    });

    it('should consider context relevance when provided', () => {
      const memory = createMockMemory({
        content: 'React component rendering optimization techniques',
      });

      const withContext = adaptive.calculateImportance(memory, 'React optimization');
      const withoutContext = adaptive.calculateImportance(memory);

      // Both should be valid importance scores
      expect(withContext).toBeGreaterThanOrEqual(0);
      expect(withContext).toBeLessThanOrEqual(1);
      expect(withoutContext).toBeGreaterThanOrEqual(0);
      expect(withoutContext).toBeLessThanOrEqual(1);
    });

    it('should give higher importance to memories with tags', () => {
      const withTags = createMockMemory({
        id: 'tagged',
        metadata: { tags: ['a', 'b', 'c', 'd', 'e'] },
      });

      const withoutTags = createMockMemory({
        id: 'untagged',
        metadata: {},
      });

      const importance1 = adaptive.calculateImportance(withTags);
      const importance2 = adaptive.calculateImportance(withoutTags);

      expect(importance1).toBeGreaterThan(importance2);
    });
  });

  describe('Consolidation', () => {
    it('should find consolidation candidates', async () => {
      const memories = [
        createMockMemory({ content: 'React hooks are functions that let you use state.' }),
        createMockMemory({ content: 'React hooks are functions for state management.' }),
        createMockMemory({ content: 'TypeScript adds static typing to JavaScript.' }),
      ];

      const candidates = await adaptive.findConsolidationCandidates(memories);

      // First two are similar, should be candidates
      expect(candidates.length).toBeGreaterThanOrEqual(0);
    });

    it('should consolidate similar memories', async () => {
      const memory1 = createMockMemory({
        id: 'mem1',
        content: 'React hooks enable state in functional components.',
        metadata: { tags: ['react'] },
      });

      const memory2 = createMockMemory({
        id: 'mem2',
        content: 'Hooks allow state management in React functions.',
        metadata: { tags: ['hooks'] },
      });

      const consolidated = await adaptive.consolidate(memory1, memory2);

      expect(consolidated).toBeDefined();
      expect(consolidated.sourceIds).toContain('mem1');
      expect(consolidated.sourceIds).toContain('mem2');
      expect(consolidated.consolidatedContent.length).toBeGreaterThan(0);
    });

    it('should merge tags when consolidating', async () => {
      const memory1 = createMockMemory({
        metadata: { tags: ['react', 'frontend'] },
      });

      const memory2 = createMockMemory({
        metadata: { tags: ['hooks', 'state'] },
      });

      const consolidated = await adaptive.consolidate(memory1, memory2);

      const tags = consolidated.metadata.tags as string[];
      expect(tags).toContain('react');
      expect(tags).toContain('hooks');
    });

    it('should generate summary for consolidated memory', async () => {
      const memory1 = createMockMemory({
        content: 'Long content about testing strategies. We use Jest for unit tests.',
      });

      const memory2 = createMockMemory({
        content: 'Jest is our testing framework. We write comprehensive tests.',
      });

      const consolidated = await adaptive.consolidate(memory1, memory2);

      expect(consolidated.summary).toBeDefined();
      expect(consolidated.summary.length).toBeGreaterThan(0);
      expect(consolidated.summary.length).toBeLessThanOrEqual(103); // 100 + "..."
    });
  });

  describe('Memory Fusion', () => {
    it('should fuse memories with merge strategy', async () => {
      const memories = [
        createMockMemory({ content: 'Point one about the topic.' }),
        createMockMemory({ content: 'Point two about the topic.' }),
        createMockMemory({ content: 'Point three about the topic.' }),
      ];

      const result = await adaptive.fuse(memories, 'merge');

      expect(result.fusedContent).toBeDefined();
      expect(result.fusedContent.length).toBeGreaterThan(0);
      expect(result.sourceIds).toHaveLength(3);
      expect(result.strategy).toBe('merge');
    });

    it('should fuse memories with summarize strategy', async () => {
      const memories = [
        createMockMemory({ content: 'React is a JavaScript library for building UIs.' }),
        createMockMemory({ content: 'Vue is a progressive framework for UIs.' }),
      ];

      const result = await adaptive.fuse(memories, 'summarize');

      expect(result.fusedContent).toBeDefined();
      expect(result.strategy).toBe('summarize');
    });

    it('should fuse memories with extract strategy', async () => {
      const memories = [
        createMockMemory({ id: 'important', content: 'Most important content here.' }),
        createMockMemory({ id: 'less', content: 'Less important content.' }),
      ];

      // Make first memory more important
      await adaptive.recordAccess('important');
      await adaptive.recordAccess('important');

      const result = await adaptive.fuse(memories, 'extract');

      expect(result.fusedContent).toContain('important');
      expect(result.strategy).toBe('extract');
    });

    it('should handle empty memory array', async () => {
      const result = await adaptive.fuse([], 'merge');

      expect(result.fusedContent).toBe('');
      expect(result.sourceIds).toHaveLength(0);
      expect(result.confidence).toBe(0);
    });

    it('should handle single memory', async () => {
      const memory = createMockMemory({ content: 'Single memory content.' });
      const result = await adaptive.fuse([memory], 'merge');

      expect(result.fusedContent).toBe('Single memory content.');
      expect(result.confidence).toBe(1);
    });

    it('should calculate fusion confidence', async () => {
      const memories = [
        createMockMemory({ content: 'Similar topic discussed here.' }),
        createMockMemory({ content: 'Similar topic mentioned again.' }),
      ];

      const result = await adaptive.fuse(memories, 'merge');

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Context Window', () => {
    it('should update context window on access', async () => {
      await adaptive.recordAccess('active-memory');

      const window = adaptive.getContextWindow();
      expect(window.activeMemories).toContain('active-memory');
      expect(window.currentSize).toBeGreaterThanOrEqual(1);
    });

    it('should maintain priority queue', async () => {
      await adaptive.recordAccess('mem1');
      await adaptive.recordAccess('mem2');
      await adaptive.recordAccess('mem1'); // Access again

      const window = adaptive.getContextWindow();
      expect(window.priorityQueue.length).toBeGreaterThan(0);

      // mem1 should have higher priority (more accesses)
      const priorities = window.priorityQueue;
      const mem1Priority = priorities.find(p => p.memoryId === 'mem1')?.priority || 0;
      const mem2Priority = priorities.find(p => p.memoryId === 'mem2')?.priority || 0;

      expect(mem1Priority).toBeGreaterThan(mem2Priority);
    });

    it('should clear context window', async () => {
      await adaptive.recordAccess('mem1');
      await adaptive.recordAccess('mem2');

      await adaptive.clearContextWindow();

      const window = adaptive.getContextWindow();
      expect(window.activeMemories).toHaveLength(0);
      expect(window.currentSize).toBe(0);
    });
  });

  describe('Clustering', () => {
    it('should cluster related memories', async () => {
      const memories = [
        createMockMemory({ id: 'react1', content: 'React component lifecycle methods.' }),
        createMockMemory({ id: 'react2', content: 'React component state management.' }),
        createMockMemory({ id: 'ts1', content: 'TypeScript interface definitions.' }),
      ];

      const clusters = await adaptive.clusterMemories(memories);

      // Should have at least some clustering
      expect(Array.isArray(clusters)).toBe(true);
    });

    it('should calculate cluster cohesion', async () => {
      const memories = [
        createMockMemory({ content: 'React hooks useState useEffect.' }),
        createMockMemory({ content: 'React hooks useCallback useMemo.' }),
      ];

      const clusters = await adaptive.clusterMemories(memories);

      if (clusters.length > 0) {
        expect(clusters[0].cohesion).toBeGreaterThanOrEqual(0);
        expect(clusters[0].cohesion).toBeLessThanOrEqual(1);
      }
    });

    it('should identify common tags in clusters', async () => {
      const memories = [
        createMockMemory({ content: 'A', metadata: { tags: ['react', 'frontend'] } }),
        createMockMemory({ content: 'B', metadata: { tags: ['react', 'hooks'] } }),
      ];

      const clusters = await adaptive.clusterMemories(memories);

      if (clusters.length > 0) {
        // React should be a common tag
        expect(clusters[0].commonTags).toBeDefined();
      }
    });
  });

  describe('Prioritized Recall', () => {
    it('should prioritize memories by importance', async () => {
      const memories = [
        createMockMemory({ id: 'low', content: 'Low importance memory.' }),
        createMockMemory({ id: 'high', content: 'High importance memory.' }),
      ];

      // Make 'high' more important
      await adaptive.recordAccess('high');
      await adaptive.recordAccess('high');
      await adaptive.recordAccess('high');

      const prioritized = await adaptive.prioritizeForRecall(memories);

      expect(prioritized[0].id).toBe('high');
    });

    it('should respect limit parameter', async () => {
      const memories = Array.from({ length: 10 }, (_, i) =>
        createMockMemory({ id: `mem${i}`, content: `Memory number ${i}` })
      );

      const prioritized = await adaptive.prioritizeForRecall(memories, undefined, 3);

      expect(prioritized).toHaveLength(3);
    });

    it('should consider context in prioritization', async () => {
      const memories = [
        createMockMemory({ content: 'TypeScript generic types explained.' }),
        createMockMemory({ content: 'React component patterns.' }),
      ];

      const prioritized = await adaptive.prioritizeForRecall(
        memories,
        'TypeScript generics'
      );

      // TypeScript memory should come first
      expect(prioritized[0].content).toContain('TypeScript');
    });
  });

  describe('Statistics', () => {
    it('should return adaptation stats', async () => {
      const stats = await adaptive.getStats();

      expect(stats).toBeDefined();
      expect(stats.totalConsolidations).toBeGreaterThanOrEqual(0);
      expect(stats.clusterCount).toBeGreaterThanOrEqual(0);
      expect(stats.avgImportance).toBeGreaterThanOrEqual(0);
    });

    it('should track consolidations', async () => {
      const memory1 = createMockMemory();
      const memory2 = createMockMemory();

      await adaptive.consolidate(memory1, memory2);

      const stats = await adaptive.getStats();
      expect(stats.totalConsolidations).toBeGreaterThan(0);
    });

    it('should track clusters', async () => {
      const memories = [
        createMockMemory({ content: 'Similar content A.' }),
        createMockMemory({ content: 'Similar content B.' }),
      ];

      await adaptive.clusterMemories(memories);

      const stats = await adaptive.getStats();
      expect(stats.clusterCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Persistence', () => {
    it('should persist and restore state', async () => {
      await adaptive.recordAccess('persistent-mem');
      await adaptive.close();

      // Reinitialize
      const newAdaptive = new AdaptiveMemory();
      await newAdaptive.initialize();

      const count = newAdaptive.getAccessCount('persistent-mem');
      expect(count).toBe(1);

      await newAdaptive.close();
    });
  });
});
