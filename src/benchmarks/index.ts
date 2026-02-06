/**
 * Titan Memory Benchmark Suite
 * v2.0 - Competitive Upgrade
 *
 * Entry point for running all benchmarks.
 * Each benchmark gets its own isolated Titan instance to prevent data interference.
 */

export * from './types.js';
export * from './runner.js';
export * from './latency.js';
export * from './retrieval-accuracy.js';
export * from './locomo.js';
export * from './longmemeval.js';
export * from './token-efficiency.js';

import { BenchmarkSuite, BenchmarkDefinition, formatReport } from './runner.js';
import { createLatencyBenchmarks } from './latency.js';
import { createRetrievalAccuracyBenchmarks } from './retrieval-accuracy.js';
import { createLoComoBenchmarks } from './locomo.js';
import { createLongMemEvalBenchmarks } from './longmemeval.js';
import { createTokenEfficiencyBenchmarks } from './token-efficiency.js';
import { TitanMemory, initTitanForProject } from '../titan.js';
import { updateConfig } from '../utils/config.js';
import { BenchmarkOptions, BenchmarkSuiteResult } from './types.js';

let benchCounter = 0;

/**
 * Create an isolated Titan instance for a benchmark
 */
async function createIsolatedTitan(label: string): Promise<TitanMemory> {
  const projectId = `bench_${label}_${Date.now()}_${benchCounter++}`;
  return initTitanForProject(projectId);
}

/**
 * Wrap a benchmark to use its own isolated Titan instance
 */
function isolateBenchmark(
  factory: (titan: TitanMemory) => BenchmarkDefinition[],
  label: string
): BenchmarkDefinition[] {
  // Create one shared titan for the factory call (we'll replace the run functions)
  const dummyBenchmarks = factory(null as unknown as TitanMemory);

  return dummyBenchmarks.map((b, idx) => ({
    ...b,
    run: async () => {
      const titan = await createIsolatedTitan(`${label}_${idx}`);
      try {
        // Re-create benchmarks with real titan
        const realBenchmarks = factory(titan);
        return await realBenchmarks[idx].run();
      } finally {
        await titan.close();
      }
    },
  }));
}

/**
 * Run the complete benchmark suite
 * Each benchmark gets its own isolated Titan instance
 * to prevent cross-benchmark data interference
 */
export async function runBenchmarkSuite(
  options?: BenchmarkOptions
): Promise<BenchmarkSuiteResult> {
  // Disable surprise filtering during benchmarks so all data gets stored
  updateConfig({ enableSurpriseFiltering: false });

  const suite = new BenchmarkSuite('Titan Memory v2.0');

  // Accuracy benchmarks — each gets isolated titan
  for (const b of isolateBenchmark(createRetrievalAccuracyBenchmarks, 'accuracy')) {
    suite.add(b);
  }

  // LoCoMo benchmarks — each gets isolated titan
  for (const b of isolateBenchmark(createLoComoBenchmarks, 'locomo')) {
    suite.add(b);
  }

  // LongMemEval benchmarks — each gets isolated titan
  for (const b of isolateBenchmark(createLongMemEvalBenchmarks, 'longmem')) {
    suite.add(b);
  }

  // Compression benchmarks — shared titan is fine (no retrieval interference)
  const titanCompress = await createIsolatedTitan('compress');
  for (const b of createTokenEfficiencyBenchmarks(titanCompress)) {
    suite.add(b);
  }

  // Latency benchmarks — shared titan is fine
  const titanLatency = await createIsolatedTitan('latency');
  for (const b of createLatencyBenchmarks(titanLatency, 20)) {
    suite.add(b);
  }

  // Run suite
  const results = await suite.run({
    verbose: options?.verbose ?? true,
    outputPath: options?.outputPath,
    categories: options?.categories,
  });

  // Cleanup shared instances
  await titanCompress.close();
  await titanLatency.close();

  return results;
}

/**
 * CLI entry point
 */
export async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Titan Memory v2.0 Benchmark Suite    ║');
  console.log('╚════════════════════════════════════════╝\n');

  const results = await runBenchmarkSuite({
    verbose: true,
    outputPath: './benchmarks/results/latest.json',
  });

  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total Tests:    ${results.totalTests}`);
  console.log(`Passed:         ${results.passed}`);
  console.log(`Failed:         ${results.failed}`);
  console.log(`Overall Score:  ${results.overallScore.toFixed(1)}/100`);
  console.log(`Duration:       ${results.totalDurationMs}ms`);
  console.log('='.repeat(50));

  // Generate markdown report
  const report = formatReport(results);
  console.log('\nGenerated report at: ./benchmarks/results/report.md');

  // Write report
  const fs = await import('fs');
  const path = await import('path');
  const reportDir = './benchmarks/results';
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(path.join(reportDir, 'report.md'), report);
}

// Run if called directly
if (process.argv[1]?.includes('benchmarks/index')) {
  main().catch(console.error);
}
