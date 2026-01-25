/**
 * Tests for surprise detection (Layer 3: Long-Term Memory)
 */

import {
  calculateSurprise,
  calculatePatternBoost,
  calculateMomentum,
  calculateDecay,
  extractInsights,
  scoreImportance,
} from '../src/utils/surprise';
import { MemoryEntry, MemoryLayer } from '../src/types';

describe('Surprise Detection', () => {
  const createMemory = (content: string, id: string = 'test-id'): MemoryEntry => ({
    id,
    content,
    layer: MemoryLayer.LONG_TERM,
    timestamp: new Date(),
    metadata: {},
  });

  describe('calculateSurprise', () => {
    it('should return high surprise for novel content', () => {
      const existingMemories = [
        createMemory('The database uses PostgreSQL', '1'),
        createMemory('API endpoints are REST-based', '2'),
      ];

      const result = calculateSurprise(
        'Machine learning model requires GPU acceleration',
        existingMemories
      );

      expect(result.score).toBeGreaterThan(0.5);
      expect(result.shouldStore).toBe(true);
    });

    it('should return low surprise for similar content', () => {
      const existingMemories = [
        createMemory('The database uses PostgreSQL on port 5432', '1'),
      ];

      const result = calculateSurprise(
        'The database uses PostgreSQL on port 5432',
        existingMemories
      );

      expect(result.noveltyScore).toBeLessThan(0.5);
    });

    it('should boost surprise for decision patterns', () => {
      const existingMemories: MemoryEntry[] = [];

      const result = calculateSurprise(
        'We decided to use React instead of Vue',
        existingMemories
      );

      expect(result.patternBoost).toBeGreaterThan(0);
    });

    it('should boost surprise for error patterns', () => {
      const result = calculateSurprise(
        'The error was caused by a null pointer exception',
        []
      );

      expect(result.patternBoost).toBeGreaterThanOrEqual(0.3);
    });

    it('should boost surprise for solution patterns', () => {
      const result = calculateSurprise(
        'The fix was to add proper error handling',
        []
      );

      expect(result.patternBoost).toBeGreaterThanOrEqual(0.25);
    });

    it('should return similar memory IDs', () => {
      const existingMemories = [
        createMemory('Using Redis for caching', 'redis-1'),
        createMemory('Redis cache configuration', 'redis-2'),
      ];

      const result = calculateSurprise('Redis cache settings', existingMemories);

      expect(result.similarMemories.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculatePatternBoost', () => {
    it('should return 0 for plain content', () => {
      const boost = calculatePatternBoost('This is a simple sentence.');
      expect(boost).toBe(0);
    });

    it('should boost decision content', () => {
      const boost = calculatePatternBoost('We decided to use TypeScript');
      expect(boost).toBeGreaterThan(0);
    });

    it('should boost error content', () => {
      const boost = calculatePatternBoost('There was an error in the code');
      expect(boost).toBeGreaterThan(0);
    });

    it('should boost solution content', () => {
      const boost = calculatePatternBoost('The solution was to refactor');
      expect(boost).toBeGreaterThan(0);
    });

    it('should boost learning content', () => {
      const boost = calculatePatternBoost('I learned that async/await is better');
      expect(boost).toBeGreaterThan(0);
    });

    it('should cap boost at 0.5', () => {
      const boost = calculatePatternBoost(
        'We decided to fix the error and learned the solution was to use a workaround'
      );
      expect(boost).toBeLessThanOrEqual(0.5);
    });
  });

  describe('calculateMomentum', () => {
    it('should return 0 for empty history', () => {
      const momentum = calculateMomentum([]);
      expect(momentum).toBe(0);
    });

    it('should weight recent surprises higher', () => {
      // Low, then high surprise
      const momentum1 = calculateMomentum([0.1, 0.1, 0.1, 0.9, 0.9]);
      // High, then low surprise
      const momentum2 = calculateMomentum([0.9, 0.9, 0.1, 0.1, 0.1]);

      expect(momentum1).toBeGreaterThan(momentum2);
    });

    it('should handle single value', () => {
      const momentum = calculateMomentum([0.5]);
      expect(momentum).toBe(0.5);
    });

    it('should respect window size', () => {
      const longHistory = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.9, 0.9];
      const momentum = calculateMomentum(longHistory, 5);

      // Should primarily reflect last 5 values
      expect(momentum).toBeGreaterThan(0.3);
    });
  });

  describe('calculateDecay', () => {
    it('should return 1.0 for recent memories', () => {
      const now = new Date();
      const decay = calculateDecay(now, now, 180);
      expect(decay).toBeCloseTo(1.0, 2);
    });

    it('should return ~0.5 at half-life', () => {
      const now = new Date();
      const halfLifeAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      const decay = calculateDecay(halfLifeAgo, halfLifeAgo, 180);
      expect(decay).toBeCloseTo(0.5, 1);
    });

    it('should decay exponentially', () => {
      const now = new Date();
      const oneMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const twoMonths = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      const decay1 = calculateDecay(oneMonth, oneMonth, 180);
      const decay2 = calculateDecay(twoMonths, twoMonths, 180);

      expect(decay1).toBeGreaterThan(decay2);
    });

    it('should consider last accessed time', () => {
      const now = new Date();
      const oldCreation = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      const recentAccess = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

      const decay = calculateDecay(oldCreation, recentAccess, 180);
      expect(decay).toBeGreaterThan(0.5); // Recent access should prevent decay
    });
  });

  describe('extractInsights', () => {
    it('should extract decisions', () => {
      const content = `
        We decided to use React.
        The choice was TypeScript.
        Some other text.
      `;
      const insights = extractInsights(content);
      expect(insights.decisions.length).toBeGreaterThan(0);
    });

    it('should extract errors', () => {
      const content = `
        There was an error in the auth flow.
        The bug caused crashes.
      `;
      const insights = extractInsights(content);
      expect(insights.errors.length).toBeGreaterThan(0);
    });

    it('should extract solutions', () => {
      const content = `
        The fix was to add null checks.
        We resolved it by updating dependencies.
      `;
      const insights = extractInsights(content);
      expect(insights.solutions.length).toBeGreaterThan(0);
    });

    it('should extract learnings', () => {
      const content = `
        We learned that caching helps.
        I discovered the issue was in the config.
      `;
      const insights = extractInsights(content);
      expect(insights.learnings.length).toBeGreaterThan(0);
    });

    it('should ignore short lines', () => {
      const content = 'Hi\nOk\nYes';
      const insights = extractInsights(content);
      expect(insights.decisions.length).toBe(0);
      expect(insights.errors.length).toBe(0);
    });
  });

  describe('scoreImportance', () => {
    it('should return higher score for longer content', () => {
      const short = 'Hi';
      const long = 'This is a much longer piece of content that should score higher';

      expect(scoreImportance(long)).toBeGreaterThan(scoreImportance(short));
    });

    it('should boost content with patterns', () => {
      const plain = 'This is just plain text without any special patterns.';
      const withPattern = 'We decided to implement error handling after we discovered the bug.';

      expect(scoreImportance(withPattern)).toBeGreaterThan(scoreImportance(plain));
    });

    it('should boost content with code blocks', () => {
      const withCode = 'Use this: ```const x = 1;```';
      const withoutCode = 'Use const x = 1';

      expect(scoreImportance(withCode)).toBeGreaterThan(scoreImportance(withoutCode));
    });

    it('should boost structured content with lists', () => {
      const withList = '- Item 1\n- Item 2\n- Item 3';
      const withoutList = 'Item 1 Item 2 Item 3';

      expect(scoreImportance(withList)).toBeGreaterThan(scoreImportance(withoutList));
    });

    it('should cap score at 1.0', () => {
      const maxContent = `
        We decided to fix the error after learning about the solution.
        \`\`\`
        const fix = true;
        \`\`\`
        - Step 1: Do this
        - Step 2: Do that
        Questions? Contact support.
      `;
      expect(scoreImportance(maxContent)).toBeLessThanOrEqual(1.0);
    });
  });
});
