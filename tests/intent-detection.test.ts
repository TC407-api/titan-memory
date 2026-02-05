/**
 * Tests for Intent-Aware Retrieval
 * Titan Memory v2.0 - Competitive Upgrade
 */

import {
  detectIntent,
  getSearchConfig,
  matchesIntent,
  getAllMatchingIntents,
  IntentDetector,
  QueryIntent,
} from '../src/retrieval/intent';
import { MemoryLayer } from '../src/types';

describe('Intent Detection', () => {
  describe('detectIntent', () => {
    describe('factual_lookup', () => {
      it('should detect "what is" queries', () => {
        const intent = detectIntent('What is the API key format?');
        expect(intent.type).toBe('factual_lookup');
        expect(intent.confidence).toBeGreaterThan(0.7);
        expect(intent.priorityLayer).toBe(MemoryLayer.FACTUAL);
      });

      it('should detect definition queries', () => {
        const intent = detectIntent('Define the meaning of JWT token');
        expect(intent.type).toBe('factual_lookup');
        expect(intent.searchStrategy).toBe('exact');
      });

      it('should detect configuration queries', () => {
        const intent = detectIntent('What is the configuration for the database?');
        expect(intent.type).toBe('factual_lookup');
      });
    });

    describe('pattern_match', () => {
      it('should detect "how to" queries', () => {
        const intent = detectIntent('How to implement authentication?');
        expect(intent.type).toBe('pattern_match');
        expect(intent.priorityLayer).toBe(MemoryLayer.SEMANTIC);
      });

      it('should detect pattern queries', () => {
        const intent = detectIntent('What pattern should we use for state management?');
        expect(intent.type).toBe('pattern_match');
        expect(intent.searchStrategy).toBe('semantic');
      });

      it('should detect best practice queries', () => {
        // "best practice" matches pattern_match patterns
        const intent = detectIntent('The best practice for error handling is...');
        expect(intent.type).toBe('pattern_match');
      });
    });

    describe('timeline_query', () => {
      it('should detect "when did" queries', () => {
        const intent = detectIntent('When did we deploy the feature?');
        expect(intent.type).toBe('timeline_query');
        expect(intent.priorityLayer).toBe(MemoryLayer.EPISODIC);
      });

      it('should detect "yesterday" queries', () => {
        const intent = detectIntent('What did I work on yesterday?');
        expect(intent.type).toBe('timeline_query');
        expect(intent.searchStrategy).toBe('temporal');
      });

      it('should detect "last time" queries', () => {
        const intent = detectIntent('Last time we fixed this bug, what was the solution?');
        expect(intent.type).toBe('timeline_query');
      });

      it('should detect history queries', () => {
        const intent = detectIntent('Show me the history of changes to the auth system');
        expect(intent.type).toBe('timeline_query');
      });
    });

    describe('preference_check', () => {
      it('should detect preference queries', () => {
        const intent = detectIntent('I prefer using TypeScript for this project');
        expect(intent.type).toBe('preference_check');
      });

      it('should detect style queries', () => {
        // "my style" triggers preference_check without "what is" factual trigger
        const intent = detectIntent('I prefer my coding style for React components');
        expect(intent.type).toBe('preference_check');
      });
    });

    describe('error_lookup', () => {
      it('should detect error queries', () => {
        const intent = detectIntent('I am getting an error with the database connection');
        expect(intent.type).toBe('error_lookup');
        expect(intent.searchStrategy).toBe('semantic');
      });

      it('should detect fix queries', () => {
        // "fix for" and "bug" trigger error_lookup
        const intent = detectIntent('Looking for a fix for this authentication bug');
        expect(intent.type).toBe('error_lookup');
      });

      it('should detect debug queries', () => {
        const intent = detectIntent('Help me debug this issue');
        expect(intent.type).toBe('error_lookup');
      });
    });

    describe('decision_review', () => {
      it('should detect "why did we" queries', () => {
        const intent = detectIntent('Why did we choose PostgreSQL over MongoDB?');
        expect(intent.type).toBe('decision_review');
      });

      it('should detect rationale queries', () => {
        const intent = detectIntent('What was the rationale for using microservices?');
        expect(intent.type).toBe('decision_review');
      });

      it('should detect trade-off queries', () => {
        // "chose" triggers decision_review
        const intent = detectIntent('We chose this approach after considering trade-offs');
        expect(intent.type).toBe('decision_review');
      });
    });

    describe('exploration (fallback)', () => {
      it('should fall back to exploration for vague queries', () => {
        const intent = detectIntent('project status');
        expect(intent.type).toBe('exploration');
        expect(intent.confidence).toBeLessThan(0.7);
        expect(intent.searchStrategy).toBe('hybrid');
      });

      it('should search all layers for exploration', () => {
        const intent = detectIntent('anything related to the frontend');
        expect(intent.suggestedLayers).toContain(MemoryLayer.LONG_TERM);
      });
    });
  });

  describe('getSearchConfig', () => {
    it('should return exact match config for factual lookups', () => {
      const intent: QueryIntent = {
        type: 'factual_lookup',
        confidence: 0.9,
        suggestedLayers: [MemoryLayer.FACTUAL],
        priorityLayer: MemoryLayer.FACTUAL,
        searchStrategy: 'exact',
        explanation: 'test',
      };

      const config = getSearchConfig(intent);
      expect(config.useExactMatch).toBe(true);
      expect(config.priorityMultiplier).toBe(2.0);
    });

    it('should return temporal ordering for timeline queries', () => {
      const intent: QueryIntent = {
        type: 'timeline_query',
        confidence: 0.9,
        suggestedLayers: [MemoryLayer.EPISODIC],
        priorityLayer: MemoryLayer.EPISODIC,
        searchStrategy: 'temporal',
        explanation: 'test',
      };

      const config = getSearchConfig(intent);
      expect(config.useTemporalOrdering).toBe(true);
      expect(config.limitPerLayer).toBe(15);
    });
  });

  describe('matchesIntent', () => {
    it('should return true for high-confidence matches', () => {
      // Use a query that strongly matches pattern_match (multiple pattern words)
      expect(matchesIntent('How to implement the best approach for this strategy?', 'pattern_match')).toBe(true);
    });

    it('should return false for low-confidence matches', () => {
      expect(matchesIntent('random query', 'factual_lookup')).toBe(false);
    });
  });

  describe('getAllMatchingIntents', () => {
    it('should return multiple matching intents', () => {
      // Query that could match multiple intents
      const intents = getAllMatchingIntents(
        'How do I fix this error that happened yesterday?',
        0.5
      );

      expect(intents.length).toBeGreaterThan(0);
      const intentTypes = intents.map(i => i.type);
      expect(intentTypes).toContain('error_lookup');
    });

    it('should sort by confidence descending', () => {
      const intents = getAllMatchingIntents('What is the best approach for handling errors?', 0.5);

      for (let i = 1; i < intents.length; i++) {
        expect(intents[i - 1].confidence).toBeGreaterThanOrEqual(intents[i].confidence);
      }
    });
  });
});

describe('IntentDetector', () => {
  let detector: IntentDetector;

  beforeEach(() => {
    detector = new IntentDetector();
  });

  describe('detect', () => {
    it('should detect and track intents', () => {
      const intent1 = detector.detect('What is the API key?');
      const intent2 = detector.detect('How to implement auth?');

      expect(intent1.type).toBe('factual_lookup');
      expect(intent2.type).toBe('pattern_match');
    });

    it('should maintain history', () => {
      detector.detect('Query 1');
      detector.detect('Query 2');
      detector.detect('Query 3');

      const stats = detector.getStats();
      expect(stats.totalQueries).toBe(3);
    });
  });

  describe('getIntentDistribution', () => {
    it('should track intent distribution', () => {
      detector.detect('What is X?');
      detector.detect('What is Y?');
      detector.detect('How to do Z?');

      const distribution = detector.getIntentDistribution();
      expect(distribution.factual_lookup).toBe(2);
      expect(distribution.pattern_match).toBe(1);
    });
  });

  describe('getQueriesByIntent', () => {
    it('should filter queries by intent type', () => {
      detector.detect('What is API?');
      detector.detect('How to auth?');
      detector.detect('What is config?');

      const factualQueries = detector.getQueriesByIntent('factual_lookup');
      expect(factualQueries).toHaveLength(2);
      expect(factualQueries).toContain('What is API?');
      expect(factualQueries).toContain('What is config?');
    });
  });

  describe('getStats', () => {
    it('should calculate average confidence', () => {
      detector.detect('What is the API key?'); // High confidence
      detector.detect('random gibberish');      // Low confidence

      const stats = detector.getStats();
      expect(stats.avgConfidence).toBeGreaterThan(0);
      expect(stats.avgConfidence).toBeLessThan(1);
    });
  });

  describe('clearHistory', () => {
    it('should clear all history', () => {
      detector.detect('Query 1');
      detector.detect('Query 2');
      detector.clearHistory();

      const stats = detector.getStats();
      expect(stats.totalQueries).toBe(0);
    });
  });
});
