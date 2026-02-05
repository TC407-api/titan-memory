/**
 * Benchmark Runner
 * Titan Memory v2.0 - Competitive Upgrade
 *
 * Runs benchmark suites and generates reports.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  BenchmarkResult,
  BenchmarkSuiteResult,
  BenchmarkOptions,
} from './types.js';

/**
 * Individual benchmark definition
 */
export interface BenchmarkDefinition {
  name: string;
  category: 'retrieval' | 'latency' | 'token-efficiency' | 'accuracy';
  run: () => Promise<Omit<BenchmarkResult, 'name' | 'category' | 'timestamp' | 'durationMs'>>;
}

/**
 * Benchmark Suite
 */
export class BenchmarkSuite {
  private benchmarks: BenchmarkDefinition[] = [];
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Register a benchmark
   */
  add(benchmark: BenchmarkDefinition): this {
    this.benchmarks.push(benchmark);
    return this;
  }

  /**
   * Run all benchmarks
   */
  async run(options?: BenchmarkOptions): Promise<BenchmarkSuiteResult> {
    const startTime = new Date();
    const results: BenchmarkResult[] = [];

    const benchmarksToRun = options?.categories
      ? this.benchmarks.filter(b => options.categories!.includes(b.category))
      : this.benchmarks;

    for (const benchmark of benchmarksToRun) {
      if (options?.verbose) {
        console.log(`Running benchmark: ${benchmark.name}...`);
      }

      const benchStart = Date.now();
      try {
        const result = await benchmark.run();
        results.push({
          ...result,
          name: benchmark.name,
          category: benchmark.category,
          timestamp: new Date(),
          durationMs: Date.now() - benchStart,
        });

        if (options?.verbose) {
          const status = result.passed ? '✓' : '✗';
          console.log(`  ${status} ${benchmark.name}: ${result.score.toFixed(1)}/100`);
        }
      } catch (error) {
        results.push({
          name: benchmark.name,
          category: benchmark.category,
          passed: false,
          score: 0,
          metrics: {},
          details: `Error: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date(),
          durationMs: Date.now() - benchStart,
        });

        if (options?.verbose) {
          console.log(`  ✗ ${benchmark.name}: ERROR - ${error}`);
        }
      }
    }

    const endTime = new Date();
    const passed = results.filter(r => r.passed).length;

    const suiteResult: BenchmarkSuiteResult = {
      suiteName: this.name,
      totalTests: results.length,
      passed,
      failed: results.length - passed,
      overallScore: results.length > 0
        ? results.reduce((sum, r) => sum + r.score, 0) / results.length
        : 0,
      results,
      startTime,
      endTime,
      totalDurationMs: endTime.getTime() - startTime.getTime(),
    };

    if (options?.outputPath) {
      await this.saveResults(suiteResult, options.outputPath);
    }

    return suiteResult;
  }

  /**
   * Save results to file
   */
  private async saveResults(results: BenchmarkSuiteResult, outputPath: string): Promise<void> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  }
}

/**
 * Calculate percentile from sorted array
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

/**
 * Calculate statistics for latency measurements
 */
export function calculateLatencyStats(latencies: number[]): {
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
} {
  if (latencies.length === 0) {
    return { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = latencies.reduce((a, b) => a + b, 0);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / latencies.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

/**
 * Format benchmark results as markdown report
 */
export function formatReport(results: BenchmarkSuiteResult): string {
  const lines: string[] = [
    `# Benchmark Report: ${results.suiteName}`,
    '',
    `**Date:** ${results.startTime.toISOString()}`,
    `**Duration:** ${results.totalDurationMs}ms`,
    `**Overall Score:** ${results.overallScore.toFixed(1)}/100`,
    `**Tests:** ${results.passed}/${results.totalTests} passed`,
    '',
    '## Results by Category',
    '',
  ];

  // Group by category
  const byCategory = new Map<string, BenchmarkResult[]>();
  for (const result of results.results) {
    const existing = byCategory.get(result.category) || [];
    existing.push(result);
    byCategory.set(result.category, existing);
  }

  for (const [category, categoryResults] of byCategory) {
    lines.push(`### ${category}`);
    lines.push('');
    lines.push('| Benchmark | Score | Duration | Status |');
    lines.push('|-----------|-------|----------|--------|');

    for (const result of categoryResults) {
      const status = result.passed ? '✓ Pass' : '✗ Fail';
      lines.push(
        `| ${result.name} | ${result.score.toFixed(1)} | ${result.durationMs}ms | ${status} |`
      );
    }
    lines.push('');
  }

  lines.push('## Detailed Metrics');
  lines.push('');

  for (const result of results.results) {
    lines.push(`### ${result.name}`);
    if (result.details) {
      lines.push(`> ${result.details}`);
    }
    lines.push('```json');
    lines.push(JSON.stringify(result.metrics, null, 2));
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}
