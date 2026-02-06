/**
 * Latency Benchmarks
 * Titan Memory v2.0 - Competitive Upgrade
 *
 * Measures operation latencies across all Titan operations.
 */

import { BenchmarkDefinition, calculateLatencyStats } from './runner.js';
import { TitanMemory, initTitan } from '../titan.js';

/**
 * Create latency benchmarks
 */
export function createLatencyBenchmarks(
  titan: TitanMemory,
  iterations: number = 100
): BenchmarkDefinition[] {
  return [
    {
      name: 'add-operation-latency',
      category: 'latency',
      run: async () => {
        const latencies: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const start = performance.now();
          await titan.add(`Benchmark test content ${i} with some meaningful text for testing`);
          latencies.push(performance.now() - start);
        }

        const stats = calculateLatencyStats(latencies);
        const targetP95 = 2000; // Target: 2000ms p95 (includes Voyage embedding API + Zilliz insert)

        return {
          passed: stats.p95 <= targetP95,
          score: Math.max(0, 100 - (stats.p95 / targetP95) * 50),
          metrics: {
            iterations,
            minMs: stats.min,
            maxMs: stats.max,
            meanMs: stats.mean,
            p50Ms: stats.p50,
            p95Ms: stats.p95,
            p99Ms: stats.p99,
            targetP95Ms: targetP95,
          },
          details: `Add operation p95: ${stats.p95.toFixed(2)}ms (target: ${targetP95}ms)`,
        };
      },
    },

    {
      name: 'recall-operation-latency',
      category: 'latency',
      run: async () => {
        // First, add some test data
        for (let i = 0; i < 50; i++) {
          await titan.add(`Recall benchmark test content ${i} with various topics`);
        }

        const latencies: number[] = [];
        const queries = [
          'test content',
          'benchmark',
          'various topics',
          'recall',
          'search query',
        ];

        for (let i = 0; i < iterations; i++) {
          const query = queries[i % queries.length];
          const start = performance.now();
          await titan.recall(query, { limit: 10 });
          latencies.push(performance.now() - start);
        }

        const stats = calculateLatencyStats(latencies);
        const targetP95 = 1500; // Target: 1500ms p95 (includes Voyage embedding API + Zilliz search)

        return {
          passed: stats.p95 <= targetP95,
          score: Math.max(0, 100 - (stats.p95 / targetP95) * 50),
          metrics: {
            iterations,
            minMs: stats.min,
            maxMs: stats.max,
            meanMs: stats.mean,
            p50Ms: stats.p50,
            p95Ms: stats.p95,
            p99Ms: stats.p99,
            targetP95Ms: targetP95,
          },
          details: `Recall operation p95: ${stats.p95.toFixed(2)}ms (target: ${targetP95}ms)`,
        };
      },
    },

    {
      name: 'classify-operation-latency',
      category: 'latency',
      run: async () => {
        const latencies: number[] = [];
        const contents = [
          'The API key is abc123',
          'I deployed the feature yesterday',
          'User prefers TypeScript over JavaScript',
          'Error: Connection refused on port 5432',
          'We decided to use PostgreSQL for consistency',
        ];

        for (let i = 0; i < iterations; i++) {
          const content = contents[i % contents.length];
          const start = performance.now();
          await titan.classifyContent(content);
          latencies.push(performance.now() - start);
        }

        const stats = calculateLatencyStats(latencies);
        const targetP95 = 10; // Target: 10ms p95 for classification (local operation)

        return {
          passed: stats.p95 <= targetP95,
          score: Math.max(0, 100 - (stats.p95 / targetP95) * 50),
          metrics: {
            iterations,
            minMs: stats.min,
            maxMs: stats.max,
            meanMs: stats.mean,
            p50Ms: stats.p50,
            p95Ms: stats.p95,
            p99Ms: stats.p99,
            targetP95Ms: targetP95,
          },
          details: `Classify operation p95: ${stats.p95.toFixed(2)}ms (target: ${targetP95}ms)`,
        };
      },
    },

    {
      name: 'intent-detection-latency',
      category: 'latency',
      run: async () => {
        const latencies: number[] = [];
        const queries = [
          'What is the API key format?',
          'How do I implement authentication?',
          'When did we deploy the feature?',
          'Why did we choose PostgreSQL?',
          'I am getting an error with the connection',
        ];

        for (let i = 0; i < iterations; i++) {
          const query = queries[i % queries.length];
          const start = performance.now();
          await titan.detectQueryIntent(query);
          latencies.push(performance.now() - start);
        }

        const stats = calculateLatencyStats(latencies);
        const targetP95 = 5; // Target: 5ms p95 for intent detection (regex-based)

        return {
          passed: stats.p95 <= targetP95,
          score: Math.max(0, 100 - (stats.p95 / targetP95) * 50),
          metrics: {
            iterations,
            minMs: stats.min,
            maxMs: stats.max,
            meanMs: stats.mean,
            p50Ms: stats.p50,
            p95Ms: stats.p95,
            p99Ms: stats.p99,
            targetP95Ms: targetP95,
          },
          details: `Intent detection p95: ${stats.p95.toFixed(2)}ms (target: ${targetP95}ms)`,
        };
      },
    },

    {
      name: 'focus-operations-latency',
      category: 'latency',
      run: async () => {
        const latencies: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const start = performance.now();

          // Add focus item
          await titan.addFocus(`Focus item ${i}`, { priority: 'normal' });

          // Get focus
          await titan.getFocus();

          latencies.push(performance.now() - start);
        }

        // Clean up
        await titan.clearFocus();

        const stats = calculateLatencyStats(latencies);
        const targetP95 = 10; // Target: 10ms p95 for focus operations

        return {
          passed: stats.p95 <= targetP95,
          score: Math.max(0, 100 - (stats.p95 / targetP95) * 50),
          metrics: {
            iterations,
            minMs: stats.min,
            maxMs: stats.max,
            meanMs: stats.mean,
            p50Ms: stats.p50,
            p95Ms: stats.p95,
            p99Ms: stats.p99,
            targetP95Ms: targetP95,
          },
          details: `Focus operations p95: ${stats.p95.toFixed(2)}ms (target: ${targetP95}ms)`,
        };
      },
    },
  ];
}

/**
 * Run latency benchmarks standalone
 */
export async function runLatencyBenchmarks(
  iterations: number = 100
): Promise<void> {
  const titan = await initTitan();
  const benchmarks = createLatencyBenchmarks(titan, iterations);

  console.log('Running latency benchmarks...\n');

  for (const benchmark of benchmarks) {
    console.log(`Running: ${benchmark.name}`);
    const result = await benchmark.run();
    const status = result.passed ? '✓' : '✗';
    console.log(`  ${status} Score: ${result.score.toFixed(1)}/100`);
    console.log(`  ${result.details}\n`);
  }

  await titan.close();
}
