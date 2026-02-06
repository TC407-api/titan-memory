/**
 * Titan Memory Benchmark Suite
 * v2.1 - Multi-Run + Raw Mode
 *
 * Entry point for running all benchmarks.
 * Each benchmark gets its own isolated Titan instance to prevent data interference.
 * Supports rawMode (safety overhead off) and multi-run averaging for statistical rigor.
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
import { loadConfig, updateConfig } from '../utils/config.js';
import { BenchmarkOptions, BenchmarkSuiteResult, MultiRunReport } from './types.js';
import type { LLMProvider } from '../llm/types.js';

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
 * Run the complete benchmark suite (single run)
 * Each benchmark gets its own isolated Titan instance
 * to prevent cross-benchmark data interference
 */
export async function runBenchmarkSuite(
  options?: BenchmarkOptions
): Promise<BenchmarkSuiteResult> {
  // Load config.json FIRST so production settings (cortex, voyage, etc.) are used
  loadConfig();

  // Disable surprise filtering during benchmarks so all data gets stored
  updateConfig({ enableSurpriseFiltering: false });

  // Raw mode: disable safety overhead (validator, adaptive reordering, post-store processing)
  updateConfig({ rawMode: options?.rawMode ?? false });

  // LLM Turbo mode: enable LLM-enhanced classification, reranking, extraction
  if (options?.llmMode) {
    const currentLlm = loadConfig().llm;
    // Auto-detect best available LLM provider
    let provider: LLMProvider = currentLlm?.provider || 'anthropic';
    let model = currentLlm?.model || 'claude-sonnet-4-5-20250929';
    let apiKey = currentLlm?.apiKey || '';
    let baseUrl = currentLlm?.baseUrl;

    if (process.env.GROQ_API_KEY) {
      provider = 'openai-compatible';
      baseUrl = 'https://api.groq.com/openai/v1';
      model = 'llama-3.3-70b-versatile';
      apiKey = process.env.GROQ_API_KEY;
    } else if (process.env.ANTHROPIC_API_KEY) {
      provider = 'anthropic';
      apiKey = process.env.ANTHROPIC_API_KEY;
    } else if (process.env.OPENAI_API_KEY) {
      provider = 'openai';
      model = 'gpt-4o-mini';
      apiKey = process.env.OPENAI_API_KEY;
    }

    updateConfig({
      llm: {
        ...currentLlm,
        enabled: true,
        provider,
        model,
        apiKey,
        baseUrl,
        timeout: currentLlm?.timeout || 15000,
        maxTokensPerRequest: currentLlm?.maxTokensPerRequest || 512,
        classifyEnabled: true,
        extractEnabled: true,
        rerankEnabled: true,
        classifyConfidenceThreshold: currentLlm?.classifyConfidenceThreshold || 0.5,
        summarizeEnabled: false,
      },
    });
  }

  const suiteName = options?.rawMode
    ? 'Titan Memory v2.1 (Raw Mode)'
    : options?.llmMode
      ? 'Titan Memory v2.1 (LLM Turbo)'
      : 'Titan Memory v2.1 (Production)';

  const suite = new BenchmarkSuite(suiteName);

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

  // Reset benchmark-specific overrides after run
  updateConfig({ rawMode: false });
  if (options?.llmMode) {
    const currentLlm = loadConfig().llm || {};
    updateConfig({ llm: { ...currentLlm, enabled: false } });
  }

  return results;
}

/**
 * Calculate standard deviation
 */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

/**
 * Run benchmark suite multiple times and produce statistical report
 */
export async function runMultiRunBenchmark(
  options: BenchmarkOptions & { runs: number }
): Promise<MultiRunReport> {
  const runs = Math.max(1, options.runs);
  const mode = options.rawMode ? 'raw' : options.llmMode ? 'turbo' : 'production';

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  MULTI-RUN BENCHMARK: ${mode.toUpperCase()} MODE (${runs} runs)`);
  console.log(`${'═'.repeat(60)}\n`);

  const perRunResults: BenchmarkSuiteResult[] = [];

  for (let i = 0; i < runs; i++) {
    console.log(`\n--- Run ${i + 1}/${runs} ---\n`);
    const result = await runBenchmarkSuite({
      ...options,
      verbose: false, // Quiet individual runs
    });
    perRunResults.push(result);
    console.log(`  Run ${i + 1}: ${result.overallScore.toFixed(1)}/100 (${result.passed}/${result.totalTests} passed)`);
  }

  // Collect all unique benchmark names
  const benchmarkNames = new Set<string>();
  for (const run of perRunResults) {
    for (const r of run.results) {
      benchmarkNames.add(r.name);
    }
  }

  // Per-benchmark statistics
  const perBenchmark: MultiRunReport['statistics']['perBenchmark'] = {};
  for (const name of benchmarkNames) {
    const scores = perRunResults
      .map(run => run.results.find(r => r.name === name)?.score ?? 0);
    const passes = perRunResults
      .map(run => run.results.find(r => r.name === name)?.passed ? 1 : 0) as number[];

    perBenchmark[name] = {
      mean: scores.reduce((a, b) => a + b, 0) / scores.length,
      stddev: stddev(scores),
      min: Math.min(...scores),
      max: Math.max(...scores),
      passRate: passes.reduce((a: number, b: number) => a + b, 0) / passes.length,
    };
  }

  // Overall statistics
  const overallScores = perRunResults.map(r => r.overallScore);

  const pkg = await import('../../package.json', { with: { type: 'json' } }).catch(() => ({
    default: { version: 'unknown' },
  }));

  const report: MultiRunReport = {
    mode,
    runs,
    timestamp: new Date().toISOString(),
    environment: {
      platform: process.platform,
      nodeVersion: process.version,
      titanVersion: pkg.default.version || '2.1.0',
    },
    perRunResults,
    statistics: {
      meanScore: overallScores.reduce((a, b) => a + b, 0) / overallScores.length,
      stddev: stddev(overallScores),
      minScore: Math.min(...overallScores),
      maxScore: Math.max(...overallScores),
      perBenchmark,
    },
  };

  // Print summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  MULTI-RUN RESULTS: ${mode.toUpperCase()} (${runs} runs)`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Mean Score:   ${report.statistics.meanScore.toFixed(1)} ± ${report.statistics.stddev.toFixed(1)}`);
  console.log(`  Range:        ${report.statistics.minScore.toFixed(1)} - ${report.statistics.maxScore.toFixed(1)}`);
  console.log(`  Environment:  ${report.environment.platform} / Node ${report.environment.nodeVersion}`);
  console.log(`${'─'.repeat(60)}`);

  // Per-benchmark breakdown
  for (const [name, stats] of Object.entries(report.statistics.perBenchmark)) {
    const passRateStr = `${(stats.passRate * 100).toFixed(0)}%`;
    console.log(`  ${name.padEnd(35)} ${stats.mean.toFixed(1)} ± ${stats.stddev.toFixed(1)}  [${passRateStr} pass]`);
  }
  console.log(`${'═'.repeat(60)}\n`);

  return report;
}

/**
 * CLI entry point
 */
export async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Titan Memory v2.1 Benchmark Suite    ║');
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
