/**
 * Benchmark Types
 * Titan Memory v2.0 - Competitive Upgrade
 */

/**
 * Result of a single benchmark run
 */
export interface BenchmarkResult {
  name: string;
  category: 'retrieval' | 'latency' | 'token-efficiency' | 'accuracy';
  passed: boolean;
  score: number;           // 0-100
  metrics: Record<string, number>;
  details?: string;
  timestamp: Date;
  durationMs: number;
}

/**
 * Benchmark suite results
 */
export interface BenchmarkSuiteResult {
  suiteName: string;
  totalTests: number;
  passed: number;
  failed: number;
  overallScore: number;
  results: BenchmarkResult[];
  startTime: Date;
  endTime: Date;
  totalDurationMs: number;
}

/**
 * Retrieval accuracy test case
 */
export interface RetrievalTestCase {
  query: string;
  expectedMemoryIds: string[];
  acceptableAlternatives?: string[];
  minRecallAtK?: number;    // Minimum recall at K results (default 5)
}

/**
 * Latency benchmark configuration
 */
export interface LatencyBenchmarkConfig {
  operation: 'add' | 'recall' | 'suggest' | 'classify';
  iterations: number;
  warmupIterations?: number;
  targetP50Ms?: number;
  targetP95Ms?: number;
  targetP99Ms?: number;
}

/**
 * Token efficiency test case
 */
export interface TokenEfficiencyTestCase {
  originalContent: string;
  expectedCompressionRatio?: number;  // e.g., 5x = 5
  minInformationRetention?: number;   // 0-1, semantic similarity
}

/**
 * Benchmark runner options
 */
export interface BenchmarkOptions {
  verbose?: boolean;
  outputPath?: string;
  categories?: ('retrieval' | 'latency' | 'token-efficiency' | 'accuracy')[];
  parallel?: boolean;
  rawMode?: boolean;   // Disable safety overhead for clean measurement
  runs?: number;       // Number of runs for statistical averaging (default: 1)
  llmMode?: boolean;   // Enable LLM Turbo Layer for benchmarks
}

/**
 * Multi-run benchmark report with statistics
 */
export interface MultiRunReport {
  mode: 'production' | 'raw' | 'turbo';
  runs: number;
  timestamp: string;
  environment: {
    platform: string;
    nodeVersion: string;
    titanVersion: string;
  };
  perRunResults: BenchmarkSuiteResult[];
  statistics: {
    meanScore: number;
    stddev: number;
    minScore: number;
    maxScore: number;
    perBenchmark: Record<string, {
      mean: number;
      stddev: number;
      min: number;
      max: number;
      passRate: number;
    }>;
  };
}
