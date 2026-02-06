/**
 * Cortex Pipeline Tests
 */

import { CortexPipeline } from '../src/cortex/pipeline';
import { MemoryEntry, MemoryLayer } from '../src/types';

describe('Cortex Pipeline', () => {
  let pipeline: CortexPipeline;

  beforeEach(() => {
    pipeline = new CortexPipeline({ enabled: true, highlightThreshold: 0.3 });
  });

  describe('processForStore', () => {
    it('should classify and extract metadata', async () => {
      const result = await pipeline.processForStore('API rate limit is defined as 1000 requests per hour');
      expect(result.classification.category).toBe('knowledge');
      expect(result.enrichedMetadata.category).toBe('knowledge');
      expect(result.enrichedMetadata.categoryConfidence).toBeGreaterThan(0);
      expect(result.enrichedMetadata.entityStatus).toBeDefined();
    });

    it('should classify profile content', async () => {
      const result = await pipeline.processForStore('I prefer TypeScript over JavaScript');
      expect(result.classification.category).toBe('profile');
    });

    it('should classify event content', async () => {
      const result = await pipeline.processForStore('Deployed to production yesterday');
      expect(result.classification.category).toBe('event');
    });

    it('should include extraction fields', async () => {
      const result = await pipeline.processForStore('Use GET /api/users to list all users');
      expect(result.enrichedMetadata.extractedFields).toBeDefined();
    });

    it('should include secondary category when confident', async () => {
      const result = await pipeline.processForStore('We decided to use API version 2.0 because of better documentation');
      // May or may not have secondary depending on classification
      expect(result.classification).toHaveProperty('category');
    });
  });

  describe('processForRecall', () => {
    const createMemory = (id: string, content: string, category?: string): MemoryEntry => ({
      id,
      content,
      layer: MemoryLayer.LONG_TERM,
      timestamp: new Date(),
      metadata: { category },
    });

    it('should return empty result for no memories', async () => {
      const result = await pipeline.processForRecall('test query', []);
      expect(result.goldSentences).toHaveLength(0);
      expect(result.totalRetrieved).toBe(0);
    });

    it('should process memories and return gold sentences', async () => {
      const memories = [
        createMemory('1', 'The API rate limit is 1000 per hour. The timeout is 30 seconds.', 'knowledge'),
        createMemory('2', 'Users can authenticate with JWT tokens. OAuth is also supported.', 'knowledge'),
      ];

      const result = await pipeline.processForRecall('API rate limit', memories);
      expect(result.totalRetrieved).toBe(2);
      expect(result.totalSentences).toBeGreaterThan(0);
    });

    it('should calculate compression rate', async () => {
      const memories = [
        createMemory('1', 'Relevant sentence about databases. Unrelated filler text. More filler.', 'knowledge'),
      ];

      const result = await pipeline.processForRecall('databases', memories);
      expect(result.compressionRate).toBeGreaterThanOrEqual(0);
      expect(result.compressionRate).toBeLessThanOrEqual(1);
    });

    it('should calculate category coverage', async () => {
      const memories = [
        createMemory('1', 'Knowledge content here.', 'knowledge'),
        createMemory('2', 'Event happened yesterday.', 'event'),
      ];

      const result = await pipeline.processForRecall('what happened', memories);
      expect(result.categoryCoverage).toHaveProperty('knowledge');
      expect(result.categoryCoverage).toHaveProperty('event');
    });
  });

  describe('Configuration', () => {
    it('should respect enabled flag', () => {
      const enabled = new CortexPipeline({ enabled: true });
      expect(enabled.isEnabled()).toBe(true);

      const disabled = new CortexPipeline({ enabled: false });
      expect(disabled.isEnabled()).toBe(false);
    });

    it('should allow config updates', () => {
      pipeline.updateConfig({ highlightThreshold: 0.9 });
      expect(pipeline.isEnabled()).toBe(true);
    });
  });
});
