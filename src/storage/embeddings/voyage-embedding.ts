/**
 * Voyage AI Embedding Generator
 * High-quality semantic embeddings using Voyage AI API
 */

import { IEmbeddingGenerator } from '../vector-storage.js';

export interface VoyageEmbeddingConfig {
  apiKey?: string;
  model?: string;
  dimension?: number;
  timeout?: number;
  batchSize?: number;
}

const DEFAULT_CONFIG: Required<VoyageEmbeddingConfig> = {
  apiKey: process.env.VOYAGE_API_KEY || '',
  model: 'voyage-3-large',  // Matches existing cached embeddings (1024 dims)
  dimension: 1024, // voyage-4-lite default (all voyage-4 series use 1024)
  timeout: 30000,
  batchSize: 32,
};

/**
 * Voyage AI embedding generator
 * Uses Voyage AI's embedding API for high-quality semantic embeddings
 */
export class VoyageEmbeddingGenerator implements IEmbeddingGenerator {
  private readonly config: Required<VoyageEmbeddingConfig>;
  private readonly baseUrl = 'https://api.voyageai.com/v1';

  constructor(config?: VoyageEmbeddingConfig) {
    // Filter out undefined values so they don't override defaults (especially env var fallback)
    const cleanConfig: Partial<VoyageEmbeddingConfig> = {};
    if (config) {
      for (const [key, value] of Object.entries(config)) {
        if (value !== undefined) {
          (cleanConfig as Record<string, unknown>)[key] = value;
        }
      }
    }
    this.config = { ...DEFAULT_CONFIG, ...cleanConfig };

    if (!this.config.apiKey) {
      throw new Error('Voyage API key is required. Set VOYAGE_API_KEY environment variable or pass apiKey in config.');
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateBatchEmbeddings([text]);
    return embeddings[0];
  }

  /**
   * Generate embeddings for multiple texts (more efficient)
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      const batchResults = await this.callVoyageAPI(batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Call Voyage AI API
   */
  private async callVoyageAPI(texts: string[]): Promise<number[][]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: texts,
          model: this.config.model,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Voyage API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as {
        data: Array<{ embedding: number[]; index: number }>;
        model: string;
        usage: { total_tokens: number };
      };

      // Sort by index to maintain order
      const sorted = data.data.sort((a, b) => a.index - b.index);
      return sorted.map(item => item.embedding);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  getDimension(): number {
    // Voyage model dimensions (from https://docs.voyageai.com/docs/embeddings)
    // voyage-4 series (recommended): all default to 1024, support 256/512/1024/2048
    // voyage-3 series (legacy): voyage-3 is 1024, voyage-3-lite is 512
    const modelDimensions: Record<string, number> = {
      // Current recommended models (voyage-4 series)
      'voyage-4-large': 1024,    // Best retrieval quality
      'voyage-4': 1024,          // Optimized general-purpose
      'voyage-4-lite': 1024,     // Optimized for latency/cost
      'voyage-4-nano': 1024,     // Open-weight model
      // Domain-specific models
      'voyage-code-3': 1024,     // Code retrieval (best for code)
      'voyage-finance-2': 1024,  // Finance domain
      'voyage-law-2': 1024,      // Legal domain
      // Legacy models (still supported but recommend migrating)
      'voyage-3-large': 1024,
      'voyage-3.5': 1024,
      'voyage-3.5-lite': 1024,
      'voyage-3': 1024,
      'voyage-3-lite': 512,      // NOTE: 512 not 1024!
      'voyage-multilingual-2': 1024,
      'voyage-large-2-instruct': 1024,
      'voyage-large-2': 1536,
      'voyage-code-2': 1536,
      'voyage-2': 1024,
    };
    return modelDimensions[this.config.model] || this.config.dimension;
  }

  /**
   * Get the model being used
   */
  getModel(): string {
    return this.config.model;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
