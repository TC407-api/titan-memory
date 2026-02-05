/**
 * Titan Memory Benchmark Suite
 * v2.0 - Competitive Upgrade
 *
 * Entry point for running all benchmarks.
 */

export * from './types.js';
export * from './runner.js';
export * from './latency.js';
export * from './retrieval-accuracy.js';

import { BenchmarkSuite, formatReport } from './runner.js';
import { createLatencyBenchmarks } from './latency.js';
import { createRetrievalAccuracyBenchmarks } from './retrieval-accuracy.js';
import { initTitan } from '../titan.js';
import { BenchmarkOptions, BenchmarkSuiteResult } from './types.js';

/**
 * Run the complete benchmark suite
 */
export async function runBenchmarkSuite(
  options?: BenchmarkOptions
): Promise<BenchmarkSuiteResult> {
  const titan = await initTitan();

  const suite = new BenchmarkSuite('Titan Memory v2.0');

  // Add latency benchmarks
  const latencyBenchmarks = createLatencyBenchmarks(titan, 50);
  for (const b of latencyBenchmarks) {
    suite.add(b);
  }

  // Add retrieval accuracy benchmarks
  const accuracyBenchmarks = createRetrievalAccuracyBenchmarks(titan);
  for (const b of accuracyBenchmarks) {
    suite.add(b);
  }

  // Run suite
  const results = await suite.run({
    verbose: options?.verbose ?? true,
    outputPath: options?.outputPath,
    categories: options?.categories,
  });

  await titan.close();

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
