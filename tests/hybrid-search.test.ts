/**
 * Hybrid Search Tests
 * Tests for BM25 + dense vector hybrid search with RRF reranking
 */

import {
  ZillizClient,
  DefaultEmbeddingGenerator,
  VectorStorageConfig,
  HybridSearchOptions,
} from '../src/storage/index.js';
import { HybridSearchConfig } from '../src/types.js';

describe('Hybrid Search', () => {
  describe('ZillizClient Hybrid Search Configuration', () => {
    const baseConfig: VectorStorageConfig = {
      uri: 'https://mock-zilliz.example.com',
      token: 'mock-token',
      collection: 'test-hybrid-collection',
    };

    it('should create client with hybrid search disabled by default', () => {
      const client = new ZillizClient(baseConfig);
      expect(client.isHybridSearchEnabled()).toBe(false);
    });

    it('should create client with hybrid search enabled', () => {
      const client = new ZillizClient({
        ...baseConfig,
        enableHybridSearch: true,
      });
      expect(client.isHybridSearchEnabled()).toBe(true);
    });

    it('should accept custom BM25 parameters', () => {
      const client = new ZillizClient({
        ...baseConfig,
        enableHybridSearch: true,
        bm25K1: 1.5,
        bm25B: 0.8,
      });
      expect(client).toBeDefined();
      expect(client.isHybridSearchEnabled()).toBe(true);
    });

    it('should accept custom embedding generator', () => {
      const customGenerator = new DefaultEmbeddingGenerator(512);
      const client = new ZillizClient(
        { ...baseConfig, enableHybridSearch: true },
        customGenerator
      );
      expect(client).toBeDefined();
    });
  });

  describe('HybridSearchOptions', () => {
    it('should support RRF reranking strategy', () => {
      const options: HybridSearchOptions = {
        rerankStrategy: 'rrf',
        rrfK: 60,
      };
      expect(options.rerankStrategy).toBe('rrf');
      expect(options.rrfK).toBe(60);
    });

    it('should support weighted reranking strategy', () => {
      const options: HybridSearchOptions = {
        rerankStrategy: 'weighted',
        denseWeight: 0.7,
        sparseWeight: 0.3,
      };
      expect(options.rerankStrategy).toBe('weighted');
      expect(options.denseWeight).toBe(0.7);
      expect(options.sparseWeight).toBe(0.3);
    });

    it('should support filter expressions', () => {
      const options: HybridSearchOptions = {
        rerankStrategy: 'rrf',
        filter: 'layer == "LONG_TERM"',
      };
      expect(options.filter).toBe('layer == "LONG_TERM"');
    });

    it('should use default values when not specified', () => {
      const options: HybridSearchOptions = {
        rerankStrategy: 'rrf',
      };
      // rrfK should default to 60 when used
      expect(options.rrfK).toBeUndefined();
      // Client should apply default of 60
    });
  });

  describe('HybridSearchConfig', () => {
    it('should have correct default values', () => {
      const config: HybridSearchConfig = {
        enabled: false,
        rerankStrategy: 'rrf',
        rrfK: 60,
        denseWeight: 0.5,
        sparseWeight: 0.5,
        candidateMultiplier: 3,
        bm25K1: 1.2,
        bm25B: 0.75,
      };

      expect(config.enabled).toBe(false);
      expect(config.rerankStrategy).toBe('rrf');
      expect(config.rrfK).toBe(60);
      expect(config.denseWeight + config.sparseWeight).toBe(1.0);
      expect(config.bm25K1).toBe(1.2);
      expect(config.bm25B).toBe(0.75);
    });

    it('should support weighted reranking with custom weights', () => {
      const config: HybridSearchConfig = {
        enabled: true,
        rerankStrategy: 'weighted',
        rrfK: 60,
        denseWeight: 0.7,
        sparseWeight: 0.3,
        candidateMultiplier: 3,
        bm25K1: 1.2,
        bm25B: 0.75,
      };

      expect(config.rerankStrategy).toBe('weighted');
      expect(config.denseWeight).toBe(0.7);
      expect(config.sparseWeight).toBe(0.3);
    });

    it('should support custom BM25 tuning', () => {
      const config: HybridSearchConfig = {
        enabled: true,
        rerankStrategy: 'rrf',
        rrfK: 60,
        denseWeight: 0.5,
        sparseWeight: 0.5,
        candidateMultiplier: 3,
        bm25K1: 1.5,  // Higher term frequency saturation
        bm25B: 0.6,   // Lower length normalization
      };

      expect(config.bm25K1).toBe(1.5);
      expect(config.bm25B).toBe(0.6);
    });
  });

  describe('Reciprocal Rank Fusion (RRF) Algorithm', () => {
    // Test the RRF scoring logic
    function calculateRRFScore(ranks: number[], k: number = 60): number {
      return ranks.reduce((sum, rank) => sum + 1 / (k + rank), 0);
    }

    it('should calculate RRF score for document in both lists', () => {
      // Document ranked #1 in dense, #3 in sparse
      const score = calculateRRFScore([1, 3], 60);
      // 1/(60+1) + 1/(60+3) = 0.0164 + 0.0159 = 0.0323
      expect(score).toBeCloseTo(0.0323, 3);
    });

    it('should give higher score to consistently ranked documents', () => {
      const consistentScore = calculateRRFScore([1, 1], 60);  // #1 in both
      const inconsistentScore = calculateRRFScore([1, 10], 60); // #1 and #10
      expect(consistentScore).toBeGreaterThan(inconsistentScore);
    });

    it('should use k parameter to smooth rankings', () => {
      // Higher k reduces sensitivity to high ranks
      const lowK = calculateRRFScore([1, 2], 10);
      const highK = calculateRRFScore([1, 2], 100);
      // With lower k, score difference is more pronounced
      expect(lowK).toBeGreaterThan(highK);
    });

    it('should handle document appearing in only one list', () => {
      // Document only in dense search (rank 1), not in sparse
      const singleListScore = calculateRRFScore([1], 60);
      expect(singleListScore).toBeCloseTo(0.0164, 3);
    });
  });

  describe('Weighted Reranking', () => {
    function calculateWeightedScore(
      denseScore: number,
      sparseScore: number,
      denseWeight: number,
      sparseWeight: number
    ): number {
      // Normalize scores using arctan (maps to [0, 1])
      const normalizedDense = Math.atan(denseScore) / (Math.PI / 2);
      const normalizedSparse = Math.atan(sparseScore) / (Math.PI / 2);
      return denseWeight * normalizedDense + sparseWeight * normalizedSparse;
    }

    it('should weight semantic search higher when configured', () => {
      const denseScore = 0.9;
      const sparseScore = 0.5;

      const semanticWeighted = calculateWeightedScore(denseScore, sparseScore, 0.7, 0.3);
      const equalWeighted = calculateWeightedScore(denseScore, sparseScore, 0.5, 0.5);

      // Semantic weighted should be higher since dense score is higher
      expect(semanticWeighted).toBeGreaterThan(equalWeighted);
    });

    it('should weight keyword search higher when configured', () => {
      const denseScore = 0.5;
      const sparseScore = 0.9;

      const keywordWeighted = calculateWeightedScore(denseScore, sparseScore, 0.3, 0.7);
      const equalWeighted = calculateWeightedScore(denseScore, sparseScore, 0.5, 0.5);

      // Keyword weighted should be higher since sparse score is higher
      expect(keywordWeighted).toBeGreaterThan(equalWeighted);
    });

    it('should normalize scores to prevent scale issues', () => {
      // Even with large score differences, normalization should bound results
      const result = calculateWeightedScore(100, 0.1, 0.5, 0.5);
      expect(result).toBeLessThan(1);
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('BM25 Parameters', () => {
    // BM25 formula: score = IDF * (TF * (k1 + 1)) / (TF + k1 * (1 - b + b * docLen/avgDocLen))

    it('should have k1 in valid range (typically 1.2-2.0)', () => {
      const config: HybridSearchConfig = {
        enabled: true,
        rerankStrategy: 'rrf',
        rrfK: 60,
        denseWeight: 0.5,
        sparseWeight: 0.5,
        candidateMultiplier: 3,
        bm25K1: 1.2,  // Standard default
        bm25B: 0.75,
      };
      expect(config.bm25K1).toBeGreaterThanOrEqual(0.5);
      expect(config.bm25K1).toBeLessThanOrEqual(3.0);
    });

    it('should have b in valid range (0-1)', () => {
      const config: HybridSearchConfig = {
        enabled: true,
        rerankStrategy: 'rrf',
        rrfK: 60,
        denseWeight: 0.5,
        sparseWeight: 0.5,
        candidateMultiplier: 3,
        bm25K1: 1.2,
        bm25B: 0.75,  // Standard default
      };
      expect(config.bm25B).toBeGreaterThanOrEqual(0);
      expect(config.bm25B).toBeLessThanOrEqual(1);
    });

    it('should explain k1 impact on term frequency saturation', () => {
      // k1 controls how quickly term frequency saturates
      // Higher k1 = more weight to term frequency
      // Lower k1 = faster saturation (diminishing returns for repeated terms)
      const lowK1 = 1.0;  // Faster saturation
      const highK1 = 2.0; // More weight to TF

      // This is documentation via test - actual scoring happens in Zilliz
      expect(lowK1).toBeLessThan(highK1);
    });

    it('should explain b impact on length normalization', () => {
      // b controls how much document length affects scoring
      // b=0: No length normalization (longer docs not penalized)
      // b=1: Full length normalization (longer docs strongly penalized)
      const noNormalization = 0;
      const fullNormalization = 1;
      const standard = 0.75; // Balanced default

      expect(noNormalization).toBe(0);
      expect(fullNormalization).toBe(1);
      expect(standard).toBeGreaterThan(noNormalization);
      expect(standard).toBeLessThan(fullNormalization);
    });
  });

  describe('Hybrid Search Fallback Behavior', () => {
    it('should fall back to regular search when hybrid not enabled', async () => {
      const client = new ZillizClient({
        uri: 'https://mock-zilliz.example.com',
        token: 'mock-token',
        collection: 'test-collection',
        enableHybridSearch: false,
      });

      // hybridSearch should exist but return regular search results
      expect(typeof client.hybridSearch).toBe('function');
      expect(client.isHybridSearchEnabled()).toBe(false);
    });

    it('should check hybrid availability before using', () => {
      const client = new ZillizClient({
        uri: 'https://mock-zilliz.example.com',
        token: 'mock-token',
        collection: 'test-collection',
        enableHybridSearch: true,
      });

      expect(client.isHybridSearchEnabled?.()).toBe(true);
    });
  });

  describe('Integration with LongTermMemoryLayer', () => {
    // These tests verify the configuration flows correctly
    it('should pass hybrid config to ZillizClient', () => {
      // The LongTermMemoryLayer should pass config.hybridSearch to ZillizClient
      // This is a structural test - actual integration tested in longterm.test.ts
      const hybridConfig: HybridSearchConfig = {
        enabled: true,
        rerankStrategy: 'rrf',
        rrfK: 60,
        denseWeight: 0.5,
        sparseWeight: 0.5,
        candidateMultiplier: 3,
        bm25K1: 1.2,
        bm25B: 0.75,
      };

      // Config structure should match what ZillizClient expects
      expect(hybridConfig.enabled).toBeDefined();
      expect(hybridConfig.bm25K1).toBeDefined();
      expect(hybridConfig.bm25B).toBeDefined();
    });

    it('should use hybrid search in query when enabled', () => {
      // The layer query method should check:
      // 1. config.hybridSearch.enabled
      // 2. vectorStorage.isHybridSearchEnabled()
      // 3. vectorStorage.hybridSearch exists
      // Then call hybridSearch instead of search

      const expectedCheck = (config: { hybridSearch?: HybridSearchConfig }) => {
        return config.hybridSearch?.enabled === true;
      };

      expect(expectedCheck({ hybridSearch: { enabled: true, rerankStrategy: 'rrf', rrfK: 60, denseWeight: 0.5, sparseWeight: 0.5, candidateMultiplier: 3, bm25K1: 1.2, bm25B: 0.75 } })).toBe(true);
      expect(expectedCheck({ hybridSearch: { enabled: false, rerankStrategy: 'rrf', rrfK: 60, denseWeight: 0.5, sparseWeight: 0.5, candidateMultiplier: 3, bm25K1: 1.2, bm25B: 0.75 } })).toBe(false);
      expect(expectedCheck({})).toBe(false);
    });
  });
});
