/**
 * Retrieval Accuracy Benchmarks
 * Titan Memory v2.0 - Competitive Upgrade
 *
 * Measures how accurately Titan retrieves relevant memories.
 */

import { BenchmarkDefinition } from './runner.js';
import { TitanMemory, initTitan } from '../titan.js';
import { MemoryLayer, MemoryEntry, UnifiedQueryResult } from '../types.js';
import { RetrievalTestCase } from './types.js';

/**
 * Helper to extract memory IDs from recall result
 */
function extractMemoryIds(result: UnifiedQueryResult | { summaries: unknown[]; totalQueryTimeMs: number }): string[] {
  if ('fusedMemories' in result) {
    return result.fusedMemories.map((m: MemoryEntry) => m.id);
  }
  return [];
}

/**
 * Helper to extract memories from recall result
 */
function extractMemories(result: UnifiedQueryResult | { summaries: unknown[]; totalQueryTimeMs: number }): MemoryEntry[] {
  if ('fusedMemories' in result) {
    return result.fusedMemories;
  }
  return [];
}

/**
 * Calculate recall@K
 */
function calculateRecallAtK(
  retrieved: string[],
  expected: string[],
  k: number
): number {
  const topK = retrieved.slice(0, k);
  const relevant = expected.filter(id => topK.includes(id));
  return expected.length > 0 ? relevant.length / expected.length : 0;
}

/**
 * Calculate precision@K
 */
function calculatePrecisionAtK(
  retrieved: string[],
  expected: string[],
  k: number
): number {
  const topK = retrieved.slice(0, k);
  const relevant = topK.filter(id => expected.includes(id));
  return topK.length > 0 ? relevant.length / topK.length : 0;
}

/**
 * Calculate Mean Reciprocal Rank
 */
function calculateMRR(
  retrieved: string[],
  expected: string[]
): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (expected.includes(retrieved[i])) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/**
 * Create retrieval accuracy benchmarks
 */
export function createRetrievalAccuracyBenchmarks(
  titan: TitanMemory
): BenchmarkDefinition[] {
  return [
    {
      name: 'factual-lookup-accuracy',
      category: 'accuracy',
      run: async () => {
        // Setup: Add known factual memories
        const facts = [
          { content: 'The API key is sk-test-12345', id: '' },
          { content: 'Database connection string: postgres://localhost:5432/mydb', id: '' },
          { content: 'The default timeout is 30 seconds', id: '' },
          { content: 'Maximum retry count is 3', id: '' },
          { content: 'Cache TTL is set to 3600 seconds', id: '' },
        ];

        // Add facts and store IDs
        for (const fact of facts) {
          const result = await titan.add(fact.content);
          fact.id = result.id;
        }

        // Test queries
        const testCases: RetrievalTestCase[] = [
          { query: 'What is the API key?', expectedMemoryIds: [facts[0].id] },
          { query: 'database connection', expectedMemoryIds: [facts[1].id] },
          { query: 'timeout setting', expectedMemoryIds: [facts[2].id] },
          { query: 'retry configuration', expectedMemoryIds: [facts[3].id] },
          { query: 'cache duration', expectedMemoryIds: [facts[4].id] },
        ];

        let totalRecall = 0;
        let totalPrecision = 0;
        let totalMRR = 0;

        for (const testCase of testCases) {
          const result = await titan.recall(testCase.query, { limit: 5 });
          const retrievedIds = extractMemoryIds(result);

          totalRecall += calculateRecallAtK(retrievedIds, testCase.expectedMemoryIds, 5);
          totalPrecision += calculatePrecisionAtK(retrievedIds, testCase.expectedMemoryIds, 5);
          totalMRR += calculateMRR(retrievedIds, testCase.expectedMemoryIds);
        }

        const avgRecall = totalRecall / testCases.length;
        const avgPrecision = totalPrecision / testCases.length;
        const avgMRR = totalMRR / testCases.length;
        const score = (avgRecall * 0.4 + avgPrecision * 0.3 + avgMRR * 0.3) * 100;

        return {
          passed: avgRecall >= 0.6,
          score,
          metrics: {
            testCases: testCases.length,
            recallAt5: avgRecall,
            precisionAt5: avgPrecision,
            mrr: avgMRR,
          },
          details: `Factual lookup: Recall@5=${(avgRecall * 100).toFixed(1)}%, Precision@5=${(avgPrecision * 100).toFixed(1)}%, MRR=${avgMRR.toFixed(3)}`,
        };
      },
    },

    {
      name: 'semantic-similarity-accuracy',
      category: 'accuracy',
      run: async () => {
        // Setup: Add semantically related memories
        const memories = [
          { content: 'User authentication uses JWT tokens with 24-hour expiry', id: '' },
          { content: 'Login flow redirects to OAuth provider for SSO', id: '' },
          { content: 'Session tokens are stored in HTTP-only cookies', id: '' },
          { content: 'The weather today is sunny with 75 degree temperatures', id: '' },
          { content: 'Database queries use connection pooling for efficiency', id: '' },
        ];

        for (const mem of memories) {
          const result = await titan.add(mem.content);
          mem.id = result.id;
        }

        // Test semantic similarity queries
        const testCases: RetrievalTestCase[] = [
          {
            query: 'How does user login work?',
            expectedMemoryIds: [memories[0].id, memories[1].id, memories[2].id],
          },
          {
            query: 'security and sessions',
            expectedMemoryIds: [memories[0].id, memories[2].id],
          },
          {
            query: 'database performance',
            expectedMemoryIds: [memories[4].id],
          },
        ];

        let totalRecall = 0;
        let relevantRetrieved = 0;
        let totalExpected = 0;

        for (const testCase of testCases) {
          const result = await titan.recall(testCase.query, { limit: 5 });
          const retrievedIds = extractMemoryIds(result);

          const recall = calculateRecallAtK(retrievedIds, testCase.expectedMemoryIds, 5);
          totalRecall += recall;
          relevantRetrieved += testCase.expectedMemoryIds.filter(id => retrievedIds.includes(id)).length;
          totalExpected += testCase.expectedMemoryIds.length;
        }

        const avgRecall = totalRecall / testCases.length;
        const overallAccuracy = totalExpected > 0 ? relevantRetrieved / totalExpected : 0;
        const score = overallAccuracy * 100;

        return {
          passed: avgRecall >= 0.5,
          score,
          metrics: {
            testCases: testCases.length,
            avgRecallAt5: avgRecall,
            relevantRetrieved,
            totalExpected,
            overallAccuracy,
          },
          details: `Semantic similarity: ${(overallAccuracy * 100).toFixed(1)}% of relevant memories retrieved`,
        };
      },
    },

    {
      name: 'intent-based-retrieval-accuracy',
      category: 'accuracy',
      run: async () => {
        // Test that intent detection improves retrieval
        const memories = [
          // Factual
          { content: 'The port number is 8080', type: 'factual', id: '' },
          { content: 'API version is v2.1.0', type: 'factual', id: '' },
          // Pattern
          { content: 'Best practice: Use dependency injection for testability', type: 'pattern', id: '' },
          { content: 'Pattern: Repository pattern abstracts data access', type: 'pattern', id: '' },
          // Temporal
          { content: 'Deployed v2.0 to production yesterday at 3pm', type: 'temporal', id: '' },
          { content: 'Last week we fixed the memory leak in the cache', type: 'temporal', id: '' },
        ];

        for (const mem of memories) {
          const result = await titan.add(mem.content);
          mem.id = result.id;
        }

        const intentTests = [
          {
            query: 'What is the port number?',
            expectedType: 'factual',
            expectedIds: [memories[0].id],
          },
          {
            query: 'How should I structure data access?',
            expectedType: 'pattern',
            expectedIds: [memories[2].id, memories[3].id],
          },
          {
            query: 'When did we deploy v2.0?',
            expectedType: 'temporal',
            expectedIds: [memories[4].id],
          },
        ];

        let correctIntents = 0;
        let correctRetrievals = 0;

        for (const test of intentTests) {
          // Check intent detection
          const intent = await titan.detectQueryIntent(test.query);
          const intentMatch = intent.type.toLowerCase().includes(test.expectedType.slice(0, 4));
          if (intentMatch) correctIntents++;

          // Check retrieval
          const result = await titan.recall(test.query, { limit: 3 });
          const retrievedIds = extractMemoryIds(result);
          const hasExpected = test.expectedIds.some(id => retrievedIds.includes(id));
          if (hasExpected) correctRetrievals++;
        }

        const intentAccuracy = correctIntents / intentTests.length;
        const retrievalAccuracy = correctRetrievals / intentTests.length;
        const score = (intentAccuracy * 0.3 + retrievalAccuracy * 0.7) * 100;

        return {
          passed: retrievalAccuracy >= 0.6,
          score,
          metrics: {
            testCases: intentTests.length,
            intentAccuracy,
            retrievalAccuracy,
            correctIntents,
            correctRetrievals,
          },
          details: `Intent-based retrieval: Intent accuracy=${(intentAccuracy * 100).toFixed(1)}%, Retrieval accuracy=${(retrievalAccuracy * 100).toFixed(1)}%`,
        };
      },
    },

    {
      name: 'cross-layer-retrieval-accuracy',
      category: 'accuracy',
      run: async () => {
        // Test retrieval across different memory layers
        const layerMemories = [
          { content: 'API endpoint: /api/v1/users', layer: MemoryLayer.FACTUAL, id: '' },
          { content: 'User data is stored in PostgreSQL database', layer: MemoryLayer.LONG_TERM, id: '' },
          { content: 'Authentication pattern uses middleware chain', layer: MemoryLayer.SEMANTIC, id: '' },
          { content: 'Fixed login bug on Monday morning', layer: MemoryLayer.EPISODIC, id: '' },
        ];

        for (const mem of layerMemories) {
          const result = await titan.addToLayer(mem.layer, mem.content, {});
          mem.id = result.id;
        }

        // Query that should hit multiple layers
        const query = 'user authentication and data storage';
        const result = await titan.recall(query, { limit: 10 });
        const memories = extractMemories(result);

        // Check layer coverage
        const retrievedLayers = new Set(memories.map(m => m.layer));
        const expectedLayers = new Set(layerMemories.map(m => m.layer));
        const layerCoverage = [...expectedLayers].filter(l => retrievedLayers.has(l)).length / expectedLayers.size;

        // Check if relevant memories were retrieved
        const relevantIds = [layerMemories[0].id, layerMemories[1].id, layerMemories[2].id];
        const retrievedIds = memories.map(m => m.id);
        const recall = calculateRecallAtK(retrievedIds, relevantIds, 5);

        const score = (layerCoverage * 0.4 + recall * 0.6) * 100;

        return {
          passed: layerCoverage >= 0.5 && recall >= 0.3,
          score,
          metrics: {
            layerCoverage,
            recallAt5: recall,
            layersHit: retrievedLayers.size,
            totalLayers: expectedLayers.size,
          },
          details: `Cross-layer retrieval: ${(layerCoverage * 100).toFixed(1)}% layer coverage, ${(recall * 100).toFixed(1)}% recall@5`,
        };
      },
    },
  ];
}

/**
 * Run retrieval accuracy benchmarks standalone
 */
export async function runRetrievalAccuracyBenchmarks(): Promise<void> {
  const titan = await initTitan();
  const benchmarks = createRetrievalAccuracyBenchmarks(titan);

  console.log('Running retrieval accuracy benchmarks...\n');

  for (const benchmark of benchmarks) {
    console.log(`Running: ${benchmark.name}`);
    const result = await benchmark.run();
    const status = result.passed ? '✓' : '✗';
    console.log(`  ${status} Score: ${result.score.toFixed(1)}/100`);
    console.log(`  ${result.details}\n`);
  }

  await titan.close();
}
